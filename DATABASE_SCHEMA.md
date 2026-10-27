# AgroAI - Neon Postgres Database Schema

> **Current as of 27 Oct 2026.** The old `intrusion_alerts` table (simulated
> predator/fire alerts) was removed in migration
> `0003_remove_simulated_alerts.sql`. Live detections live in
> `camera_detections`, and confirmed human/animal events raise rows in
> `camera_alerts` (migration `0004_first_wolfsbane.sql`).

## 1. Drizzle ORM Schema (`src/db/schema.ts`)

```typescript
import {
  boolean, doublePrecision, index, integer, jsonb,
  pgTable, serial, text, timestamp,
} from 'drizzle-orm/pg-core';

// 1. Farmers / Users (name + hashed PIN login)
export const farmers = pgTable('farmers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  phone: text('phone').unique(), // optional
  pinHash: text('pin_hash').notNull().default(''), // scrypt$salt$hash
  language: text('language').default('en').notNull(),
  pushSubscription: jsonb('push_subscription'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Farmlands (GeoJSON polygon + centroid + area)
export const farmlands = pgTable('farmlands', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id').references(() => farmers.id),
  name: text('name').notNull(),
  polygonGeoJson: jsonb('polygon_geojson').notNull(), // [lat, lng][]
  centroidLat: doublePrecision('centroid_lat').notNull(),
  centroidLng: doublePrecision('centroid_lng').notNull(),
  areaAcres: doublePrecision('area_acres'), // also shown as ha / m²
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. Crops
export const crops = pgTable('crops', {
  id: serial('id').primaryKey(),
  farmlandId: integer('farmland_id').references(() => farmlands.id),
  cropName: text('crop_name').notNull(),
  sowingDate: timestamp('sowing_date').notNull(),
  growthStage: text('growth_stage').default('Seedling'),
  durationDays: integer('duration_days'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. Live camera sessions (phone pairing + latest overlay state)
export const cameraSessions = pgTable('camera_sessions', {
  id: serial('id').primaryKey(),
  farmerId: integer('farmer_id').notNull().references(() => farmers.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(), // random pairing token
  name: text('name').notNull(),
  status: text('status').notNull().default('waiting'), // waiting | live | ended
  aiEnabled: boolean('ai_enabled').notNull().default(false),
  deviceLabel: text('device_label'),
  lat: doublePrecision('lat'), // phone GPS
  lng: doublePrecision('lng'),
  latestFrame: text('latest_frame'), // data:image/jpeg;base64,… (newest only)
  frameUpdatedAt: timestamp('frame_updated_at'),
  frameWidth: integer('frame_width'),
  frameHeight: integer('frame_height'),
  latestDetections: jsonb('latest_detections'), // FrameDetection[] overlay state
  motion: doublePrecision('motion').notNull().default(0), // 0–1
  totalDetections: integer('total_detections').notNull().default(0),
  startedAt: timestamp('started_at'),
  lastSeenAt: timestamp('last_seen_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [index('camera_sessions_farmer_idx').on(table.farmerId)]);

// 5. Detection events (one row per new *confirmed* human/animal track)
export const cameraDetections = pgTable('camera_detections', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull()
    .references(() => cameraSessions.id, { onDelete: 'cascade' }),
  farmerId: integer('farmer_id').notNull().references(() => farmers.id, { onDelete: 'cascade' }),
  label: text('label').notNull(), // "Person", "Elephant", "Wild boar"
  emoji: text('emoji').notNull().default('🔎'),
  category: text('category').notNull().default('other'), // person | animal (legacy rows: vehicle | motion | other)
  confidence: doublePrecision('confidence'),
  trackId: text('track_id'), // p1-abc12 — per-run suffix avoids reload dedupe
  box: jsonb('box'), // normalised [x, y, w, h]
  direction: text('direction'),
  speed: doublePrecision('speed'),
  confirmed: boolean('confirmed').notNull().default(false), // only confirmed rows are stored/shown
  source: text('source').notNull().default('on-device'), // on-device | groq
  verified: boolean('verified').notNull().default(false), // Groq agreed with the label
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('camera_detections_session_idx').on(table.sessionId, table.createdAt),
  index('camera_detections_farmer_idx').on(table.farmerId),
]);

// 6. Camera alarms (one row per confirmed human/animal event)
export const cameraAlerts = pgTable('camera_alerts', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull()
    .references(() => cameraSessions.id, { onDelete: 'cascade' }),
  farmerId: integer('farmer_id').notNull().references(() => farmers.id, { onDelete: 'cascade' }),
  detectionId: integer('detection_id')
    .references(() => cameraDetections.id, { onDelete: 'set null' }),
  label: text('label').notNull(), // "Person", "Wild boar"
  emoji: text('emoji').notNull().default('🔔'),
  category: text('category').notNull().default('animal'), // person | animal
  confidence: doublePrecision('confidence'),
  message: text('message').notNull(), // "Human detected at Field camera 1"
  source: text('source').notNull().default('on-device'), // on-device | groq
  verified: boolean('verified').notNull().default(false),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  acknowledgedAt: timestamp('acknowledged_at'), // null = unread banner
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('camera_alerts_farmer_idx').on(table.farmerId, table.createdAt),
  index('camera_alerts_session_idx').on(table.sessionId, table.createdAt),
]);

// 7. Weekly AI Crop Reports
export const weeklyReports = pgTable('weekly_reports', {
  id: serial('id').primaryKey(),
  cropId: integer('crop_id').references(() => crops.id),
  weatherSummary: jsonb('weather_summary').notNull(),
  aiActionPlan: text('ai_action_plan').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## 2. Spatial calculations

Farm area and centroid are computed in TypeScript (`src/lib/geo.ts`) from the
drawn polygon. Area is stored in acres; the UI also shows hectares and m².

Camera-to-field proximity uses the Haversine formula in
`src/lib/camera-queries.ts`:

```text
distance = 2 * 6371 * asin(sqrt(
  sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2)
))
```

The nearest saved farm, distance and compass direction are attached to each
camera session for the “Field context” panel.

## 3. Migrations

| Migration | Purpose |
| --- | --- |
| `0002_live_camera_tables.sql` | Creates `camera_sessions` + `camera_detections`, indexes and FKs. |
| `0003_remove_simulated_alerts.sql` | Drops the old `intrusion_alerts` table. |
| `0004_first_wolfsbane.sql` | Adds `camera_alerts`; adds `confirmed` / `source` / `verified` to `camera_detections`. |

Apply with `npm run db:push` (uses the direct `DATABASE_URL_UNPOOLED`
connection). `drizzle-kit generate` produces SQL; never migrate over the pooled
PgBouncer connection.

## 4. Alarm rules

- A detection row is written **only** when the phone marks the track confirmed
  (3 hits at ≥ 0.42, or 2 hits at ≥ 0.82) and the class is `person` or `animal`.
- Tracks are deduplicated per session over a 15-minute window using the track id
  (`p1-abc12` — the suffix changes on every phone reload).
- An alarm row is created at most once per **8 seconds per session**; the window
  is evaluated with SQL `now()` so app/Neon clock skew cannot suppress or repeat
  alarms.
- `POST /api/camera/alerts` sets `acknowledged_at` (one id or `{ "all": true }`).
  Acknowledging never deletes the detection history.
- The Groq verifier may later relabel the species (`source = 'groq'`,
  `verified = true`) or retract the track and its alarm when it sees no human or
  animal in the frame.

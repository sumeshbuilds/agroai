# AgroAI - Neon Postgres Database Schema

> **Current as of 26 Oct 2026.** The old `intrusion_alerts` table (simulated
> predator/fire alerts) was removed in migration
> `0003_remove_simulated_alerts.sql`. Live detections now live in
> `camera_detections`.

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

// 5. Detection events (one row per new tracked object, not per frame)
export const cameraDetections = pgTable('camera_detections', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull()
    .references(() => cameraSessions.id, { onDelete: 'cascade' }),
  farmerId: integer('farmer_id').notNull().references(() => farmers.id, { onDelete: 'cascade' }),
  label: text('label').notNull(), // "Person", "Elephant", "Movement"
  emoji: text('emoji').notNull().default('🔎'),
  category: text('category').notNull().default('other'), // person | animal | vehicle | motion | other
  confidence: doublePrecision('confidence'),
  trackId: text('track_id'),
  box: jsonb('box'), // normalised [x, y, w, h]
  direction: text('direction'),
  speed: doublePrecision('speed'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('camera_detections_session_idx').on(table.sessionId, table.createdAt),
  index('camera_detections_farmer_idx').on(table.farmerId),
]);

// 6. Weekly AI Crop Reports
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

Apply with `npm run db:push` (uses the direct `DATABASE_URL_UNPOOLED`
connection). `drizzle-kit generate` produces SQL; never migrate over the pooled
PgBouncer connection.

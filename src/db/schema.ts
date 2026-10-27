import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import type { DetectionBox, FrameDetection } from "@/lib/camera";
import type { GeoPoint } from "@/lib/types";

// 1. Farmers / Users Table
// Login is name + PIN. The PIN is never stored in plain text — `pinHash` holds
// a salted scrypt digest (`scrypt$<salt>$<hash>`).
export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  phone: text("phone").unique(),
  pinHash: text("pin_hash").notNull().default(""),
  language: text("language").default("en").notNull(),
  pushSubscription: jsonb("push_subscription"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 2. Farmlands Table (stores the drawn polygon + centroid)
export const farmlands = pgTable("farmlands", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").references(() => farmers.id),
  name: text("name").notNull(),
  polygonGeoJson: jsonb("polygon_geojson").$type<GeoPoint[]>().notNull(),
  centroidLat: doublePrecision("centroid_lat").notNull(),
  centroidLng: doublePrecision("centroid_lng").notNull(),
  areaAcres: doublePrecision("area_acres"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 3. Crops Table
export const crops = pgTable("crops", {
  id: serial("id").primaryKey(),
  farmlandId: integer("farmland_id").references(() => farmlands.id),
  cropName: text("crop_name").notNull(),
  sowingDate: timestamp("sowing_date").notNull(),
  growthStage: text("growth_stage").default("Seedling"),
  /** Expected crop duration from sowing to harvest, in days. */
  durationDays: integer("duration_days"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// 4. Live camera sessions
// A phone opens /camera?token=… and streams tiny JPEG frames + detections
// without needing the farmer's login cookie. The random token scopes it.
export const cameraSessions = pgTable(
  "camera_sessions",
  {
    id: serial("id").primaryKey(),
    farmerId: integer("farmer_id")
      .notNull()
      .references(() => farmers.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    name: text("name").notNull(),
    /** waiting → live → ended */
    status: text("status").notNull().default("waiting"),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    deviceLabel: text("device_label"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Latest JPEG as a `data:image/jpeg;base64,…` string. */
    latestFrame: text("latest_frame"),
    frameUpdatedAt: timestamp("frame_updated_at"),
    frameWidth: integer("frame_width"),
    frameHeight: integer("frame_height"),
    /** Last detections reported with the latest frame (for live overlays). */
    latestDetections: jsonb("latest_detections").$type<FrameDetection[]>(),
    /** 0–1 share of pixels that changed in the latest frame. */
    motion: doublePrecision("motion").notNull().default(0),
    totalDetections: integer("total_detections").notNull().default(0),
    startedAt: timestamp("started_at"),
    lastSeenAt: timestamp("last_seen_at"),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("camera_sessions_farmer_idx").on(table.farmerId)],
);

// 5. Detection events
// One row per new tracked object, not per frame, so the feed stays readable.
export const cameraDetections = pgTable(
  "camera_detections",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => cameraSessions.id, { onDelete: "cascade" }),
    farmerId: integer("farmer_id")
      .notNull()
      .references(() => farmers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    emoji: text("emoji").notNull().default("🔎"),
    category: text("category").notNull().default("other"),
    confidence: doublePrecision("confidence"),
    trackId: text("track_id"),
    box: jsonb("box").$type<DetectionBox>(),
    direction: text("direction"),
    speed: doublePrecision("speed"),
    /** Only confirmed human/animal tracks become feed rows. */
    confirmed: boolean("confirmed").notNull().default(false),
    /** `on-device` (tracker) or `groq` (vision verifier). */
    source: text("source").notNull().default("on-device"),
    /** True once the Groq vision verifier agreed with the label. */
    verified: boolean("verified").notNull().default(false),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("camera_detections_session_idx").on(table.sessionId, table.createdAt),
    index("camera_detections_farmer_idx").on(table.farmerId),
  ],
);

// 6. Camera alarms
// One row per confirmed human/animal track. The dashboard polls the unread
// alarms and shows a banner + optional siren; acknowledging hides the banner
// without deleting the detection history.
export const cameraAlerts = pgTable(
  "camera_alerts",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => cameraSessions.id, { onDelete: "cascade" }),
    farmerId: integer("farmer_id")
      .notNull()
      .references(() => farmers.id, { onDelete: "cascade" }),
    detectionId: integer("detection_id").references(() => cameraDetections.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    emoji: text("emoji").notNull().default("🔔"),
    category: text("category").notNull().default("animal"),
    confidence: doublePrecision("confidence"),
    message: text("message").notNull(),
    source: text("source").notNull().default("on-device"),
    verified: boolean("verified").notNull().default(false),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    acknowledgedAt: timestamp("acknowledged_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("camera_alerts_farmer_idx").on(table.farmerId, table.createdAt),
    index("camera_alerts_session_idx").on(table.sessionId, table.createdAt),
  ],
);

// 7. Weekly AI Crop Reports
export const weeklyReports = pgTable("weekly_reports", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").references(() => crops.id),
  weatherSummary: jsonb("weather_summary").notNull(),
  aiActionPlan: text("ai_action_plan").notNull(), // Markdown generated by Gemini
  createdAt: timestamp("created_at").defaultNow(),
});

export type Farmer = typeof farmers.$inferSelect;
export type Farmland = typeof farmlands.$inferSelect;
export type Crop = typeof crops.$inferSelect;
export type CameraSession = typeof cameraSessions.$inferSelect;
export type CameraDetection = typeof cameraDetections.$inferSelect;
export type CameraAlert = typeof cameraAlerts.$inferSelect;
export type WeeklyReport = typeof weeklyReports.$inferSelect;

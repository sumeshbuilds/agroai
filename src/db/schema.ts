import {
  pgTable,
  serial,
  integer,
  text,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

import type { GeoPoint } from "@/lib/types";

// 1. Farmers / Users Table
export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
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
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// 4. Animal / Hazard Intrusion Logs
export const intrusionAlerts = pgTable("intrusion_alerts", {
  id: serial("id").primaryKey(),
  animalType: text("animal_type").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  source: text("source").default("FOREST_SATELLITE_GRID"),
  severity: text("severity").default("HIGH"),
  createdAt: timestamp("created_at").defaultNow(),
});

// 5. Weekly AI Crop Reports
export const weeklyReports = pgTable("weekly_reports", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").references(() => crops.id),
  weatherSummary: jsonb("weather_summary").notNull(),
  aiActionPlan: text("ai_action_plan").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Farmer = typeof farmers.$inferSelect;
export type Farmland = typeof farmlands.$inferSelect;
export type Crop = typeof crops.$inferSelect;
export type IntrusionAlert = typeof intrusionAlerts.$inferSelect;
export type WeeklyReport = typeof weeklyReports.$inferSelect;

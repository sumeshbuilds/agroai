/**
 * Shared types used by both the API routes (server) and the UI (client).
 * This module must stay free of server-only imports so it can be used anywhere.
 */

/** A geographic point stored as `[latitude, longitude]`. */
export type GeoPoint = [number, number];

export type Language = "en" | "hi" | "or";

export interface FarmerDTO {
  id: number;
  name: string;
  language: Language | string;
  createdAt: string | null;
  /** True when the farmer has at least one saved farm. */
  hasFarm?: boolean;
  /** True when the farmer has at least one active crop. */
  hasCrop?: boolean;
}

export interface FarmDTO {
  id: number;
  farmerId: number | null;
  name: string;
  points: GeoPoint[];
  centroidLat: number;
  centroidLng: number;
  areaAcres: number | null;
  createdAt: string | null;
}

export interface CropDTO {
  id: number;
  farmlandId: number | null;
  farmlandName: string | null;
  cropName: string;
  sowingDate: string;
  growthStage: string | null;
  /** Expected duration from sowing to harvest, in days. */
  durationDays: number | null;
  isActive: boolean | null;
  ageDays: number;
  createdAt: string | null;
}

export interface AlertDTO {
  id: number;
  animalType: string;
  lat: number;
  lng: number;
  source: string | null;
  severity: string | null;
  createdAt: string | null;
  /** Distance from the query point / farm, when requested. */
  distanceKm?: number;
  /** Compass direction from the farm towards the sighting. */
  direction?: string;
}

export interface AffectedFarmDTO {
  farmId: number;
  name: string;
  distanceKm: number;
  direction: string;
  bearingDegrees: number;
}

export interface WeeklyReportDTO {
  id: number;
  cropId: number | null;
  cropName: string | null;
  aiActionPlan: string;
  weatherSummary: unknown;
  createdAt: string | null;
  /** Where the advisory came from. */
  source?: "gemini" | "fallback";
  model?: string;
  note?: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

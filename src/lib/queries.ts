import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  crops,
  farmlands,
  farmers,
  intrusionAlerts,
  weeklyReports,
  type Crop,
  type Farmland,
  type IntrusionAlert,
  type WeeklyReport,
  type Database,
} from "@/db";
import {
  bearingDegrees,
  compassDirection,
  polygonAreaAcres,
  polygonCentroid,
} from "./geo";
import type {
  AffectedFarmDTO,
  AlertDTO,
  CropDTO,
  FarmDTO,
  GeoPoint,
  WeeklyReportDTO,
} from "./types";

const MS_PER_DAY = 86_400_000;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function toFarmDTO(farm: Farmland): FarmDTO {
  return {
    id: farm.id,
    name: farm.name,
    points: (farm.polygonGeoJson ?? []) as GeoPoint[],
    centroidLat: farm.centroidLat,
    centroidLng: farm.centroidLng,
    areaAcres: farm.areaAcres,
    createdAt: toIso(farm.createdAt),
  };
}

export function toCropDTO(crop: Crop & { farmlandName?: string | null }): CropDTO {
  const sowing = crop.sowingDate ? new Date(crop.sowingDate) : null;
  const ageDays = sowing
    ? Math.max(0, Math.floor((Date.now() - sowing.getTime()) / MS_PER_DAY))
    : 0;

  return {
    id: crop.id,
    farmlandId: crop.farmlandId,
    farmlandName: crop.farmlandName ?? null,
    cropName: crop.cropName,
    sowingDate: toIso(crop.sowingDate) ?? new Date().toISOString(),
    growthStage: crop.growthStage,
    isActive: crop.isActive,
    ageDays,
    createdAt: toIso(crop.createdAt),
  };
}

export function toAlertDTO(
  alert: IntrusionAlert,
  distanceKm?: number,
  direction?: string,
): AlertDTO {
  return {
    id: alert.id,
    animalType: alert.animalType,
    lat: alert.lat,
    lng: alert.lng,
    source: alert.source,
    severity: alert.severity,
    createdAt: toIso(alert.createdAt),
    distanceKm,
    direction,
  };
}

function toReportDTO(
  report: WeeklyReport & { cropName?: string | null },
  extra?: { source?: "gemini" | "fallback"; model?: string; note?: string },
): WeeklyReportDTO {
  return {
    id: report.id,
    cropId: report.cropId,
    cropName: report.cropName ?? null,
    aiActionPlan: report.aiActionPlan,
    weatherSummary: report.weatherSummary,
    createdAt: toIso(report.createdAt),
    ...extra,
  };
}

/** Returns the first farmer, creating a demo profile on an empty database. */
export async function getOrCreateDemoFarmer(db: Database) {
  const existing = await db
    .select()
    .from(farmers)
    .orderBy(asc(farmers.id))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const inserted = await db
    .insert(farmers)
    .values({ name: "Demo Farmer", phone: "demo-0001", language: "en" })
    .returning();

  return inserted[0];
}

// ---------------------------------------------------------------------------
// Farms
// ---------------------------------------------------------------------------

export async function listFarmlands(db: Database): Promise<FarmDTO[]> {
  const rows = await db.select().from(farmlands).orderBy(desc(farmlands.createdAt));
  return rows.map(toFarmDTO);
}

export async function getFarmland(
  db: Database,
  id: number,
): Promise<FarmDTO | null> {
  const rows = await db
    .select()
    .from(farmlands)
    .where(eq(farmlands.id, id))
    .limit(1);

  return rows.length > 0 ? toFarmDTO(rows[0]) : null;
}

export async function createFarmland(
  db: Database,
  input: { name: string; points: GeoPoint[]; farmerId?: number },
): Promise<FarmDTO> {
  const farmer = await getOrCreateDemoFarmer(db);
  const centroid = polygonCentroid(input.points);
  const areaAcres = polygonAreaAcres(input.points);

  const inserted = await db
    .insert(farmlands)
    .values({
      farmerId: input.farmerId ?? farmer.id,
      name: input.name,
      polygonGeoJson: input.points,
      centroidLat: centroid.lat,
      centroidLng: centroid.lng,
      areaAcres,
    })
    .returning();

  return toFarmDTO(inserted[0]);
}

/**
 * Haversine proximity search (no PostGIS required). Returns every farm whose
 * centroid lies within `radiusKm` of the given point, nearest first.
 */
export async function findFarmsWithinRadius(
  db: Database,
  lat: number,
  lng: number,
  radiusKm: number,
): Promise<AffectedFarmDTO[]> {
  const distance = sql<number>`(
    6371 * acos(
      least(1.0, greatest(-1.0,
        cos(radians(${lat})) * cos(radians(${farmlands.centroidLat})) *
        cos(radians(${farmlands.centroidLng}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${farmlands.centroidLat}))
      ))
    )
  )`;

  const rows = await db
    .select({
      id: farmlands.id,
      name: farmlands.name,
      centroidLat: farmlands.centroidLat,
      centroidLng: farmlands.centroidLng,
      distanceKm: distance,
    })
    .from(farmlands)
    .where(sql`${distance} <= ${radiusKm}`)
    .orderBy(asc(distance));

  return rows.map((row) => {
    const bearing = bearingDegrees(
      row.centroidLat,
      row.centroidLng,
      lat,
      lng,
    );
    return {
      farmId: row.id,
      name: row.name,
      distanceKm: Number(row.distanceKm),
      direction: compassDirection(bearing),
      bearingDegrees: bearing,
    };
  });
}

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------

export async function listCrops(db: Database): Promise<CropDTO[]> {
  const rows = await db
    .select({ crop: crops, farmlandName: farmlands.name })
    .from(crops)
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .orderBy(desc(crops.createdAt));

  return rows.map((row) => toCropDTO({ ...row.crop, farmlandName: row.farmlandName }));
}

export async function createCrop(
  db: Database,
  input: {
    cropName: string;
    sowingDate: Date;
    farmlandId?: number | null;
    growthStage?: string;
  },
): Promise<CropDTO> {
  const inserted = await db
    .insert(crops)
    .values({
      cropName: input.cropName,
      sowingDate: input.sowingDate,
      farmlandId: input.farmlandId ?? null,
      growthStage: input.growthStage ?? "Seedling",
      isActive: true,
    })
    .returning();

  const farmlandName = input.farmlandId
    ? (await getFarmland(db, input.farmlandId))?.name ?? null
    : null;

  return toCropDTO({ ...inserted[0], farmlandName });
}

export async function getCropWithFarm(db: Database, cropId: number) {
  const rows = await db
    .select({ crop: crops, farm: farmlands })
    .from(crops)
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(eq(crops.id, cropId))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

export async function listActiveCropsWithFarm(db: Database) {
  const rows = await db
    .select({ crop: crops, farm: farmlands })
    .from(crops)
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(eq(crops.isActive, true))
    .orderBy(desc(crops.createdAt));

  return rows;
}

// ---------------------------------------------------------------------------
// Intrusion alerts
// ---------------------------------------------------------------------------

export async function listAlerts(
  db: Database,
  options: { limit?: number; lat?: number; lng?: number; radiusKm?: number } = {},
): Promise<AlertDTO[]> {
  const limit = options.limit ?? 20;

  if (options.lat !== undefined && options.lng !== undefined) {
    const distance = sql<number>`(
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(${options.lat})) * cos(radians(${intrusionAlerts.lat})) *
          cos(radians(${intrusionAlerts.lng}) - radians(${options.lng})) +
          sin(radians(${options.lat})) * sin(radians(${intrusionAlerts.lat}))
        ))
      )
    )`;

    const radiusClause =
      options.radiusKm !== undefined
        ? sql`${distance} <= ${options.radiusKm}`
        : undefined;

    const rows = await db
      .select({
        id: intrusionAlerts.id,
        animalType: intrusionAlerts.animalType,
        lat: intrusionAlerts.lat,
        lng: intrusionAlerts.lng,
        source: intrusionAlerts.source,
        severity: intrusionAlerts.severity,
        createdAt: intrusionAlerts.createdAt,
        distanceKm: distance,
      })
      .from(intrusionAlerts)
      .where(radiusClause)
      .orderBy(asc(distance))
      .limit(limit);

    return rows.map((row) =>
      toAlertDTO(
        row as unknown as IntrusionAlert,
        Number(row.distanceKm),
        compassDirection(
          bearingDegrees(options.lat!, options.lng!, row.lat, row.lng),
        ),
      ),
    );
  }

  const rows = await db
    .select()
    .from(intrusionAlerts)
    .orderBy(desc(intrusionAlerts.createdAt))
    .limit(limit);

  return rows.map((row) => toAlertDTO(row));
}

export async function createIntrusionAlert(
  db: Database,
  input: {
    animalType: string;
    lat: number;
    lng: number;
    source?: string;
    severity?: string;
  },
): Promise<AlertDTO> {
  const inserted = await db
    .insert(intrusionAlerts)
    .values({
      animalType: input.animalType,
      lat: input.lat,
      lng: input.lng,
      source: input.source ?? "SIMULATED_SIGHTING",
      severity: input.severity ?? "HIGH",
    })
    .returning();

  return toAlertDTO(inserted[0]);
}

// ---------------------------------------------------------------------------
// Weekly reports
// ---------------------------------------------------------------------------

export async function listReports(
  db: Database,
  options: { limit?: number; cropId?: number } = {},
): Promise<WeeklyReportDTO[]> {
  const limit = options.limit ?? 20;

  const rows = await db
    .select({ report: weeklyReports, cropName: crops.cropName })
    .from(weeklyReports)
    .leftJoin(crops, eq(weeklyReports.cropId, crops.id))
    .where(
      options.cropId ? eq(weeklyReports.cropId, options.cropId) : undefined,
    )
    .orderBy(desc(weeklyReports.createdAt))
    .limit(limit);

  return rows.map((row) =>
    toReportDTO({ ...row.report, cropName: row.cropName }),
  );
}

export async function createReport(
  db: Database,
  input: {
    cropId: number;
    weatherSummary: unknown;
    aiActionPlan: string;
    cropName?: string | null;
  },
  extra?: { source?: "gemini" | "fallback"; model?: string; note?: string },
): Promise<WeeklyReportDTO> {
  const inserted = await db
    .insert(weeklyReports)
    .values({
      cropId: input.cropId,
      weatherSummary: input.weatherSummary,
      aiActionPlan: input.aiActionPlan,
    })
    .returning();

  return toReportDTO(
    { ...inserted[0], cropName: input.cropName ?? null },
    extra,
  );
}

/** Small helper so routes can resolve many crops by id in one query. */
export async function getCropsByIds(db: Database, ids: number[]) {
  if (ids.length === 0) return [];
  return db.select().from(crops).where(inArray(crops.id, ids));
}

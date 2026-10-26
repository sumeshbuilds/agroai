import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  crops,
  farmlands,
  farmers,
  intrusionAlerts,
  weeklyReports,
  type Crop,
  type Farmland,
  type Farmer,
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
    farmerId: farm.farmerId,
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
    durationDays: crop.durationDays ?? null,
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

// ---------------------------------------------------------------------------
// Farms
// ---------------------------------------------------------------------------

/**
 * Lists farms. Pass `farmerId` to scope the result to one signed-in farmer;
 * omit it only from server-side admin/cron code.
 */
export async function listFarmlands(
  db: Database,
  farmerId?: number,
): Promise<FarmDTO[]> {
  const rows = await db
    .select()
    .from(farmlands)
    .where(farmerId === undefined ? undefined : eq(farmlands.farmerId, farmerId))
    .orderBy(desc(farmlands.createdAt));
  return rows.map(toFarmDTO);
}

/**
 * Farms that can be attached to a new account: either drawn during onboarding
 * (no owner yet), or created before accounts existed (owned by the legacy
 * "Demo Farmer", whose PIN hash is empty).
 */
export async function listAvailableFarmlands(db: Database): Promise<FarmDTO[]> {
  const rows = await db
    .select({ farm: farmlands })
    .from(farmlands)
    .leftJoin(farmers, eq(farmlands.farmerId, farmers.id))
    .where(or(isNull(farmlands.farmerId), eq(farmers.pinHash, "")))
    .orderBy(desc(farmlands.createdAt));

  return rows.map((row) => toFarmDTO(row.farm));
}

export async function getFarmland(
  db: Database,
  id: number,
  farmerId?: number,
): Promise<FarmDTO | null> {
  const rows = await db
    .select()
    .from(farmlands)
    .where(
      farmerId === undefined
        ? eq(farmlands.id, id)
        : and(eq(farmlands.id, id), eq(farmlands.farmerId, farmerId)),
    )
    .limit(1);

  return rows.length > 0 ? toFarmDTO(rows[0]) : null;
}

export async function createFarmland(
  db: Database,
  input: { name: string; points: GeoPoint[]; farmerId?: number | null },
): Promise<FarmDTO> {
  const centroid = polygonCentroid(input.points);
  const areaAcres = polygonAreaAcres(input.points);

  const inserted = await db
    .insert(farmlands)
    .values({
      farmerId: input.farmerId ?? null,
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
 * Claims an unowned (or legacy pre-auth) farm for a new farmer. Returns null
 * when the farm has already been claimed by a real account.
 */
export async function claimFarmland(
  db: Database,
  farmId: number,
  farmerId: number,
): Promise<FarmDTO | null> {
  const rows = await db
    .update(farmlands)
    .set({ farmerId })
    .where(
      sql`${farmlands.id} = ${farmId} and (${farmlands.farmerId} is null or exists (
        select 1 from ${farmers}
        where ${farmers.id} = ${farmlands.farmerId} and ${farmers.pinHash} = ''
      ))`,
    )
    .returning();

  return rows.length > 0 ? toFarmDTO(rows[0]) : null;
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
  farmerId?: number,
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

  const radiusClause = sql`${distance} <= ${radiusKm}`;
  const whereClause =
    farmerId === undefined
      ? radiusClause
      : and(radiusClause, eq(farmlands.farmerId, farmerId));

  const rows = await db
    .select({
      id: farmlands.id,
      name: farmlands.name,
      centroidLat: farmlands.centroidLat,
      centroidLng: farmlands.centroidLng,
      distanceKm: distance,
    })
    .from(farmlands)
    .where(whereClause)
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

export async function listCrops(
  db: Database,
  farmerId?: number,
): Promise<CropDTO[]> {
  const rows = await db
    .select({ crop: crops, farmlandName: farmlands.name })
    .from(crops)
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(farmerId === undefined ? undefined : eq(farmlands.farmerId, farmerId))
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
    durationDays?: number | null;
  },
): Promise<CropDTO> {
  const inserted = await db
    .insert(crops)
    .values({
      cropName: input.cropName,
      sowingDate: input.sowingDate,
      farmlandId: input.farmlandId ?? null,
      growthStage: input.growthStage ?? "Seedling",
      durationDays: input.durationDays ?? null,
      isActive: true,
    })
    .returning();

  const farmlandName = input.farmlandId
    ? (await getFarmland(db, input.farmlandId))?.name ?? null
    : null;

  return toCropDTO({ ...inserted[0], farmlandName });
}

export async function getCropWithFarm(
  db: Database,
  cropId: number,
  farmerId?: number,
) {
  const rows = await db
    .select({ crop: crops, farm: farmlands })
    .from(crops)
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(
      farmerId === undefined
        ? eq(crops.id, cropId)
        : and(eq(crops.id, cropId), eq(farmlands.farmerId, farmerId)),
    )
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

export async function listActiveCropsWithFarm(
  db: Database,
  farmerId?: number,
) {
  const rows = await db
    .select({ crop: crops, farm: farmlands })
    .from(crops)
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(
      farmerId === undefined
        ? eq(crops.isActive, true)
        : and(eq(crops.isActive, true), eq(farmlands.farmerId, farmerId)),
    )
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
  options: { limit?: number; cropId?: number; farmerId?: number } = {},
): Promise<WeeklyReportDTO[]> {
  const limit = options.limit ?? 20;

  const filters = [];
  if (options.cropId) filters.push(eq(weeklyReports.cropId, options.cropId));
  if (options.farmerId !== undefined) {
    filters.push(eq(farmlands.farmerId, options.farmerId));
  }

  const rows = await db
    .select({ report: weeklyReports, cropName: crops.cropName })
    .from(weeklyReports)
    .leftJoin(crops, eq(weeklyReports.cropId, crops.id))
    .leftJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
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

// ---------------------------------------------------------------------------
// Farmers / auth helpers
// ---------------------------------------------------------------------------

export async function findFarmerByName(
  db: Database,
  name: string,
): Promise<Farmer | null> {
  const key = name.trim().toLowerCase();
  const rows = await db
    .select()
    .from(farmers)
    .where(sql`lower(${farmers.name}) = ${key}`)
    .limit(1);

  return rows[0] ?? null;
}

export async function getFarmerById(
  db: Database,
  farmerId: number,
): Promise<Farmer | null> {
  const rows = await db
    .select()
    .from(farmers)
    .where(eq(farmers.id, farmerId))
    .limit(1);

  return rows[0] ?? null;
}

export async function createFarmer(
  db: Database,
  input: { name: string; pinHash: string },
): Promise<Farmer> {
  const inserted = await db
    .insert(farmers)
    .values({
      name: input.name,
      pinHash: input.pinHash,
      language: "en",
    })
    .returning();

  return inserted[0];
}

export async function getFarmerSetup(
  db: Database,
  farmerId: number,
): Promise<{ hasFarm: boolean; hasCrop: boolean }> {
  const [farm] = await db
    .select({ id: farmlands.id })
    .from(farmlands)
    .where(eq(farmlands.farmerId, farmerId))
    .limit(1);

  const [crop] = await db
    .select({ id: crops.id })
    .from(crops)
    .innerJoin(farmlands, eq(crops.farmlandId, farmlands.id))
    .where(and(eq(farmlands.farmerId, farmerId), eq(crops.isActive, true)))
    .limit(1);

  return { hasFarm: Boolean(farm), hasCrop: Boolean(crop) };
}

/** Best-effort cleanup used when onboarding fails halfway through. */
export async function deleteFarmerById(db: Database, farmerId: number): Promise<void> {
  await db.delete(farmers).where(eq(farmers.id, farmerId));
}

export async function releaseFarmland(
  db: Database,
  farmId: number,
  farmerId: number,
): Promise<void> {
  await db
    .update(farmlands)
    .set({ farmerId: null })
    .where(and(eq(farmlands.id, farmId), eq(farmlands.farmerId, farmerId)));
}

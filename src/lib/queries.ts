import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  crops,
  farmlands,
  farmers,
  setScope,
  weeklyReports,
  type Crop,
  type Farmland,
  type Farmer,
  type WeeklyReport,
  type Database,
} from "@/db";
import {
  polygonAreaAcres,
  polygonCentroid,
} from "./geo";
import { normalizeSoilInput, type SoilTexture } from "./soil";
import type {
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
  const soil = normalizeSoilInput({
    ph: farm.soilPh,
    ec: farm.soilEc,
    organicCarbon: farm.soilOrganicCarbon,
    nitrogen: farm.soilNitrogen,
    phosphorus: farm.soilPhosphorus,
    potassium: farm.soilPotassium,
    sandPct: farm.soilSandPct,
    clayPct: farm.soilClayPct,
    siltPct: farm.soilSiltPct,
    texture: farm.soilTexture as SoilTexture | null,
    testedAt: farm.soilTestedAt
      ? farm.soilTestedAt instanceof Date
        ? farm.soilTestedAt.toISOString()
        : String(farm.soilTestedAt)
      : null,
  });
  const hasSoil = Object.values(soil).some(
    (value) => value !== null && value !== undefined,
  );

  return {
    id: farm.id,
    farmerId: farm.farmerId,
    name: farm.name,
    points: (farm.polygonGeoJson ?? []) as GeoPoint[],
    centroidLat: farm.centroidLat,
    centroidLng: farm.centroidLng,
    areaAcres: farm.areaAcres,
    soil: hasSoil ? soil : null,
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

function toReportDTO(
  report: WeeklyReport & { cropName?: string | null },
  extra?: { source?: "gemini" | "fallback"; model?: string; note?: string },
): WeeklyReportDTO {
  return {
    id: report.id,
    cropId: report.cropId,
    cropName: report.cropName ?? null,
    aiActionPlan: report.aiActionPlan,
    aiActionPlanOr: report.aiActionPlanOr ?? null,
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
 * Farms this browser drew during onboarding that are still unowned. The scope
 * (RLS + the claim cookie) already limits rows; the extra id filter keeps the
 * intent explicit and guarantees we never return a farm the caller did not
 * create.
 */
export async function listAvailableFarmlands(
  db: Database,
  claimFarmIds: number[],
): Promise<FarmDTO[]> {
  if (claimFarmIds.length === 0) return [];

  const rows = await db
    .select()
    .from(farmlands)
    .where(
      and(isNull(farmlands.farmerId), inArray(farmlands.id, claimFarmIds)),
    )
    .orderBy(desc(farmlands.createdAt));

  return rows.map(toFarmDTO);
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
  input: {
    name: string;
    points: GeoPoint[];
    farmerId?: number | null;
    /** Pre-allocated id, required when inserting an unowned onboarding draft. */
    id?: number;
  },
): Promise<FarmDTO> {
  const centroid = polygonCentroid(input.points);
  const areaAcres = polygonAreaAcres(input.points);

  const inserted = await db
    .insert(farmlands)
    .values({
      ...(input.id ? { id: input.id } : {}),
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

/** Allocates the next farmlands id so an unowned draft can be scoped before insert. */
export async function nextFarmlandId(db: Database): Promise<number> {
  const result = await db.execute(
    sql`select nextval('farmlands_id_seq')::int as id`,
  );
  const row = result.rows[0] as { id: number } | undefined;
  if (!row) throw new Error("Could not allocate a farm id.");
  return row.id;
}

export async function renameFarmland(
  db: Database,
  farmId: number,
  farmerId: number,
  name: string,
): Promise<FarmDTO | null> {
  const rows = await db
    .update(farmlands)
    .set({ name })
    .where(and(eq(farmlands.id, farmId), eq(farmlands.farmerId, farmerId)))
    .returning();

  return rows.length > 0 ? toFarmDTO(rows[0]) : null;
}

export async function deleteFarmlandDeep(
  db: Database,
  farmId: number,
  farmerId: number,
): Promise<boolean> {
  const owned = await db
    .select({ id: farmlands.id })
    .from(farmlands)
    .where(and(eq(farmlands.id, farmId), eq(farmlands.farmerId, farmerId)))
    .limit(1);
  if (owned.length === 0) return false;

  const cropRows = await db
    .select({ id: crops.id })
    .from(crops)
    .where(eq(crops.farmlandId, farmId));
  const cropIds = cropRows.map((row) => row.id);

  if (cropIds.length > 0) {
    await db.delete(weeklyReports).where(inArray(weeklyReports.cropId, cropIds));
    await db.delete(crops).where(inArray(crops.id, cropIds));
  }

  const removed = await db
    .delete(farmlands)
    .where(and(eq(farmlands.id, farmId), eq(farmlands.farmerId, farmerId)))
    .returning({ id: farmlands.id });

  return removed.length > 0;
}

export async function updateFarmSoil(
  db: Database,
  farmId: number,
  farmerId: number,
  soil: {
    ph: number | null;
    ec: number | null;
    organicCarbon: number | null;
    nitrogen: number | null;
    phosphorus: number | null;
    potassium: number | null;
    sandPct: number | null;
    clayPct: number | null;
    siltPct: number | null;
    texture: string | null;
    testedAt: Date | null;
  },
): Promise<FarmDTO | null> {
  const rows = await db
    .update(farmlands)
    .set({
      soilPh: soil.ph,
      soilEc: soil.ec,
      soilOrganicCarbon: soil.organicCarbon,
      soilNitrogen: soil.nitrogen,
      soilPhosphorus: soil.phosphorus,
      soilPotassium: soil.potassium,
      soilSandPct: soil.sandPct,
      soilClayPct: soil.clayPct,
      soilSiltPct: soil.siltPct,
      soilTexture: soil.texture,
      soilTestedAt: soil.testedAt,
    })
    .where(and(eq(farmlands.id, farmId), eq(farmlands.farmerId, farmerId)))
    .returning();

  return rows.length > 0 ? toFarmDTO(rows[0]) : null;
}

/**
 * Claims an unowned (onboarding draft) farm for a newly created farmer. The
 * caller must pass the farm ids this browser created; anything else is refused,
 * so one visitor can never claim another visitor's field.
 */
export async function claimFarmland(
  db: Database,
  farmId: number,
  farmerId: number,
  allowedFarmIds: number[],
): Promise<FarmDTO | null> {
  if (!allowedFarmIds.includes(farmId)) return null;

  const rows = await db
    .update(farmlands)
    .set({ farmerId })
    .where(and(eq(farmlands.id, farmId), isNull(farmlands.farmerId)))
    .returning();

  return rows.length > 0 ? toFarmDTO(rows[0]) : null;
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
    aiActionPlanOr?: string | null;
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
      aiActionPlanOr: input.aiActionPlanOr ?? null,
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
//
// Login and sign-up must read a farmer row before a scope exists, so those
// lookups go through the SECURITY DEFINER functions defined in
// sql/row-level-security.sql. Raw rows come back in snake_case.

interface FarmerDbRow {
  id: number;
  name: string;
  phone: string | null;
  pin_hash: string;
  language: string;
  push_subscription: unknown;
  created_at: Date | string | null;
}

function rowToFarmer(row: FarmerDbRow): Farmer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    pinHash: row.pin_hash,
    language: row.language,
    pushSubscription: row.push_subscription ?? null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
  };
}

export async function findFarmerByName(
  db: Database,
  name: string,
): Promise<Farmer | null> {
  const result = await db.execute(sql`select * from auth_find_farmer(${name.trim()})`);
  const row = result.rows[0] as unknown as FarmerDbRow | undefined;
  return row ? rowToFarmer(row) : null;
}

export async function getFarmerById(
  db: Database,
  farmerId: number,
): Promise<Farmer | null> {
  const result = await db.execute(
    sql`select * from auth_find_farmer_by_id(${farmerId})`,
  );
  const row = result.rows[0] as unknown as FarmerDbRow | undefined;
  return row ? rowToFarmer(row) : null;
}

/** True when the farm is still unowned or held by the legacy demo account. */
export async function isFarmClaimable(
  db: Database,
  farmId: number,
): Promise<boolean> {
  const result = await db.execute(
    sql`select auth_farm_claimable(${farmId}) as claimable`,
  );
  const row = result.rows[0] as { claimable: boolean } | undefined;
  return row?.claimable === true;
}

export async function createFarmer(
  db: Database,
  input: { name: string; pinHash: string },
): Promise<Farmer> {
  // Allocate the id first so the RLS insert policy can verify ownership and the
  // RETURNING clause is allowed to read the new row back.
  const allocated = await db.execute(
    sql`select nextval('farmers_id_seq')::int as id`,
  );
  const id = (allocated.rows[0] as { id: number } | undefined)?.id;
  if (!id) throw new Error("Could not allocate a farmer id.");

  await setScope(db, { farmerId: id });

  const inserted = await db
    .insert(farmers)
    .values({
      id,
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

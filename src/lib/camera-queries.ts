import { randomBytes } from "node:crypto";

import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  cameraDetections,
  cameraSessions,
  farmlands,
  farmers,
  type CameraDetection,
  type CameraSession,
  type Database,
} from "@/db";
import { bearingDegrees, compassDirection, haversineKm } from "./geo";
import {
  clamp01,
  enrichDetection,
  LIVE_WINDOW_MS,
  type CameraDetectionDTO,
  type CameraIngestPayload,
  type CameraSessionDTO,
  type DetectionBox,
  type IngestDetection,
} from "./camera";

const MAX_DETECTIONS_PER_FRAME = 24;
const DEDUPE_WINDOW_MS = 15 * 60 * 1000;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function isLiveSession(session: CameraSession): boolean {
  if (session.status !== "live" || !session.lastSeenAt) return false;
  return Date.now() - new Date(session.lastSeenAt).getTime() <= LIVE_WINDOW_MS;
}

function farmForPoint(
  farms: Array<{ id: number; name: string; centroidLat: number; centroidLng: number }>,
  lat: number | null,
  lng: number | null,
): CameraSessionDTO["farm"] {
  if (lat === null || lng === null) return null;

  let best: CameraSessionDTO["farm"] = null;
  for (const farm of farms) {
    const distanceKm = haversineKm(lat, lng, farm.centroidLat, farm.centroidLng);
    if (!best || distanceKm < best.distanceKm) {
      best = {
        id: farm.id,
        name: farm.name,
        distanceKm,
        direction: compassDirection(
          bearingDegrees(farm.centroidLat, farm.centroidLng, lat, lng),
        ),
      };
    }
  }

  return best;
}

function toCameraSessionDTO(
  session: CameraSession,
  farms: Array<{ id: number; name: string; centroidLat: number; centroidLng: number }> = [],
): CameraSessionDTO {
  const frameVersion = session.frameUpdatedAt
    ? new Date(session.frameUpdatedAt).getTime()
    : null;

  return {
    id: session.id,
    name: session.name,
    token: session.token,
    status: session.status as CameraSessionDTO["status"],
    isLive: isLiveSession(session),
    aiEnabled: session.aiEnabled,
    deviceLabel: session.deviceLabel,
    lat: session.lat,
    lng: session.lng,
    motion: session.motion ?? 0,
    latestDetections: session.latestDetections ?? [],
    totalDetections: session.totalDetections ?? 0,
    frameWidth: session.frameWidth ?? null,
    frameHeight: session.frameHeight ?? null,
    frameUpdatedAt: toIso(session.frameUpdatedAt),
    lastSeenAt: toIso(session.lastSeenAt),
    startedAt: toIso(session.startedAt),
    endedAt: toIso(session.endedAt),
    createdAt: toIso(session.createdAt),
    frameUrl:
      frameVersion !== null
        ? `/api/camera/sessions/${session.id}/frame?v=${frameVersion}`
        : null,
    farm: farmForPoint(farms, session.lat, session.lng),
  };
}

function toDetectionDTO(detection: CameraDetection): CameraDetectionDTO {
  return {
    id: detection.id,
    sessionId: detection.sessionId,
    label: detection.label,
    emoji: detection.emoji,
    category: detection.category as CameraDetectionDTO["category"],
    confidence: detection.confidence,
    trackId: detection.trackId,
    box: detection.box,
    direction: detection.direction,
    speed: detection.speed,
    createdAt: toIso(detection.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createCameraSession(
  db: Database,
  farmerId: number,
  name: string,
): Promise<CameraSessionDTO> {
  const token = randomBytes(12).toString("base64url");
  const inserted = await db
    .insert(cameraSessions)
    .values({ farmerId, token, name })
    .returning();

  return toCameraSessionDTO(inserted[0]);
}

async function farmerFarms(db: Database, farmerId: number) {
  return db
    .select({
      id: farmlands.id,
      name: farmlands.name,
      centroidLat: farmlands.centroidLat,
      centroidLng: farmlands.centroidLng,
    })
    .from(farmlands)
    .where(eq(farmlands.farmerId, farmerId));
}

export async function listCameraSessions(
  db: Database,
  farmerId: number,
  limit = 12,
): Promise<CameraSessionDTO[]> {
  const rows = await db
    .select()
    .from(cameraSessions)
    .where(eq(cameraSessions.farmerId, farmerId))
    .orderBy(desc(cameraSessions.createdAt))
    .limit(limit);

  const farms = await farmerFarms(db, farmerId);
  return rows.map((row) => toCameraSessionDTO(row, farms));
}

export async function getCameraSession(
  db: Database,
  id: number,
  farmerId: number,
): Promise<{ session: CameraSessionDTO; detections: CameraDetectionDTO[] } | null> {
  const rows = await db
    .select()
    .from(cameraSessions)
    .where(
      and(eq(cameraSessions.id, id), eq(cameraSessions.farmerId, farmerId)),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const [farms, detections] = await Promise.all([
    farmerFarms(db, farmerId),
    db
      .select()
      .from(cameraDetections)
      .where(eq(cameraDetections.sessionId, id))
      .orderBy(desc(cameraDetections.createdAt))
      .limit(40),
  ]);

  return {
    session: toCameraSessionDTO(rows[0], farms),
    detections: detections.map(toDetectionDTO),
  };
}

export async function updateCameraSession(
  db: Database,
  id: number,
  farmerId: number,
  input: { status?: "waiting" | "live" | "ended"; name?: string },
): Promise<CameraSessionDTO | null> {
  const values: Partial<typeof cameraSessions.$inferInsert> = {};
  if (input.status) {
    values.status = input.status;
    if (input.status === "ended") values.endedAt = new Date();
    if (input.status === "live") values.endedAt = null;
  }
  if (input.name) values.name = input.name;

  if (Object.keys(values).length === 0) {
    const rows = await db
      .select()
      .from(cameraSessions)
      .where(
        and(eq(cameraSessions.id, id), eq(cameraSessions.farmerId, farmerId)),
      )
      .limit(1);
    return rows.length > 0 ? toCameraSessionDTO(rows[0]) : null;
  }

  const rows = await db
    .update(cameraSessions)
    .set(values)
    .where(
      and(eq(cameraSessions.id, id), eq(cameraSessions.farmerId, farmerId)),
    )
    .returning();

  return rows.length > 0 ? toCameraSessionDTO(rows[0]) : null;
}

/** Public session lookup used by the phone page — scoped only by its token. */
export async function getCameraSessionByToken(
  db: Database,
  token: string,
): Promise<{ session: CameraSessionDTO; farmerName: string } | null> {
  const rows = await db
    .select({ session: cameraSessions, farmerName: farmers.name })
    .from(cameraSessions)
    .innerJoin(farmers, eq(farmers.id, cameraSessions.farmerId))
    .where(eq(cameraSessions.token, token))
    .limit(1);

  if (rows.length === 0) return null;

  return {
    session: toCameraSessionDTO(rows[0].session),
    farmerName: rows[0].farmerName,
  };
}

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

function isValidBox(value: unknown): value is DetectionBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part))
  );
}

function normalisePath(value: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const points = value.filter(
    (point): point is [number, number] =>
      Array.isArray(point) &&
      point.length === 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number" &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
  return points.length > 0
    ? points.slice(-14).map(([x, y]) => [clamp01(x), clamp01(y)])
    : undefined;
}

function sanitiseDetection(input: IngestDetection): IngestDetection | null {
  if (!input || typeof input !== "object") return null;
  if (typeof input.trackId !== "string" || !isValidBox(input.box)) return null;
  if (typeof input.objectClass !== "string") return null;

  const [x, y, w, h] = input.box;

  return {
    trackId: input.trackId.slice(0, 80),
    objectClass: input.objectClass.slice(0, 60),
    confidence: clamp01(Number(input.confidence)),
    box: [clamp01(x), clamp01(y), clamp01(w), clamp01(h)],
    moving: Boolean(input.moving),
    direction:
      typeof input.direction === "string"
        ? input.direction.slice(0, 40)
        : undefined,
    speed:
      typeof input.speed === "number" && Number.isFinite(input.speed)
        ? Math.max(0, Math.min(1000, input.speed))
        : undefined,
    path: normalisePath(input.path),
  };
}

export interface CameraIngestResult {
  session: CameraSessionDTO;
  newDetections: CameraDetectionDTO[];
}

export async function ingestCameraFrame(
  db: Database,
  session: CameraSession,
  payload: CameraIngestPayload,
): Promise<CameraIngestResult> {
  const now = new Date();
  const detections = (payload.detections ?? [])
    .map(sanitiseDetection)
    .filter((value): value is IngestDetection => value !== null)
    .slice(0, MAX_DETECTIONS_PER_FRAME)
    .map(enrichDetection);

  const frameWidth =
    typeof payload.frameWidth === "number" &&
    Number.isFinite(payload.frameWidth) &&
    payload.frameWidth > 0
      ? Math.round(payload.frameWidth)
      : null;
  const frameHeight =
    typeof payload.frameHeight === "number" &&
    Number.isFinite(payload.frameHeight) &&
    payload.frameHeight > 0
      ? Math.round(payload.frameHeight)
      : null;

  const lat =
    typeof payload.lat === "number" &&
    Number.isFinite(payload.lat) &&
    payload.lat >= -90 &&
    payload.lat <= 90
      ? payload.lat
      : null;
  const lng =
    typeof payload.lng === "number" &&
    Number.isFinite(payload.lng) &&
    payload.lng >= -180 &&
    payload.lng <= 180
      ? payload.lng
      : null;

  await db
    .update(cameraSessions)
    .set({
      status: "live",
      latestFrame: payload.frame,
      latestDetections: detections,
      frameWidth,
      frameHeight,
      motion: clamp01(Number(payload.motion)),
      aiEnabled: Boolean(payload.aiEnabled),
      deviceLabel: payload.deviceLabel
        ? payload.deviceLabel.slice(0, 80)
        : session.deviceLabel,
      lastSeenAt: now,
      frameUpdatedAt: now,
      startedAt: session.startedAt ?? now,
      endedAt: null,
      ...(lat !== null ? { lat } : {}),
      ...(lng !== null ? { lng } : {}),
    })
    .where(eq(cameraSessions.id, session.id));

  // Only log a row when a tracked object first appears in this session. That
  // keeps the event feed meaningful instead of one row per frame.
  const cutoff = new Date(now.getTime() - DEDUPE_WINDOW_MS);
  const seen = await db
    .select({ trackId: cameraDetections.trackId })
    .from(cameraDetections)
    .where(
      and(
        eq(cameraDetections.sessionId, session.id),
        gte(cameraDetections.createdAt, cutoff),
      ),
    );

  const knownTracks = new Set(
    seen.map((row) => row.trackId).filter((value): value is string => Boolean(value)),
  );
  const fresh = detections.filter((detection) => !knownTracks.has(detection.trackId));

  let inserted: CameraDetection[] = [];
  if (fresh.length > 0) {
    inserted = await db
      .insert(cameraDetections)
      .values(
        fresh.map((detection) => ({
          sessionId: session.id,
          farmerId: session.farmerId,
          label: detection.label,
          emoji: detection.emoji,
          category: detection.category,
          confidence: detection.confidence,
          trackId: detection.trackId,
          box: detection.box,
          direction: detection.direction,
          speed: detection.speed,
          lat,
          lng,
        })),
      )
      .returning();

    await db
      .update(cameraSessions)
      .set({
        totalDetections: sql`${cameraSessions.totalDetections} + ${inserted.length}`,
      })
      .where(eq(cameraSessions.id, session.id));
  }

  const refreshed = await db
    .select()
    .from(cameraSessions)
    .where(eq(cameraSessions.id, session.id))
    .limit(1);

  return {
    session: toCameraSessionDTO(refreshed[0] ?? session),
    newDetections: inserted.map(toDetectionDTO),
  };
}

/** Used when an owner ends a stream so the phone stops posting frames. */
export async function stopCameraSession(
  db: Database,
  id: number,
  farmerId: number,
): Promise<boolean> {
  const rows = await db
    .update(cameraSessions)
    .set({ status: "ended", endedAt: new Date(), latestDetections: [] })
    .where(
      and(eq(cameraSessions.id, id), eq(cameraSessions.farmerId, farmerId)),
    )
    .returning({ id: cameraSessions.id });

  return rows.length > 0;
}

/** Removes a session and its detections (farm cleanup / demo reset). */
export async function deleteCameraSession(
  db: Database,
  id: number,
  farmerId: number,
): Promise<boolean> {
  const rows = await db
    .delete(cameraSessions)
    .where(
      and(eq(cameraSessions.id, id), eq(cameraSessions.farmerId, farmerId)),
    )
    .returning({ id: cameraSessions.id });

  return rows.length > 0;
}

/** Detections cascade with their session, so no extra cleanup is required. */

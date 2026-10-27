import { randomBytes } from "node:crypto";

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import {
  cameraAlerts,
  cameraDetections,
  cameraSessions,
  farmlands,
  farmers,
  type CameraAlert,
  type CameraDetection,
  type CameraSession,
  type Database,
} from "@/db";
import { bearingDegrees, compassDirection, haversineKm } from "./geo";
import {
  alarmMessage,
  clamp01,
  enrichDetection,
  isTrackedCategory,
  LIVE_WINDOW_MS,
  normaliseSpecies,
  objectMeta,
  type CameraAlertDTO,
  type CameraDetectionDTO,
  type CameraIngestPayload,
  type CameraSessionDTO,
  type DetectionBox,
  type DetectionCategory,
  type DetectionSource,
  type FrameDetection,
  type IngestDetection,
  type TrackedCategory,
} from "./camera";
import { verifyFrameWithGroq, type GroqVerdict } from "./groq";

const MAX_DETECTIONS_PER_FRAME = 12;
const MAX_ALERTS_PER_FRAME = 4;

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

/**
 * The live overlay only ever shows humans and animals. Historical rows may
 * still hold motion/vehicle labels, so scrub them on the way out.
 */
function liveDetections(
  value: FrameDetection[] | null | undefined,
): FrameDetection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && isTrackedCategory(item.category))
    .map((item) => ({
      ...item,
      confirmed: item.confirmed ?? true,
      source: item.source ?? "on-device",
    }));
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
    latestDetections: liveDetections(session.latestDetections),
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
    category: detection.category as DetectionCategory,
    confidence: detection.confidence,
    trackId: detection.trackId,
    box: detection.box,
    direction: detection.direction,
    speed: detection.speed,
    confirmed: detection.confirmed,
    source: (detection.source as DetectionSource) ?? "on-device",
    verified: detection.verified,
    createdAt: toIso(detection.createdAt),
  };
}

function toAlertDTO(alert: CameraAlert, sessionName: string): CameraAlertDTO {
  return {
    id: alert.id,
    sessionId: alert.sessionId,
    sessionName,
    detectionId: alert.detectionId,
    label: alert.label,
    emoji: alert.emoji,
    category: alert.category === "person" ? "person" : "animal",
    confidence: alert.confidence,
    message: alert.message,
    source: (alert.source as DetectionSource) ?? "on-device",
    verified: alert.verified,
    lat: alert.lat,
    lng: alert.lng,
    createdAt: toIso(alert.createdAt),
    acknowledgedAt: toIso(alert.acknowledgedAt),
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
      .where(
        and(
          eq(cameraDetections.sessionId, id),
          eq(cameraDetections.confirmed, true),
        ),
      )
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

  const meta = objectMeta(input.objectClass);
  if (!isTrackedCategory(meta.category)) return null;

  const [x, y, w, h] = input.box;
  const hits = Number(input.hits);

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
    confirmed: Boolean(input.confirmed),
    hits: Number.isFinite(hits) ? Math.max(0, Math.min(999, Math.round(hits))) : undefined,
  };
}

export interface CameraIngestResult {
  session: CameraSessionDTO;
  newDetections: CameraDetectionDTO[];
  newAlerts: CameraAlertDTO[];
  /** Detection ids that should be verified by Groq after the response. */
  verification: { ids: number[]; frame: string } | null;
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

  // Fast path: most frames carry no *new confirmed* track. Skip the dedupe
  // query and alert work entirely so uploads stay snappy on slow networks.
  const confirmedCandidates = detections.filter(
    (detection) => detection.confirmed && isTrackedCategory(detection.category),
  );

  let inserted: CameraDetection[] = [];
  let alerts: CameraAlert[] = [];
  let verification: CameraIngestResult["verification"] = null;

  if (confirmedCandidates.length > 0) {
    // Use the database clock for both windows: the app machine and Neon can
    // differ by several seconds, which would otherwise break the cooldown.
    const seen = await db
      .select({ trackId: cameraDetections.trackId })
      .from(cameraDetections)
      .where(
        and(
          eq(cameraDetections.sessionId, session.id),
          gte(
            cameraDetections.createdAt,
            sql`now() - interval '15 minutes'`,
          ),
        ),
      );

    const knownTracks = new Set(
      seen
        .map((row) => row.trackId)
        .filter((value): value is string => Boolean(value)),
    );
    const fresh = confirmedCandidates.filter(
      (detection) => !knownTracks.has(detection.trackId),
    );

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
            confirmed: true,
            source: "on-device" as const,
            verified: false,
            lat,
            lng,
          })),
        )
        .returning();

      // One alarm per new confirmed track, with a per-camera cooldown so a
      // flock of birds cannot flood the dashboard. The comparison runs in the
      // database so clock skew between the app and Neon cannot break it.
      const recentAlert = await db
        .select({ id: cameraAlerts.id })
        .from(cameraAlerts)
        .where(
          and(
            eq(cameraAlerts.sessionId, session.id),
            gte(
              cameraAlerts.createdAt,
              sql`now() - interval '8 seconds'`,
            ),
          ),
        )
        .limit(1);

      if (recentAlert.length === 0) {
        alerts = await db
          .insert(cameraAlerts)
          .values(
            inserted.slice(0, MAX_ALERTS_PER_FRAME).map((detection) => {
              const category: TrackedCategory =
                detection.category === "person" ? "person" : "animal";
              return {
                sessionId: detection.sessionId,
                farmerId: detection.farmerId,
                detectionId: detection.id,
                label: detection.label,
                emoji: detection.emoji,
                category,
                confidence: detection.confidence,
                message: alarmMessage(
                  detection.label,
                  category,
                  session.name,
                ),
                source: "on-device" as const,
                verified: false,
                lat,
                lng,
              };
            }),
          )
          .returning();
      }

      verification = {
        ids: inserted.map((detection) => detection.id),
        frame: payload.frame,
      };
    }
  }

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
      totalDetections:
        inserted.length > 0
          ? sql`${cameraSessions.totalDetections} + ${inserted.length}`
          : session.totalDetections,
      ...(lat !== null ? { lat } : {}),
      ...(lng !== null ? { lng } : {}),
    })
    .where(eq(cameraSessions.id, session.id));

  const refreshed = await db
    .select()
    .from(cameraSessions)
    .where(eq(cameraSessions.id, session.id))
    .limit(1);

  return {
    session: toCameraSessionDTO(refreshed[0] ?? session),
    newDetections: inserted.map(toDetectionDTO),
    newAlerts: alerts.map((alert) => toAlertDTO(alert, session.name)),
    verification,
  };
}

// ---------------------------------------------------------------------------
// Groq vision verification (runs after the ingest response)
// ---------------------------------------------------------------------------

function pickAnimalSpecies(
  verdict: GroqVerdict,
  localLabel: string,
): { species: string; confidence: number } | null {
  if (verdict.animals.length === 0) return null;

  const localKey = normaliseSpecies(localLabel);
  const match = verdict.animals.find(
    (animal) => normaliseSpecies(animal.species) === localKey,
  );
  return match ?? verdict.animals[0];
}

/**
 * Applies the Groq verdict to already-stored detections: refines species,
 * marks detections verified, and removes clear false positives (plus their
 * alarms). Failures are silent — the local tracker remains the source of truth.
 */
export async function verifyCameraDetections(
  db: Database,
  sessionId: number,
  detectionIds: number[],
  frame: string,
): Promise<void> {
  if (detectionIds.length === 0) return;

  const [rows, sessionRows] = await Promise.all([
    db
      .select()
      .from(cameraDetections)
      .where(inArray(cameraDetections.id, detectionIds)),
    db
      .select({ name: cameraSessions.name })
      .from(cameraSessions)
      .where(eq(cameraSessions.id, sessionId))
      .limit(1),
  ]);

  if (rows.length === 0) return;
  const sessionName = sessionRows[0]?.name ?? "field camera";

  const verdict = await verifyFrameWithGroq({
    frame,
    candidates: rows.map((row) => ({
      objectClass: row.label,
      confidence: row.confidence ?? 0,
      box: row.box ?? [0, 0, 0, 0],
    })),
  });
  if (!verdict) return;

  const touchedTrackIds = new Set<string>();
  const refutedIds: number[] = [];
  const updates = new Map<
    number,
    {
      label: string;
      emoji: string;
      category: TrackedCategory;
      confidence: number;
    }
  >();

  for (const row of rows) {
    const localMeta = objectMeta(row.label);
    const localCategory: TrackedCategory =
      localMeta.category === "person" ? "person" : "animal";
    const trackId = row.trackId ?? "";

    // Nothing at all in frame: only drop low-confidence local guesses. A
    // confident local detection stays (Groq can miss distant animals).
    if (verdict.verdict === "none") {
      if ((row.confidence ?? 0) < 0.6) {
        refutedIds.push(row.id);
        touchedTrackIds.add(trackId);
      }
      continue;
    }

    if (localCategory === "person") {
      if (verdict.humans > 0 || verdict.verdict === "human" || verdict.verdict === "both") {
        updates.set(row.id, {
          label: "Person",
          emoji: "🧍",
          category: "person",
          confidence: Math.max(
            row.confidence ?? 0,
            verdict.humanConfidence || 0.6,
          ),
        });
        touchedTrackIds.add(trackId);
      } else if ((row.confidence ?? 0) < 0.6) {
        // The verifier saw animals but no people, and the local person guess
        // was weak — treat it as a mislabel rather than a human alarm.
        const animal = verdict.animals[0];
        const meta = objectMeta(animal.species);
        if (isTrackedCategory(meta.category)) {
          updates.set(row.id, {
            label: meta.label,
            emoji: meta.emoji,
            category: "animal",
            confidence: Math.max(row.confidence ?? 0, animal.confidence),
          });
          touchedTrackIds.add(trackId);
        }
      }
      continue;
    }

    // Local animal detection.
    const picked = pickAnimalSpecies(verdict, row.label);
    if (picked) {
      const meta = objectMeta(normaliseSpecies(picked.species));
      updates.set(row.id, {
        label: meta.label,
        emoji: meta.emoji,
        category: "animal",
        confidence: Math.max(row.confidence ?? 0, picked.confidence),
      });
      touchedTrackIds.add(trackId);
    } else if (
      verdict.humans > 0 &&
      humanVerdictWins(verdict) &&
      (row.confidence ?? 0) < 0.6
    ) {
      updates.set(row.id, {
        label: "Person",
        emoji: "🧍",
        category: "person",
        confidence: Math.max(row.confidence ?? 0, verdict.humanConfidence),
      });
      touchedTrackIds.add(trackId);
    }
  }

  if (refutedIds.length > 0) {
    await db.delete(cameraAlerts).where(
      inArray(cameraAlerts.detectionId, refutedIds),
    );
    await db.delete(cameraDetections).where(inArray(cameraDetections.id, refutedIds));
  }

  let verifiedCount = 0;
  for (const [id, update] of updates) {
    const category: TrackedCategory = update.category;
    const verified = true;
    await db
      .update(cameraDetections)
      .set({
        label: update.label,
        emoji: update.emoji,
        category,
        confidence: update.confidence,
        source: "groq",
        verified,
      })
      .where(eq(cameraDetections.id, id));

    await db
      .update(cameraAlerts)
      .set({
        label: update.label,
        emoji: update.emoji,
        category,
        confidence: update.confidence,
        message: alarmMessage(update.label, category, sessionName),
        source: "groq",
        verified,
      })
      .where(eq(cameraAlerts.detectionId, id));

    verifiedCount += 1;
  }

  // Keep the live overlay in sync with the refined labels.
  if (touchedTrackIds.size > 0) {
    const sessionRows = await db
      .select()
      .from(cameraSessions)
      .where(eq(cameraSessions.id, sessionId))
      .limit(1);
    const session = sessionRows[0];
    if (session) {
      const confirmedRows = await db
        .select()
        .from(cameraDetections)
        .where(
          and(
            eq(cameraDetections.sessionId, sessionId),
            eq(cameraDetections.confirmed, true),
          ),
        )
        .orderBy(desc(cameraDetections.createdAt))
        .limit(MAX_DETECTIONS_PER_FRAME);

      const byTrack = new Map(
        confirmedRows
          .filter((row) => row.trackId)
          .map((row) => [row.trackId as string, row]),
      );

      const refutedTracks = new Set(
        rows
          .filter((row) => refutedIds.includes(row.id))
          .map((row) => row.trackId ?? ""),
      );

      const next = liveDetections(session.latestDetections)
        .filter((detection) => !refutedTracks.has(detection.trackId))
        .map((detection) => {
          const row = byTrack.get(detection.trackId);
          if (!row) return detection;
          return {
            ...detection,
            label: row.label,
            emoji: row.emoji,
            category: row.category as DetectionCategory,
            confidence: row.confidence ?? detection.confidence,
            source: "groq" as const,
            verified: row.verified,
          };
        });

      await db
        .update(cameraSessions)
        .set({ latestDetections: next })
        .where(eq(cameraSessions.id, sessionId));
    }
  }

  if (verifiedCount > 0) {
    console.info(
      `[groq] verified ${verifiedCount} detection(s) for session ${sessionId}`,
    );
  }
}

/** Groq sometimes sees a person where the phone only saw an animal. */
function humanVerdictWins(verdict: GroqVerdict): boolean {
  return verdict.animals.length === 0 && verdict.humanConfidence >= 0.5;
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

export async function listCameraAlerts(
  db: Database,
  farmerId: number,
  options: { limit?: number; includeAcknowledged?: boolean } = {},
): Promise<CameraAlertDTO[]> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 8));

  const rows = await db
    .select({ alert: cameraAlerts, sessionName: cameraSessions.name })
    .from(cameraAlerts)
    .innerJoin(cameraSessions, eq(cameraSessions.id, cameraAlerts.sessionId))
    .where(
      options.includeAcknowledged
        ? eq(cameraAlerts.farmerId, farmerId)
        : and(
            eq(cameraAlerts.farmerId, farmerId),
            isNull(cameraAlerts.acknowledgedAt),
          ),
    )
    .orderBy(desc(cameraAlerts.createdAt))
    .limit(limit);

  return rows.map((row) => toAlertDTO(row.alert, row.sessionName));
}

export async function acknowledgeCameraAlert(
  db: Database,
  id: number,
  farmerId: number,
): Promise<boolean> {
  const rows = await db
    .update(cameraAlerts)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(eq(cameraAlerts.id, id), eq(cameraAlerts.farmerId, farmerId)),
    )
    .returning({ id: cameraAlerts.id });

  return rows.length > 0;
}

export async function acknowledgeAllCameraAlerts(
  db: Database,
  farmerId: number,
): Promise<number> {
  const rows = await db
    .update(cameraAlerts)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(cameraAlerts.farmerId, farmerId),
        isNull(cameraAlerts.acknowledgedAt),
      ),
    )
    .returning({ id: cameraAlerts.id });

  return rows.length;
}

// ---------------------------------------------------------------------------
// Stop / delete
// ---------------------------------------------------------------------------

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

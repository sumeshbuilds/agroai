/**
 * Event-driven field security camera rules.
 *
 * The phone is the sensor: it runs COCO-SSD locally and only contacts the
 * server when an animal is actually seen (plus a small heartbeat). This module
 * holds the pure decisions — which classes count, how confident a detection
 * must be, how often an alarm may fire, and how device health is reported — so
 * the browser loop, the server and the tests use exactly the same rules.
 *
 * This file must stay free of server-only imports.
 */

/** COCO-SSD animal classes allowed to trigger a capture. */
export const SECURITY_ANIMAL_CLASSES = [
  "cow",
  "horse",
  "sheep",
  "dog",
  "bird",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "cat",
] as const;

export type SecurityAnimalClass = (typeof SECURITY_ANIMAL_CLASSES)[number];

const SECURITY_ANIMAL_SET = new Set<string>(SECURITY_ANIMAL_CLASSES);

/** Minimum COCO-SSD score allowed to trigger an alert. */
export const SECURITY_MIN_CONFIDENCE = 0.55;

/** One alert upload per camera per 15 seconds, regardless of animal count. */
export const SECURITY_ALERT_COOLDOWN_MS = 15_000;

/** Inference cadence: one frame per second is enough for field monitoring. */
export const SECURITY_INFERENCE_MS = 1_000;

/** Lightweight battery/status heartbeat cadence. */
export const SECURITY_HEARTBEAT_MS = 30_000;

/** Keep the newest 20 unsent captures on the device. */
export const SECURITY_OFFLINE_QUEUE_LIMIT = 20;

/** Retry queued captures every 10 seconds while the phone is offline-ish. */
export const SECURITY_OFFLINE_RETRY_MS = 10_000;

/** A live peek automatically disconnects after one minute. */
export const LIVE_PEEK_DURATION_MS = 60_000;

/** Public STUN is enough for a phone-to-laptop preview on most networks. */
export const LIVE_PEEK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export type CameraDeviceStatus = "offline" | "armed" | "live_peek";

/** What the dashboard badge should say, derived from persisted state. */
export type CameraDeviceBadge = CameraDeviceStatus | "ended" | "paused";

export function isSecurityAnimalClass(value: string): value is SecurityAnimalClass {
  return SECURITY_ANIMAL_SET.has(value.trim().toLowerCase());
}

export function isSecurityAnimalConfident(
  objectClass: string,
  confidence: number,
): boolean {
  return (
    isSecurityAnimalClass(objectClass) &&
    Number.isFinite(confidence) &&
    confidence >= SECURITY_MIN_CONFIDENCE
  );
}

/**
 * True when at least one confirmed, non-coasting animal clears the confidence
 * gate. Persons are still tracked and shown, but only animals raise captures.
 */
export function hasCaptureAnimal(
  detections: Array<{
    objectClass?: string;
    confidence: number;
    confirmed?: boolean;
    coasting?: boolean;
  }>,
): boolean {
  return detections.some(
    (item) =>
      !item.coasting &&
      item.confirmed !== false &&
      isSecurityAnimalConfident(item.objectClass ?? "", item.confidence),
  );
}

/** Milliseconds until the next alert upload is allowed (0 = ready now). */
export function alertCooldownRemaining(
  lastAlertAt: number,
  now: number,
  cooldownMs = SECURITY_ALERT_COOLDOWN_MS,
): number {
  if (!Number.isFinite(lastAlertAt) || lastAlertAt <= 0) return 0;
  return Math.max(0, cooldownMs - Math.max(0, now - lastAlertAt));
}

export function canRaiseIntrusion(
  lastAlertAt: number,
  now: number,
  cooldownMs = SECURITY_ALERT_COOLDOWN_MS,
): boolean {
  return alertCooldownRemaining(lastAlertAt, now, cooldownMs) === 0;
}

/**
 * The dashboard status. A camera is "offline" when its heartbeat is older than
 * 90 seconds, even if its last upload said "armed" — a backgrounded phone can
 * silently stop without sending a goodbye.
 */
export function cameraDeviceStatus(input: {
  /** Stored status: waiting/live/ended/armed/offline/live_peek. */
  status: string | null | undefined;
  lastHeartbeat: string | number | Date | null | undefined;
  livePeekUntil?: string | number | Date | null | undefined;
  now?: number;
  offlineAfterMs?: number;
}): CameraDeviceBadge {
  if (input.status === "ended") return "ended";
  if (input.status === "waiting" || !input.status) return "offline";

  const now = input.now ?? Date.now();
  const heartbeat = toMillis(input.lastHeartbeat);
  const offlineAfter = input.offlineAfterMs ?? 90_000;
  if (heartbeat === null || now - heartbeat > offlineAfter) return "offline";

  const peekUntil = toMillis(input.livePeekUntil);
  if (peekUntil !== null && peekUntil > now) return "live_peek";

  if (input.status === "live_peek") {
    // The 60-second window closed but the phone has not heartbeated since.
    return peekUntil !== null && peekUntil <= now ? "armed" : "live_peek";
  }
  if (input.status === "armed" || input.status === "live") return "armed";
  return "paused";
}

function toMillis(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Normalise any persisted/legacy status to the three device states. */
export function deviceStatusToStore(
  status: CameraDeviceStatus | "live" | "waiting" | "ended",
): CameraDeviceStatus | "ended" {
  if (status === "ended") return "ended";
  if (status === "live" || status === "armed") return "armed";
  if (status === "live_peek") return "live_peek";
  return "offline";
}

export function batteryPercentLabel(level: number | null | undefined): string | null {
  if (level === null || level === undefined || !Number.isFinite(level)) return null;
  return `${Math.min(100, Math.max(0, Math.round(level)))}%`;
}

/** Last-seen copy shared by the phone and dashboard. */
export function heartbeatAgeLabel(
  lastHeartbeat: string | number | Date | null | undefined,
  now = Date.now(),
): string {
  const at = toMillis(lastHeartbeat);
  if (at === null) return "Never seen";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export interface OfflineCapture {
  id: string;
  /** JPEG data URL (`data:image/jpeg;base64,...`). */
  dataUrl: string;
  capturedAt: string;
  meta: Record<string, unknown>;
}

/** Keep the newest `limit` captures, oldest first. */
export function trimOfflineQueue<T extends { capturedAt: string }>(
  items: T[],
  limit = SECURITY_OFFLINE_QUEUE_LIMIT,
): T[] {
  const bounded = Math.max(0, Math.floor(limit));
  if (bounded === 0) return [];
  return [...items]
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
    .slice(-bounded);
}

/** Convert a canvas/data URL back to a Blob for multipart upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid capture data URL.");
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read capture."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

/** Parse the phone's heartbeat body without trusting the network. */
export function parseHeartbeat(input: unknown): {
  status: CameraDeviceStatus;
  batteryLevel: number | null;
  deviceLabel: string | null;
  lat: number | null;
  lng: number | null;
} | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const status =
    body.status === "armed" || body.status === "live_peek" || body.status === "offline"
      ? body.status
      : "armed";
  const battery =
    typeof body.batteryLevel === "number" && Number.isFinite(body.batteryLevel)
      ? Math.min(100, Math.max(0, Math.round(body.batteryLevel)))
      : null;
  const label =
    typeof body.deviceLabel === "string" && body.deviceLabel.trim()
      ? body.deviceLabel.trim().slice(0, 80)
      : null;
  const lat =
    typeof body.lat === "number" && Number.isFinite(body.lat) && Math.abs(body.lat) <= 90
      ? body.lat
      : null;
  const lng =
    typeof body.lng === "number" && Number.isFinite(body.lng) && Math.abs(body.lng) <= 180
      ? body.lng
      : null;
  return { status, batteryLevel: battery, deviceLabel: label, lat, lng };
}

/** Server-side RTC signalling payload guard. */
export function parseRtcDescription(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const value = (input as Record<string, unknown>).description;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("v=0") || trimmed.length > 20_000) return null;
  return trimmed;
}

/**
 * Shared types + label metadata for the live field-camera pipeline.
 *
 * The phone runs on-device object detection (COCO-SSD / motion fallback) and
 * posts tiny JPEG frames + normalised detection boxes. The dashboard replays
 * those frames as a near-live feed and overlays the boxes/trails.
 *
 * This module must stay free of server-only imports.
 */

export type CameraSessionStatus = "waiting" | "live" | "ended";

export type DetectionCategory = "person" | "animal" | "vehicle" | "motion" | "other";

/** A box in normalised coordinates (0–1) relative to the frame. */
export type DetectionBox = [number, number, number, number];

/** Enriched detection stored on the session + shown on the dashboard. */
export interface FrameDetection {
  /** Stable id while the object stays in view (e.g. `p1`, `a2`). */
  trackId: string;
  /** Friendly label, e.g. "Person", "Elephant". */
  label: string;
  emoji: string;
  category: DetectionCategory;
  confidence: number;
  box: DetectionBox;
  moving: boolean;
  direction?: string;
  /** Normalised frame widths per second. */
  speed?: number;
  /** Recent centres [x, y] for the movement trail. */
  path?: Array<[number, number]>;
}

/** Raw detection posted by the phone. The server enriches it. */
export interface IngestDetection {
  trackId: string;
  /** COCO-SSD class or `motion` for the motion-only fallback. */
  objectClass: string;
  confidence: number;
  box: DetectionBox;
  moving?: boolean;
  direction?: string;
  speed?: number;
  path?: Array<[number, number]>;
}

export interface CameraSessionDTO {
  id: number;
  name: string;
  token: string;
  status: CameraSessionStatus;
  /** True when a frame arrived in the last ~12 seconds. */
  isLive: boolean;
  aiEnabled: boolean;
  deviceLabel: string | null;
  lat: number | null;
  lng: number | null;
  motion: number;
  latestDetections: FrameDetection[];
  totalDetections: number;
  frameWidth: number | null;
  frameHeight: number | null;
  frameUpdatedAt: string | null;
  lastSeenAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  /** Versioned URL for the latest frame, or null when no frame has arrived. */
  frameUrl: string | null;
  /** Nearest saved farm to the camera, when the phone shares GPS. */
  farm: { id: number; name: string; distanceKm: number; direction: string } | null;
}

export interface CameraDetectionDTO {
  id: number;
  sessionId: number;
  label: string;
  emoji: string;
  category: DetectionCategory;
  confidence: number | null;
  trackId: string | null;
  box: DetectionBox | null;
  direction: string | null;
  speed: number | null;
  createdAt: string | null;
}

export interface CameraIngestPayload {
  frame: string;
  frameWidth?: number;
  frameHeight?: number;
  aiEnabled?: boolean;
  deviceLabel?: string;
  capturedAt?: string;
  motion?: number;
  lat?: number;
  lng?: number;
  detections: IngestDetection[];
}

export interface CameraStats {
  persons: number;
  animals: number;
  vehicles: number;
  other: number;
  moving: number;
}

export const LIVE_WINDOW_MS = 12_000;

interface LabelMeta {
  label: string;
  emoji: string;
  category: DetectionCategory;
}

/**
 * COCO-SSD classes that matter on a farm, plus the motion fallback. Anything
 * else falls back to a title-cased label in the `other` category.
 */
const LABEL_META: Record<string, LabelMeta> = {
  motion: { label: "Movement", emoji: "〰️", category: "motion" },
  person: { label: "Person", emoji: "🧍", category: "person" },
  elephant: { label: "Elephant", emoji: "🐘", category: "animal" },
  bear: { label: "Bear", emoji: "🐻", category: "animal" },
  cow: { label: "Cow", emoji: "🐄", category: "animal" },
  horse: { label: "Horse", emoji: "🐎", category: "animal" },
  sheep: { label: "Sheep", emoji: "🐑", category: "animal" },
  dog: { label: "Dog", emoji: "🐕", category: "animal" },
  cat: { label: "Cat", emoji: "🐈", category: "animal" },
  bird: { label: "Bird", emoji: "🐦", category: "animal" },
  zebra: { label: "Zebra", emoji: "🦓", category: "animal" },
  giraffe: { label: "Giraffe", emoji: "🦒", category: "animal" },
  motorcycle: { label: "Motorbike", emoji: "🏍️", category: "vehicle" },
  bicycle: { label: "Bicycle", emoji: "🚲", category: "vehicle" },
  car: { label: "Car", emoji: "🚗", category: "vehicle" },
  truck: { label: "Truck", emoji: "🚚", category: "vehicle" },
  bus: { label: "Bus", emoji: "🚌", category: "vehicle" },
  train: { label: "Train", emoji: "🚆", category: "vehicle" },
  boat: { label: "Boat", emoji: "⛵", category: "vehicle" },
  "wild boar": { label: "Wild boar", emoji: "🐗", category: "animal" },
  tiger: { label: "Tiger", emoji: "🐅", category: "animal" },
  leopard: { label: "Leopard", emoji: "🐆", category: "animal" },
  monkey: { label: "Monkey", emoji: "🐒", category: "animal" },
};

export function objectMeta(objectClass: string): LabelMeta {
  const key = objectClass.trim().toLowerCase();
  const known = LABEL_META[key];
  if (known) return known;

  const title = key
    ? key.replace(/(^|\s)\S/g, (char) => char.toUpperCase())
    : "Object";

  return { label: title, emoji: "🔎", category: "other" };
}

export function enrichDetection(input: IngestDetection): FrameDetection {
  const meta = objectMeta(input.objectClass);
  return {
    trackId: input.trackId,
    label: meta.label,
    emoji: meta.emoji,
    category: meta.category,
    confidence: clamp01(input.confidence),
    box: input.box,
    moving: input.moving ?? false,
    direction: input.direction,
    speed: input.speed,
    path: input.path,
  };
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function cameraStats(detections: FrameDetection[]): CameraStats {
  return detections.reduce<CameraStats>(
    (stats, detection) => {
      if (detection.category === "person") stats.persons += 1;
      else if (detection.category === "animal") stats.animals += 1;
      else if (detection.category === "vehicle") stats.vehicles += 1;
      else stats.other += 1;

      if (detection.moving) stats.moving += 1;
      return stats;
    },
    { persons: 0, animals: 0, vehicles: 0, other: 0, moving: 0 },
  );
}

export const CATEGORY_STYLES: Record<
  DetectionCategory,
  { border: string; text: string; fill: string }
> = {  person: {
    border: "border-amber-400",
    text: "bg-amber-400 text-slate-950",
    fill: "rgba(251, 191, 36, 0.18)",
  },
  animal: {
    border: "border-red-400",
    text: "bg-red-500 text-white",
    fill: "rgba(239, 68, 68, 0.16)",
  },
  vehicle: {
    border: "border-sky-400",
    text: "bg-sky-400 text-slate-950",
    fill: "rgba(56, 189, 248, 0.16)",
  },
  motion: {
    border: "border-emerald-400",
    text: "bg-emerald-400 text-slate-950",
    fill: "rgba(52, 211, 153, 0.12)",
  },
  other: {
    border: "border-violet-400",
    text: "bg-violet-400 text-slate-950",
    fill: "rgba(167, 139, 250, 0.16)",
  },
};

export function categoryOf(label: string): DetectionCategory {
  return objectMeta(label).category;
}

/** Canvas-friendly colours for the phone overlay. */
export const CATEGORY_COLORS: Record<DetectionCategory, string> = {
  person: "#fbbf24",
  animal: "#f87171",
  vehicle: "#38bdf8",
  motion: "#34d399",
  other: "#a78bfa",
};


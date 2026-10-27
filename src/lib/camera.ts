/**
 * Shared types + label metadata for the live field-camera pipeline.
 *
 * The phone runs on-device object detection (COCO-SSD) and posts tiny JPEG
 * frames + normalised detection boxes. Only **people and animals** are tracked
 * — vehicles, furniture and general "movement" are deliberately ignored so the
 * dashboard never looks noisy and alarms stay meaningful.
 *
 * Optional server-side Groq vision verification refines the animal species and
 * confirms (or refutes) low-confidence tracks. It is event-driven, so it costs
 * one small image upload per new track rather than a constant video stream.
 *
 * This module must stay free of server-only imports.
 */

export type CameraSessionStatus = "waiting" | "live" | "ended";

/**
 * `motion` / `vehicle` / `other` remain in the union so old rows keep rendering,
 * but the live pipeline only ever emits `person` and `animal`.
 */
export type DetectionCategory =
  | "person"
  | "animal"
  | "motion"
  | "vehicle"
  | "other";

/** Categories that are actually tracked and alerted on. */
export type TrackedCategory = "person" | "animal";

/** A box in normalised coordinates (0–1) relative to the frame. */
export type DetectionBox = [number, number, number, number];

/** Where a detection's label came from. */
export type DetectionSource = "on-device" | "groq";

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
  /**
   * True once the tracker has seen this object across several frames (or the
   * vision verifier agreed). Only confirmed tracks can raise an alarm.
   */
  confirmed: boolean;
  /** Number of frames the object has been seen in. */
  hits?: number;
  /** Which model produced the final label. */
  source?: DetectionSource;
}

/** Raw detection posted by the phone. The server enriches it. */
export interface IngestDetection {
  trackId: string;
  /** COCO-SSD class (e.g. `person`, `cow`) or a Groq species label. */
  objectClass: string;
  confidence: number;
  box: DetectionBox;
  moving?: boolean;
  direction?: string;
  speed?: number;
  path?: Array<[number, number]>;
  /** Set by the phone once the track is stable enough to alert on. */
  confirmed?: boolean;
  /** Frames seen so far (server uses it as a confidence signal). */
  hits?: number;
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
  confirmed: boolean;
  source: DetectionSource;
  verified: boolean;
  createdAt: string | null;
}

/** A confirmed human/animal event shown as an alarm on the dashboard. */
export interface CameraAlertDTO {
  id: number;
  sessionId: number;
  sessionName: string;
  detectionId: number | null;
  label: string;
  emoji: string;
  category: TrackedCategory;
  confidence: number | null;
  message: string;
  source: DetectionSource;
  verified: boolean;
  lat: number | null;
  lng: number | null;
  createdAt: string | null;
  acknowledgedAt: string | null;
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
  /** Adaptive quality/size hint used for diagnostics on the dashboard. */
  quality?: "low" | "balanced" | "high";
  detections: IngestDetection[];
}

export interface CameraIngestResponse {
  ok: boolean;
  sessionId: number;
  frameUpdatedAt: string | null;
  newDetections: CameraDetectionDTO[];
  newAlerts: CameraAlertDTO[];
  /** True when the frame was queued for Groq vision verification. */
  verificationQueued: boolean;
}

export interface CameraStats {
  persons: number;
  animals: number;
  vehicles: number;
  other: number;
  moving: number;
}

/** Frames older than this make a session look offline. */
export const LIVE_WINDOW_MS = 15_000;

/**
 * Tracker confirmation thresholds. A track must be seen this many times with a
 * reasonable score before it is allowed to raise an alarm.
 */
export const TRACK_CONFIRM_HITS = 3;
export const TRACK_CONFIRM_CONFIDENCE = 0.42;
/** How long a lost track is kept alive (coasting) before it is dropped. */
export const TRACK_MEMORY_MS = 1_600;

/** Minimum gap between alarm rows for one camera (avoids alarm storms). */
export const ALARM_COOLDOWN_MS = 8_000;

interface LabelMeta {
  label: string;
  emoji: string;
  category: DetectionCategory;
}

/**
 * Everything we are willing to track. COCO-SSD classes come first, followed by
 * species that the Groq verifier (or a custom model) can return.
 */
const TRACKABLE_LABELS: Record<string, LabelMeta> = {
  person: { label: "Person", emoji: "🧍", category: "person" },

  // COCO-SSD animal classes.
  bird: { label: "Bird", emoji: "🐦", category: "animal" },
  cat: { label: "Cat", emoji: "🐈", category: "animal" },
  dog: { label: "Dog", emoji: "🐕", category: "animal" },
  horse: { label: "Horse", emoji: "🐎", category: "animal" },
  sheep: { label: "Sheep", emoji: "🐑", category: "animal" },
  cow: { label: "Cow", emoji: "🐄", category: "animal" },
  elephant: { label: "Elephant", emoji: "🐘", category: "animal" },
  bear: { label: "Bear", emoji: "🐻", category: "animal" },
  zebra: { label: "Zebra", emoji: "🦓", category: "animal" },
  giraffe: { label: "Giraffe", emoji: "🦒", category: "animal" },

  // Farm / wildlife species (Groq vision output aliases map onto these).
  "wild boar": { label: "Wild boar", emoji: "🐗", category: "animal" },
  boar: { label: "Wild boar", emoji: "🐗", category: "animal" },
  pig: { label: "Pig", emoji: "🐖", category: "animal" },
  tiger: { label: "Tiger", emoji: "🐅", category: "animal" },
  leopard: { label: "Leopard", emoji: "🐆", category: "animal" },
  "snow leopard": { label: "Snow leopard", emoji: "🐆", category: "animal" },
  lion: { label: "Lion", emoji: "🦁", category: "animal" },
  monkey: { label: "Monkey", emoji: "🐒", category: "animal" },
  ape: { label: "Ape", emoji: "🦍", category: "animal" },
  deer: { label: "Deer", emoji: "🦌", category: "animal" },
  "wild deer": { label: "Deer", emoji: "🦌", category: "animal" },
  antelope: { label: "Antelope", emoji: "🦌", category: "animal" },
  buffalo: { label: "Buffalo", emoji: "🐃", category: "animal" },
  "water buffalo": { label: "Buffalo", emoji: "🐃", category: "animal" },
  ox: { label: "Ox", emoji: "🐂", category: "animal" },
  cattle: { label: "Cow", emoji: "🐄", category: "animal" },
  goat: { label: "Goat", emoji: "🐐", category: "animal" },
  donkey: { label: "Donkey", emoji: "🫏", category: "animal" },
  camel: { label: "Camel", emoji: "🐫", category: "animal" },
  fox: { label: "Fox", emoji: "🦊", category: "animal" },
  wolf: { label: "Wolf", emoji: "🐺", category: "animal" },
  jackal: { label: "Jackal", emoji: "🐺", category: "animal" },
  hyena: { label: "Hyena", emoji: "🐕", category: "animal" },
  rabbit: { label: "Rabbit", emoji: "🐇", category: "animal" },
  hare: { label: "Hare", emoji: "🐇", category: "animal" },
  rat: { label: "Rat", emoji: "🐀", category: "animal" },
  mouse: { label: "Mouse", emoji: "🐁", category: "animal" },
  mongoose: { label: "Mongoose", emoji: "🦫", category: "animal" },
  squirrel: { label: "Squirrel", emoji: "🐿️", category: "animal" },
  snake: { label: "Snake", emoji: "🐍", category: "animal" },
  cobra: { label: "Snake", emoji: "🐍", category: "animal" },
  crocodile: { label: "Crocodile", emoji: "🐊", category: "animal" },
  alligator: { label: "Alligator", emoji: "🐊", category: "animal" },
  rhino: { label: "Rhinoceros", emoji: "🦏", category: "animal" },
  rhinoceros: { label: "Rhinoceros", emoji: "🦏", category: "animal" },
  hippo: { label: "Hippopotamus", emoji: "🦛", category: "animal" },
  hippopotamus: { label: "Hippopotamus", emoji: "🦛", category: "animal" },
  chicken: { label: "Chicken", emoji: "🐔", category: "animal" },
  hen: { label: "Chicken", emoji: "🐔", category: "animal" },
  rooster: { label: "Rooster", emoji: "🐓", category: "animal" },
  duck: { label: "Duck", emoji: "🦆", category: "animal" },
  goose: { label: "Goose", emoji: "🦢", category: "animal" },
  peacock: { label: "Peacock", emoji: "🦚", category: "animal" },
  parrot: { label: "Parrot", emoji: "🦜", category: "animal" },
};

/** Legacy labels kept so historical rows still render sensibly. */
const LEGACY_LABELS: Record<string, LabelMeta> = {
  motion: { label: "Movement", emoji: "〰️", category: "motion" },
  motorcycle: { label: "Motorbike", emoji: "🏍️", category: "vehicle" },
  bicycle: { label: "Bicycle", emoji: "🚲", category: "vehicle" },
  car: { label: "Car", emoji: "🚗", category: "vehicle" },
  truck: { label: "Truck", emoji: "🚚", category: "vehicle" },
  bus: { label: "Bus", emoji: "🚌", category: "vehicle" },
  train: { label: "Train", emoji: "🚆", category: "vehicle" },
  boat: { label: "Boat", emoji: "⛵", category: "vehicle" },
};

/** Every class the phone is allowed to keep from COCO-SSD. */
export const TRACKABLE_CLASSES = Object.keys(TRACKABLE_LABELS);

/** Fast lookup used by the phone to drop non-target predictions. */
const TRACKABLE_CLASS_SET = new Set(TRACKABLE_CLASSES);

export function isTrackableClass(objectClass: string): boolean {
  return TRACKABLE_CLASS_SET.has(objectClass.trim().toLowerCase());
}

export function isTrackedCategory(
  category: DetectionCategory,
): category is TrackedCategory {
  return category === "person" || category === "animal";
}

export function objectMeta(objectClass: string): LabelMeta {
  const key = objectClass.trim().toLowerCase();
  const known = TRACKABLE_LABELS[key] ?? LEGACY_LABELS[key];
  if (known) return known;

  const title = key
    ? key.replace(/(^|\s)\S/g, (char) => char.toUpperCase())
    : "Object";

  return { label: title, emoji: "🔎", category: "other" };
}

/** Maps a free-text species returned by the verifier onto a known label key. */
export function normaliseSpecies(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (TRACKABLE_LABELS[cleaned]) return cleaned;

  for (const key of Object.keys(TRACKABLE_LABELS)) {
    if (cleaned.includes(key) || key.includes(cleaned)) return key;
  }

  // "wild pig" / "feral hog" style answers.
  if (/\b(boar|hog)\b/.test(cleaned)) return "wild boar";
  if (/\b(human|man|woman|child|person|people)\b/.test(cleaned)) return "person";
  return cleaned;
}

export function enrichDetection(input: IngestDetection): FrameDetection {
  // Only humans/animals are enriched. Callers filter non-target classes first,
  // but this keeps the metadata honest if an unexpected label arrives.
  const key = input.objectClass.trim().toLowerCase();
  const meta = TRACKABLE_LABELS[key] ?? objectMeta(input.objectClass);

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
    confirmed: Boolean(input.confirmed),
    hits: input.hits,
    source: "on-device",
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

/** Human/animal alarm copy used by the server + dashboard. */
export function alarmMessage(
  label: string,
  category: TrackedCategory,
  sessionName: string,
): string {
  if (category === "person") {
    return `Human detected at ${sessionName}`;
  }
  return `${label || "Animal"} detected at ${sessionName}`;
}

export const CATEGORY_STYLES: Record<
  DetectionCategory,
  { border: string; text: string; fill: string }
> = {
  person: {
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

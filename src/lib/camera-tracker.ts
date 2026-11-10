import {
  clamp01, isTrackableClass, objectMeta,
  TRACK_CONFIRM_CONFIDENCE, TRACK_CONFIRM_HITS, TRACK_MEMORY_MS,
  type DetectionBox, type IngestDetection, type TrackedCategory,
} from "./camera";
import { STILL_CAMERA, type CameraMotion } from "./camera-motion";

export interface CameraCandidate {
  objectClass: string;
  category: TrackedCategory;
  confidence: number;
  box: DetectionBox;
}

interface Track {
  id: string;
  objectClass: string;
  category: TrackedCategory;
  confidence: number;
  box: DetectionBox;
  observedBox: DetectionBox;
  velocity: [number, number];
  path: Array<[number, number]>;
  firstSeen: number;
  lastSeen: number;
  hits: number;
  streak: number;
  confirmed: boolean;
  nextLabel: string;
  nextLabelHits: number;
  moving: boolean;
  direction?: string;
  speed: number;
}

export function clipDetectionBox(box: DetectionBox): DetectionBox {
  const x = clamp01(box[0]);
  const y = clamp01(box[1]);
  return [x, y, Math.max(0, clamp01(box[0] + box[2]) - x), Math.max(0, clamp01(box[1] + box[3]) - y)];
}

export function boxIou(a: DetectionBox, b: DetectionBox): number {
  const intersection = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) *
    Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const union = a[2] * a[3] + b[2] * b[3] - intersection;
  return union > 0 ? intersection / union : 0;
}

const center = (box: DetectionBox): [number, number] => [box[0] + box[2] / 2, box[1] + box[3] / 2];
const translate = (box: DetectionBox, dx: number, dy: number): DetectionBox => clipDetectionBox([box[0] + dx, box[1] + dy, box[2], box[3]]);

export function suppressDuplicateDetections(items: CameraCandidate[]): CameraCandidate[] {
  const kept: CameraCandidate[] = [];
  for (const item of [...items].sort((a, b) => b.confidence - a.confidence)) {
    if (!kept.some((other) => other.category === item.category && boxIou(other.box, item.box) > 0.55)) kept.push(item);
  }
  return kept;
}

export function cameraCandidates(
  predictions: Array<{ class: string; score: number; bbox: number[] }>,
  width: number, height: number, region: DetectionBox = [0, 0, 1, 1],
): CameraCandidate[] {
  if (width <= 0 || height <= 0) return [];
  return predictions.flatMap((prediction) => {
    if (!isTrackableClass(prediction.class) || !Number.isFinite(prediction.score) || prediction.score < 0.3 ||
        prediction.bbox.length !== 4 || prediction.bbox.some((value) => !Number.isFinite(value))) return [];
    const [x, y, w, h] = prediction.bbox;
    const box = clipDetectionBox([
      region[0] + x / width * region[2], region[1] + y / height * region[3],
      w / width * region[2], h / height * region[3],
    ]);
    if (box[2] < 0.006 || box[3] < 0.008 || box[2] * box[3] < 0.00008) return [];
    return [{
      objectClass: prediction.class.trim().toLowerCase(),
      category: objectMeta(prediction.class).category === "person" ? "person" as const : "animal" as const,
      confidence: clamp01(prediction.score), box, observedBox: [...box] as DetectionBox,
    }];
  });
}

/** Two overlapping crops for an optional, more costly distant-object scan. */
export function distantScanRegions(width: number, height: number): DetectionBox[] {
  return width >= height ? [[0, 0, 0.62, 1], [0.38, 0, 0.62, 1]] : [[0, 0, 1, 0.62], [0, 0.38, 1, 0.62]];
}

function directionFor(dx: number, dy: number, areaRatio: number, speed: number): string | undefined {
  if (areaRatio > 1.2) return "coming closer";
  if (areaRatio < 0.8) return "moving away";
  if (speed < 0.012) return undefined;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) return dx > 0 ? "moving right" : "moving left";
  return dy > 0 ? "moving down-frame" : "moving up-frame";
}

/** Velocity-aware matching, temporal confirmation and camera-relative motion. */
export class CameraTracker {
  private tracks = new Map<string, Track>();
  private counter = 0;
  private runId = "";
  private frameTime = 0;
  private cadenceMs = 700;
  private cameraVelocity: [number, number] = [0, 0];
  private ignoreMotion = false;

  get size(): number { return this.tracks.size; }
  get memoryMs(): number { return Math.min(6_000, Math.max(TRACK_MEMORY_MS, this.cadenceMs * 3)); }

  reset(runId = ""): void {
    this.tracks.clear(); this.counter = 0; this.runId = runId; this.frameTime = 0;
    this.cameraVelocity = [0, 0]; this.ignoreMotion = false;
    this.cadenceMs = 700;
  }

  ignoreNextMotion(): void {
    this.ignoreMotion = true;
    this.cameraVelocity = [0, 0];
    this.tracks.forEach((track) => { track.velocity = [0, 0]; track.path = [center(track.box)]; });
  }

  update(candidates: CameraCandidate[], now: number, motion: CameraMotion = STILL_CAMERA, aspectRatio = 1, cadenceMs = 700): IngestDetection[] {
    this.cadenceMs = Math.max(250, cadenceMs);
    const frameDt = Math.max(0.1, (now - this.frameTime) / 1000);
    const shiftX = motion.confidence > 0.18 ? motion.dx : 0;
    const shiftY = motion.confidence > 0.18 ? motion.dy : 0;
    this.cameraVelocity = [shiftX / frameDt, shiftY / frameDt];
    for (const [id, track] of this.tracks) if (now - track.lastSeen > this.memoryMs) this.tracks.delete(id);

    const pairs: Array<{ track: Track; candidate: number; score: number }> = [];
    for (const track of this.tracks.values()) {
      const dt = Math.min(0.85, Math.max(0, (now - track.lastSeen) / 1000));
      const box = translate(track.box, shiftX + track.velocity[0] * dt, shiftY + track.velocity[1] * dt);
      const [tx, ty] = center(box);
      candidates.forEach((candidate, index) => {
        if (candidate.category !== track.category) return;
        const overlap = boxIou(box, candidate.box);
        const [cx, cy] = center(candidate.box);
        const distance = Math.hypot(cx - tx, cy - ty);
        const gate = Math.min(0.28, Math.max(0.07, Math.hypot(box[2], box[3]) * 0.65 + dt * 0.06));
        const sameLabel = candidate.objectClass === track.objectClass;
        const areaRatio = candidate.box[2] * candidate.box[3] / Math.max(0.00001, box[2] * box[3]);
        if ((overlap < 0.08 && distance > gate) || (!sameLabel && overlap < 0.22) || areaRatio > 3.5 || areaRatio < 0.28) return;
        pairs.push({ track, candidate: index, score: distance + (1 - overlap) * 0.15 + (sameLabel ? 0 : 0.04) });
      });
    }
    pairs.sort((a, b) => a.score - b.score);
    const matchedTracks = new Set<string>();
    const matchedCandidates = new Set<number>();
    for (const pair of pairs) {
      const track = pair.track;
      if (matchedTracks.has(track.id) || matchedCandidates.has(pair.candidate)) continue;
      const candidate = candidates[pair.candidate];
      const dt = Math.max(0.1, (now - track.lastSeen) / 1000);
      const compensated = translate(track.box, shiftX, shiftY);
      const priorCenter = center(translate(track.observedBox, shiftX, shiftY));
      const candidateCenter = center(candidate.box);
      const dx = candidateCenter[0] - priorCenter[0];
      const dy = candidateCenter[1] - priorCenter[1];
      const alpha = Math.hypot(dx, dy) > 0.025 || shiftX || shiftY ? 0.85 : 0.65;
      const next = clipDetectionBox(compensated.map((value, index) => value + (candidate.box[index] - value) * alpha) as DetectionBox);
      const areaRatio = next[2] * next[3] / Math.max(0.00001, track.box[2] * track.box[3]);
      track.velocity = this.ignoreMotion ? [0, 0] : [track.velocity[0] * 0.35 + dx / dt * 0.65, track.velocity[1] * 0.35 + dy / dt * 0.65];
      // No bogus ×100 conversion: speed is frame widths per second, not km/h.
      track.speed = Math.hypot(track.velocity[0], track.velocity[1] / Math.max(0.1, aspectRatio));
      track.moving = track.speed > 0.012;
      track.direction = this.ignoreMotion ? undefined : directionFor(dx, dy, areaRatio, track.speed);
      track.path = track.path.slice(-13).map(([x, y]) => [clamp01(x + shiftX), clamp01(y + shiftY)]);
      track.path.push(center(next));
      track.box = next;
      track.observedBox = [...candidate.box];
      track.confidence = track.confidence * 0.5 + candidate.confidence * 0.5;
      track.hits += 1; track.streak += 1; track.lastSeen = now;
      if (candidate.objectClass !== track.objectClass) {
        track.nextLabelHits = track.nextLabel === candidate.objectClass ? track.nextLabelHits + 1 : 1;
        track.nextLabel = candidate.objectClass;
        if (track.nextLabelHits >= 3 && candidate.confidence >= track.confidence * 0.85) track.objectClass = candidate.objectClass;
      } else { track.nextLabel = ""; track.nextLabelHits = 0; }
      track.confirmed ||= now - track.firstSeen >= 250 &&
        ((track.streak >= TRACK_CONFIRM_HITS && track.confidence >= TRACK_CONFIRM_CONFIDENCE) ||
         (track.streak >= 2 && track.confidence >= 0.82));
      matchedTracks.add(track.id); matchedCandidates.add(pair.candidate);
    }
    for (const track of this.tracks.values()) {
      if (matchedTracks.has(track.id)) continue;
      track.box = translate(track.box, shiftX, shiftY);
      track.observedBox = translate(track.observedBox, shiftX, shiftY);
      track.path = track.path.map(([x, y]) => [clamp01(x + shiftX), clamp01(y + shiftY)]);
      track.streak = 0;
    }
    candidates.forEach((candidate, index) => {
      if (matchedCandidates.has(index)) return;
      const id = `${candidate.category === "person" ? "p" : "a"}${++this.counter}-${this.runId}`;
      this.tracks.set(id, {
        id, ...candidate, box: [...candidate.box], observedBox: [...candidate.box], velocity: [0, 0], path: [center(candidate.box)],
        firstSeen: now, lastSeen: now, hits: 1, streak: 1, confirmed: false,
        nextLabel: "", nextLabelHits: 0, moving: false, speed: 0,
      });
    });
    this.frameTime = now;
    this.ignoreMotion = false;
    return this.snapshot(now, false);
  }

  snapshot(now: number, predict = true): IngestDetection[] {
    return [...this.tracks.values()].filter((track) => now - track.lastSeen <= this.memoryMs).map((track) => {
      const age = Math.max(0, now - track.lastSeen);
      const coasting = track.lastSeen !== this.frameTime || age > this.cadenceMs * 1.5;
      const horizon = predict ? Math.min(0.6, age / 1000) : 0;
      const cameraHorizon = predict ? Math.min(0.6, Math.max(0, now - this.frameTime) / 1000) : 0;
      const damping = Math.exp(-age / 1_200);
      const box = !predict && !coasting ? [...track.observedBox] as DetectionBox : translate(track.box,
        track.velocity[0] * damping * horizon + this.cameraVelocity[0] * cameraHorizon,
        track.velocity[1] * damping * horizon + this.cameraVelocity[1] * cameraHorizon);
      return {
        trackId: track.id, objectClass: track.objectClass, confidence: track.confidence,
        box, path: track.path.map(([x, y]) => [x, y]), moving: !coasting && track.moving,
        direction: coasting ? undefined : track.direction, speed: coasting ? 0 : track.speed,
        confirmed: track.confirmed && !coasting, hits: track.hits, coasting,
      };
    });
  }
}

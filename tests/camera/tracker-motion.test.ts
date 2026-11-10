import assert from "node:assert/strict";
import { test } from "node:test";
import { TRACK_MEMORY_MS, type DetectionBox } from "../../src/lib/camera";
import { estimateCameraMotion, luminanceFromRgba, STILL_CAMERA } from "../../src/lib/camera-motion";
import {
  boxIou, cameraCandidates, CameraTracker, clipDetectionBox, distantScanRegions,
  suppressDuplicateDetections, type CameraCandidate,
} from "../../src/lib/camera-tracker";

const candidate = (box: DetectionBox = [0.2, 0.2, 0.12, 0.3], score = 0.7, objectClass = "person"): CameraCandidate => ({
  box, confidence: score, objectClass, category: objectClass === "person" ? "person" : "animal",
});

test("candidate filtering keeps people/animals, clips boxes and maps distant crops back to the frame", () => {
  const predictions = [
    { class: "person", score: 0.9, bbox: [50, 20, 100, 150] },
    { class: "cow", score: 0.65, bbox: [-10, 10, 60, 90] },
    { class: "car", score: 0.99, bbox: [10, 10, 100, 100] },
    { class: "person", score: 0.29, bbox: [10, 10, 100, 100] },
    { class: "dog", score: NaN, bbox: [10, 10, 100, 100] },
    { class: "bird", score: 0.7, bbox: [10, 10, 0.1, 0.1] },
    { class: "person", score: 0.8, bbox: [NaN, 10, 100, 100] },
  ];
  const full = cameraCandidates(predictions, 500, 200);
  assert.deepEqual(full.map((item) => item.objectClass), ["person", "cow"]);
  assert.deepEqual(full[1].box.slice(0, 2), [0, 0.05]);
  assert.ok(Math.abs(full[1].box[2] - 0.1) < 1e-10 && Math.abs(full[1].box[3] - 0.45) < 1e-10);
  const cropped = cameraCandidates(predictions.slice(0, 1), 500, 200, [0.38, 0, 0.62, 1]);
  assert.equal(cropped[0].box[0], 0.38 + 0.1 * 0.62);
  assert.ok(Math.abs(cropped[0].box[2] - 0.2 * 0.62) < 1e-10);
  assert.deepEqual(cameraCandidates(predictions, 0, 200), []);
  assert.deepEqual(clipDetectionBox([-0.1, 0.8, 0.4, 0.5]), [0, 0.8, 0.30000000000000004, 0.19999999999999996]);
  assert.equal(boxIou([0, 0, 1, 1], [0, 0, 1, 1]), 1);
  assert.equal(boxIou([0, 0, 0, 0], [0, 0, 0, 0]), 0);
  assert.deepEqual(distantScanRegions(720, 405), [[0, 0, 0.62, 1], [0.38, 0, 0.62, 1]]);
  assert.deepEqual(distantScanRegions(405, 720), [[0, 0, 1, 0.62], [0, 0.38, 1, 0.62]]);
});

test("overlapping full-frame/crop detections merge without suppressing another category", () => {
  const input = [candidate(undefined, 0.65), candidate(undefined, 0.9), candidate([0.7, 0.2, 0.12, 0.3]), candidate(undefined, 0.8, "dog")];
  const kept = suppressDuplicateDetections(input);
  assert.equal(kept.length, 3);
  assert.equal(kept[0].confidence, 0.9);
  assert.equal(input[0].confidence, 0.65, "input order is not mutated");
});

test("confirmation requires elapsed time and consecutive evidence, never one confident frame", () => {
  const tracker = new CameraTracker();
  tracker.reset("test-run");
  assert.equal(tracker.update([candidate(undefined, 0.91)], 1000)[0].confirmed, false);
  assert.equal(tracker.update([candidate(undefined, 0.91)], 1100)[0].confirmed, false);
  assert.equal(tracker.update([candidate(undefined, 0.91)], 1350)[0].confirmed, true);
  tracker.reset("next-run");
  tracker.update([candidate()], 1000);
  tracker.update([], 1700);
  assert.equal(tracker.update([candidate()], 2400)[0].confirmed, false);
  assert.equal(tracker.update([candidate()], 3100)[0].confirmed, false);
  assert.equal(tracker.update([candidate()], 3800)[0].confirmed, true);
});

test("brief misses coast with the same id but cannot generate confirmed event observations", () => {
  const tracker = new CameraTracker();
  tracker.reset("first-run");
  const first = tracker.update([candidate()], 1000)[0].trackId;
  tracker.update([candidate()], 1700);
  tracker.update([candidate()], 2400);
  const missed = tracker.update([], 3100)[0];
  assert.equal(missed.trackId, first);
  assert.equal(missed.coasting, true);
  assert.equal(missed.confirmed, false);
  assert.equal(missed.speed, 0);
  const recovered = tracker.update([candidate()], 3800)[0];
  assert.equal(recovered.trackId, first);
  assert.equal(recovered.confirmed, true);
  assert.equal(recovered.coasting, false);
  assert.deepEqual(tracker.snapshot(3800 + TRACK_MEMORY_MS + 1), []);
  tracker.reset("second-run");
  assert.notEqual(tracker.update([candidate()], 7000)[0].trackId, first);
});

test("translation compensation keeps a stationary subject stationary during camera panning", () => {
  const tracker = new CameraTracker();
  tracker.update([candidate([0.2, 0.2, 0.12, 0.3])], 1000);
  const result = tracker.update([candidate([0.24, 0.185, 0.12, 0.3])], 1700, {
    ...STILL_CAMERA, dx: 0.04, dy: -0.015, confidence: 0.95,
  })[0];
  assert.ok((result.speed ?? 1) < 1e-10);
  assert.equal(result.moving, false);
  assert.equal(result.direction, undefined);
  assert.deepEqual(result.box, [0.24, 0.185, 0.12, 0.3]);
  assert.equal(result.path?.length, 2);
});

test("real motion has frame-relative speed; optical changes reset movement and snapshots do not alias", () => {
  const tracker = new CameraTracker();
  tracker.update([candidate()], 1000);
  const moving = tracker.update([candidate([0.24, 0.2, 0.12, 0.3])], 1700)[0];
  assert.equal(moving.direction, "moving right");
  assert.ok((moving.speed ?? 0) > 0.012 && (moving.speed ?? 1) < 0.1, "not an invented km/h conversion");
  moving.box[0] = 1;
  moving.path![0][0] = 1;
  assert.notEqual(tracker.snapshot(1700)[0].box[0], 1);
  assert.notEqual(tracker.snapshot(1700)[0].path![0][0], 1);
  tracker.ignoreNextMotion();
  const refocused = tracker.update([candidate([0.3, 0.2, 0.12, 0.3])], 2400)[0];
  assert.equal(refocused.speed, 0);
  assert.equal(refocused.direction, undefined);
});

test("matching is one-to-one, species changes need repeated evidence, and slow cadence extends memory", () => {
  const tracker = new CameraTracker();
  const originals = tracker.update([candidate(), candidate([0.7, 0.2, 0.12, 0.3])], 1000);
  const matched = tracker.update([candidate([0.68, 0.2, 0.12, 0.3]), candidate([0.22, 0.2, 0.12, 0.3])], 1700);
  assert.equal(new Set(matched.map((item) => item.trackId)).size, 2);
  assert.deepEqual(matched.map((item) => item.trackId), originals.map((item) => item.trackId));
  tracker.reset();
  tracker.update([candidate(undefined, 0.75, "cow")], 1000);
  assert.equal(tracker.update([candidate(undefined, 0.75, "dog")], 1700)[0].objectClass, "cow");
  assert.equal(tracker.update([candidate(undefined, 0.75, "dog")], 2400)[0].objectClass, "cow");
  assert.equal(tracker.update([candidate(undefined, 0.75, "dog")], 3100)[0].objectClass, "dog");
  tracker.update([], 6000, STILL_CAMERA, 1, 2500);
  assert.equal(tracker.memoryMs, 6000);
  assert.equal(tracker.snapshot(9000).length, 1);
  assert.equal(tracker.snapshot(9200).length, 0);
});

function texture(width: number, height: number): Uint8ClampedArray {
  let state = 42;
  return Uint8ClampedArray.from({ length: width * height }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return 30 + state % 150;
  });
}

test("motion estimation compensates textured translation and exposure rather than alarming on a pan", () => {
  const width = 64;
  const height = 40;
  const previous = texture(width, height);
  const current = new Uint8ClampedArray(previous.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    current[y * width + x] = previous[Math.min(height - 1, Math.max(0, y + 2)) * width + Math.max(0, x - 3)] + 15;
  }
  const motion = estimateCameraMotion(previous, current, width, height);
  assert.equal(motion.dx, 3 / width);
  assert.equal(motion.dy, -2 / height);
  assert.ok(motion.confidence > 0.5);
  assert.ok(motion.motion < 0.05);
  assert.ok(motion.rawMotion > 0.5);
  assert.ok(Math.abs(motion.exposureDelta - 15) < 8);
});

test("exposure-only changes, flat scenes and invalid samples do not invent camera translation", () => {
  const previous = texture(48, 32);
  const brighter = previous.map((value) => value + 40);
  const motion = estimateCameraMotion(previous, brighter, 48, 32);
  assert.equal(motion.exposureDelta, 40);
  assert.equal(motion.rawMotion, 1);
  assert.equal(motion.motion, 0);
  assert.equal(motion.confidence, 0);
  assert.deepEqual(estimateCameraMotion(null, previous, 48, 32), STILL_CAMERA);
  assert.deepEqual(estimateCameraMotion(previous, new Uint8ClampedArray(1), 48, 32), STILL_CAMERA);
  const flat = new Uint8ClampedArray(48 * 32).fill(120);
  assert.equal(estimateCameraMotion(flat, flat, 48, 32).confidence, 0);
  assert.deepEqual([...luminanceFromRgba(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]))], [76, 150, 29]);
});

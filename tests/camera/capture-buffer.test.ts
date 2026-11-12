import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeCameraFrame, type CameraFrameSnapshot, type PendingCameraFrame } from "../../src/lib/camera-capture";
import { CameraEventBuffer } from "../../src/lib/camera-event-buffer";
import { deferred, rawDetection } from "./fixtures";
import { mockGlobals } from "./helpers";

function snapshot(id = "person-one"): CameraFrameSnapshot {
  return {
    canvas: { width: 1280, height: 720 } as HTMLCanvasElement,
    detections: [rawDetection({ trackId: id })], capturedAt: "2026-11-10T09:00:00.000Z",
    capturedTime: 1000, aiEnabled: true, motion: 0.12, geo: { lat: 20, lng: 85 },
  };
}

function encoded(source: CameraFrameSnapshot): PendingCameraFrame {
  return {
    blob: new Blob([source.capturedAt], { type: "image/jpeg" }),
    meta: { detections: source.detections, capturedAt: source.capturedAt },
    trackIds: source.detections.filter((item) => item.confirmed && !item.coasting).map((item) => item.trackId),
  };
}

test("JPEG encoding freezes metadata and resized pixels before its asynchronous callback", async (t) => {
  let finish!: BlobCallback;
  let drawnSize: number[] = [];
  let quality = 0;
  const output = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (_source: CanvasImageSource, ...size: number[]) => { drawnSize = size; } }),
    toBlob: (callback: BlobCallback, mime: string, nextQuality: number) => { assert.equal(mime, "image/jpeg"); finish = callback; quality = nextQuality; },
  };
  mockGlobals(t, { window: { setTimeout, clearTimeout }, document: { createElement: () => output } });
  const source = snapshot();
  const promise = encodeCameraFrame(source, false, "Test phone");
  source.detections[0].box[0] = 0.9;
  source.detections[0].path![0][0] = 0.9;
  source.capturedAt = "newer-frame";
  source.geo!.lat = 50;
  finish(new Blob(["jpeg"], { type: "image/jpeg" }));
  const result = await promise;
  assert.deepEqual(drawnSize, [0, 0, 480, 270]);
  assert.equal(output.width, 480);
  assert.equal(quality, 0.52);
  assert.equal(result.meta.capturedAt, "2026-11-10T09:00:00.000Z");
  assert.equal(result.meta.detections[0].box[0], 0.2);
  assert.equal(result.meta.detections[0].path![0][0], 0.275);
  assert.equal(result.meta.lat, 20);
  assert.deepEqual(result.trackIds, ["person-one"]);
});

test("failed, missing and hung canvas encodes reject; cancellation ignores a late callback", async (t) => {
  let finish!: BlobCallback;
  let mode = "null";
  const canvas = {
    getContext: () => ({ drawImage: () => undefined }),
    toBlob: (callback: BlobCallback) => {
      finish = callback;
      if (mode === "null") callback(null);
      if (mode === "throw") throw new Error("Canvas suspended");
    },
  };
  mockGlobals(t, { window: { setTimeout, clearTimeout }, document: { createElement: () => canvas } });
  await assert.rejects(encodeCameraFrame(snapshot(), false, "Test"), /Could not encode/);
  mode = "throw";
  await assert.rejects(encodeCameraFrame(snapshot(), false, "Test"), /Canvas suspended/);
  mode = "hang";
  await assert.rejects(encodeCameraFrame(snapshot(), false, "Test", { timeoutMs: 5 }), /encoding timed out/);
  const controller = new AbortController();
  const pending = encodeCameraFrame(snapshot(), false, "Test", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.doesNotThrow(() => finish(new Blob(["late"])));
  await assert.rejects(encodeCameraFrame(snapshot(), false, "Test", { signal: controller.signal }), { name: "AbortError" });
  const empty = snapshot();
  empty.canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  await assert.rejects(encodeCameraFrame(empty, false, "Test"), /no pixels/);
});

test("coasting boxes are not alarm tracks; slow links shrink JPEGs without upscaling", async (t) => {
  let quality = 0;
  const output = {
    width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }),
    toBlob: (callback: BlobCallback, _mime: string, value: number) => { quality = value; callback(new Blob(["jpeg"])); },
  };
  mockGlobals(t, { window: { setTimeout, clearTimeout }, document: { createElement: () => output } });
  const source = snapshot();
  source.detections[0].coasting = true;
  const frame = await encodeCameraFrame(source, true, "Test");
  assert.equal(output.width, 280);
  assert.equal(quality, 0.3);
  assert.equal(frame.meta.quality, "low");
  assert.deepEqual(frame.trackIds, []);
  source.canvas = { width: 120, height: 80 } as HTMLCanvasElement;
  await encodeCameraFrame(source, false, "Test");
  assert.equal(output.width, 120);
  assert.equal(output.height, 80);
});

test("confirmed events reserve capacity synchronously and preserve FIFO across camera restarts", async () => {
  const jobs: Array<ReturnType<typeof deferred<PendingCameraFrame>>> = [];
  const sources: CameraFrameSnapshot[] = [];
  const buffer = new CameraEventBuffer((source) => {
    sources.push(source);
    const job = deferred<PendingCameraFrame>();
    jobs.push(job);
    return job.promise;
  }, 2);
  const first = snapshot();
  assert.equal(buffer.enqueue(first, false, "Test"), true);
  assert.equal(buffer.hasTrack("person-one"), true);
  assert.equal(buffer.enqueue(first, false, "Test"), false);
  first.detections[0].box[0] = 0.9;
  first.geo!.lat = 50;
  assert.equal(sources[0].detections[0].box[0], 0.2);
  assert.equal(sources[0].geo!.lat, 20);
  assert.equal(buffer.enqueue(snapshot("person-two"), false, "Test"), true);
  assert.equal(buffer.full, true);
  assert.equal(buffer.enqueue(snapshot("person-three"), false, "Test"), false);
  buffer.beginRun();
  assert.equal(buffer.size, 2);
  assert.equal(buffer.hasTrack("person-one"), true);
  const frame = encoded(sources[0]);
  jobs[0].resolve(frame);
  assert.equal(await buffer.next(), frame);
  assert.equal(await buffer.next(), frame, "upload failure reuses the exact compressed frame");
  buffer.complete(encoded(sources[0]));
  assert.equal(buffer.size, 2, "a different object cannot dequeue the event");
  buffer.complete(frame);
  assert.equal(buffer.size, 1);
  assert.equal(buffer.hasTrack("person-one"), true, "posted tracks do not create duplicate events");
  buffer.beginRun();
  assert.equal(buffer.hasTrack("person-one"), false);
  assert.equal(buffer.hasTrack("person-two"), true);
  jobs[1].resolve(encoded(sources[1]));
  buffer.complete((await buffer.next())!);
  assert.equal(await buffer.next(), null);
});

test("failed encoding retains the frozen event and retries instead of losing its alarm", async () => {
  let attempts = 0;
  const buffer = new CameraEventBuffer(async (source) => {
    if (++attempts === 1) throw new Error("Suspended canvas");
    return encoded(source);
  });
  assert.equal(buffer.enqueue(snapshot(), false, "Test"), true);
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  assert.equal(buffer.size, 1);
  const frame = await buffer.next();
  assert.equal(attempts, 2);
  assert.equal(frame?.meta.capturedAt, "2026-11-10T09:00:00.000Z");
  assert.equal(buffer.size, 1);
});

test("cancelling an upload wait does not cancel its reserved encode or discard its event", async () => {
  const job = deferred<PendingCameraFrame>();
  let source!: CameraFrameSnapshot;
  const buffer = new CameraEventBuffer((next) => { source = next; return job.promise; });
  buffer.enqueue(snapshot(), false, "Test");
  const controller = new AbortController();
  const waiting = buffer.next(controller.signal);
  controller.abort();
  await assert.rejects(waiting, { name: "AbortError" });
  assert.equal(buffer.size, 1);
  buffer.beginRun();
  const frame = encoded(source);
  job.resolve(frame);
  assert.equal(await buffer.next(), frame);
  await assert.rejects(buffer.next(controller.signal), { name: "AbortError" });
  buffer.complete(frame);
  assert.equal(buffer.size, 0);
  assert.equal(buffer.enqueue({ ...snapshot(), detections: [rawDetection({ coasting: true })] }, false, "Test"), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../../src/lib/api-client";
import { cameraFrameVersion, loadCameraPreviewFrame } from "../../src/lib/camera-preview";
import { cameraSession, deferred } from "./fixtures";
import { mockGlobals } from "./helpers";

function environment() {
  const revoked: string[] = [];
  let created = 0;
  return {
    fetch: (async () => new Response(new Blob(["jpeg"]), { headers: { "X-Camera-Frame-Version": cameraFrameVersion(cameraSession())! } })) as typeof fetch,
    createObjectURL: () => `blob:test-${++created}`,
    revokeObjectURL: (url: string) => { revoked.push(url); },
    decode: async () => ({ width: 640, height: 360 }),
    revoked, get created() { return created; },
  };
}

test("preview freezes metadata before fetch/decode and returns dimensions from the decoded JPEG", async () => {
  const env = environment();
  const response = deferred<Response>();
  env.fetch = async () => response.promise;
  const session = cameraSession();
  const originalVersion = cameraFrameVersion(session)!;
  const pending = loadCameraPreviewFrame(session, new AbortController().signal, env);
  session.latestDetections[0].box[0] = 0.9;
  session.latestDetections[0].path![0][0] = 0.9;
  session.frameUpdatedAt = "2026-11-10T09:00:01.000Z";
  session.id = 2;
  response.resolve(new Response(new Blob(["jpeg"]), { headers: { "X-Camera-Frame-Version": originalVersion } }));
  const frame = await pending;
  assert.equal(frame.sessionId, 1);
  assert.equal(frame.version, originalVersion);
  assert.equal(frame.capturedAt, "2026-11-10T09:00:00.000Z");
  assert.equal(frame.detections[0].box[0], 0.2);
  assert.equal(frame.detections[0].path![0][0], 0.275);
  assert.equal(frame.width, 640);
  assert.equal(frame.height, 360);
  assert.deepEqual(env.revoked, [], "the committed URL belongs to the viewer, not this loader");
});

test("mismatched frame versions reject without creating an object URL", async () => {
  const env = environment();
  env.fetch = async () => new Response("new JPEG", { headers: { "X-Camera-Frame-Version": "different" } });
  await assert.rejects(loadCameraPreviewFrame(cameraSession(), new AbortController().signal, env),
    (error: unknown) => error instanceof ApiError && error.status === 409 && error.code === "FRAME_SUPERSEDED");
  assert.equal(env.created, 0);
  env.fetch = async () => new Response("JPEG without header");
  await assert.rejects(loadCameraPreviewFrame(cameraSession(), new AbortController().signal, env), /newer camera frame/);
});

test("HTTP errors retain their status/code; sessions without a valid frame never fetch", async () => {
  const env = environment();
  env.fetch = async () => Response.json({ error: "Sign in again", code: "AUTH_REQUIRED" }, { status: 401 });
  await assert.rejects(loadCameraPreviewFrame(cameraSession(), new AbortController().signal, env),
    (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === "AUTH_REQUIRED");
  assert.equal(env.created, 0);
  for (const session of [cameraSession({ frameUpdatedAt: "invalid" }), cameraSession({ frameUrl: null }), cameraSession({ frameUpdatedAt: null })]) {
    assert.equal(cameraFrameVersion(session), null);
    await assert.rejects(loadCameraPreviewFrame(session, new AbortController().signal, env), /no frame yet/);
  }
});

test("decode failure, invalid dimensions and late cancellation clean up only the candidate URL", async () => {
  const env = environment();
  env.decode = async () => { throw new Error("Broken JPEG"); };
  await assert.rejects(loadCameraPreviewFrame(cameraSession(), new AbortController().signal, env), /Broken JPEG/);
  assert.deepEqual(env.revoked, ["blob:test-1"]);
  for (const dimensions of [{ width: 0, height: 360 }, { width: NaN, height: 360 }, { width: 640, height: -1 }]) {
    env.decode = async () => dimensions;
    const before = env.revoked.length;
    await assert.rejects(loadCameraPreviewFrame(cameraSession(), new AbortController().signal, env), /could not be decoded/);
    assert.equal(env.revoked.length, before + 1, JSON.stringify(dimensions));
  }
  const decoded = deferred<{ width: number; height: number }>();
  const decoding = deferred<void>();
  env.decode = async () => { decoding.resolve(); return decoded.promise; };
  const controller = new AbortController();
  const pending = loadCameraPreviewFrame(cameraSession(), controller.signal, env);
  await decoding.promise;
  controller.abort();
  decoded.resolve({ width: 640, height: 360 });
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(env.revoked.length, 5);
  assert.ok(!env.revoked.includes("blob:previous-committed-frame"));
});

test("already-cancelled loads do not fetch and cancellation before blob allocation does not leak URLs", async () => {
  const env = environment();
  let fetches = 0;
  const response = deferred<Response>();
  env.fetch = async () => { fetches += 1; return response.promise; };
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(loadCameraPreviewFrame(cameraSession(), cancelled.signal, env), { name: "AbortError" });
  assert.equal(fetches, 0);
  const controller = new AbortController();
  const pending = loadCameraPreviewFrame(cameraSession(), controller.signal, env);
  controller.abort();
  response.resolve(new Response("JPEG"));
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(env.created, 0);
});

test("fallback Image decoding installs load handlers before assigning a synchronously cached image", async (t) => {
  class CachedImage {
    naturalWidth = 320;
    naturalHeight = 180;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) { this.onload?.(); }
  }
  mockGlobals(t, { Image: CachedImage, fetch: environment().fetch });
  const frame = await loadCameraPreviewFrame(cameraSession(), new AbortController().signal);
  t.after(() => URL.revokeObjectURL(frame.src));
  assert.equal(frame.width, 320);
  assert.equal(frame.height, 180);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import type { Database } from "../../src/db";
import {
  cameraAlerts, cameraDetections, cameraSessions, farmers,
  type CameraAlert,
  type CameraSession,
} from "../../src/db/schema";
import {
  acknowledgeAllCameraAlerts, acknowledgeCameraAlert, cameraSessionMetadataColumns,
  createCameraSession, getCameraSessionByToken, ingestCameraFrame,
  listCameraAlerts, listCameraSessions, verifyCameraDetections,
  type CameraIngestResult,
} from "../../src/lib/camera-queries";
import type { CameraIngestPayload, IngestDetection } from "../../src/lib/camera";

const client = new PGlite();
const database = drizzle(client, { schema: { cameraAlerts, cameraDetections, cameraSessions, farmers } });
const db = database as unknown as Database;
let farmerId = 0;
let otherFarmerId = 0;
let session: CameraSession;
let sessionId = 0;

const detection = (overrides: Partial<IngestDetection> = {}): IngestDetection => ({
  trackId: "p1-run", objectClass: "person", confidence: 0.9,
  box: [0.1, 0.1, 0.2, 0.3], confirmed: true, hits: 3, ...overrides,
});

const payload = (detections: IngestDetection[], extra: Partial<CameraIngestPayload> = {}): CameraIngestPayload => ({
  frame: "data:image/jpeg;base64,AAAA", frameWidth: 640, frameHeight: 360,
  detections, aiEnabled: true, ...extra,
});

async function loadSession(): Promise<CameraSession> {
  const rows = await database.select().from(cameraSessions).where(eq(cameraSessions.id, sessionId));
  return rows[0];
}

async function ingest(detections: IngestDetection[], extra: Partial<CameraIngestPayload> = {}): Promise<CameraIngestResult> {
  return ingestCameraFrame(db, await loadSession(), payload(detections, extra));
}

/** Emulates the dismissal-filtered keyset API without touching a remote DB. */
const alertsFor = (options: Parameters<typeof listCameraAlerts>[2] = {}) => listCameraAlerts(db, farmerId, options);

before(async () => {
  for (const file of ["0000_watery_joshua_kane.sql", "0001_happy_nextwave.sql", "0002_live_camera_tables.sql",
    "0003_remove_simulated_alerts.sql", "0004_first_wolfsbane.sql", "0005_greedy_thor_girl.sql"]) {
    await client.exec(readFileSync(join(process.cwd(), "drizzle", file), "utf8"));
  }
  const inserted = await database.insert(farmers).values([{ name: "Test farmer" }, { name: "Other farmer" }]).returning();
  farmerId = inserted[0].id;
  otherFarmerId = inserted[1].id;
  sessionId = (await createCameraSession(db, farmerId, "North field camera")).id;
  session = await loadSession();
});

after(async () => { await client.close(); });

test("alarm pages keep a snapshot-consistent total, cursor and dismissal filters", async () => {
  await database.insert(cameraAlerts).values(Array.from({ length: 30 }, (_, index) => ({
    sessionId, farmerId, label: "Person", category: "person", confidence: 0.9,
    message: `Human detected at North field camera (${index + 1})`,
  })));

  const first = await alertsFor({ limit: 5 });
  assert.deepEqual(first.alerts.map((alert) => alert.id).slice(0, 2), [30, 29]);
  assert.equal(first.alerts.length, 5);
  assert.equal(first.unread, 30);
  assert.equal(first.latestId, 30);
  assert.equal(first.nextCursor, 26);
  assert.equal(first.alerts[0].sessionName, "North field camera");
  assert.equal(first.alerts[0].reviewStatus, "pending");

  const older = await alertsFor({ limit: 5, beforeId: first.nextCursor! });
  assert.deepEqual(older.alerts.map((alert) => alert.id), [25, 24, 23, 22, 21]);
  assert.equal(older.unread, 30, "an older page never rewrites the global total");
  assert.equal(older.latestId, 30);
  assert.equal(older.nextCursor, 21);

  assert.equal(await acknowledgeCameraAlert(db, 28, otherFarmerId), false);
  assert.equal(await acknowledgeCameraAlert(db, 28, farmerId), true);
  const acked = await alertsFor({ limit: 5 });
  assert.deepEqual(acked.alerts.map((alert) => alert.id), [30, 29, 27, 26, 25]);
  assert.equal(acked.unread, 29);
  const history = await alertsFor({ limit: 5, beforeId: 29, includeAcknowledged: true });
  assert.deepEqual(history.alerts.map((alert) => alert.id), [28, 27, 26, 25, 24]);

  const filtered = await alertsFor({ limit: 5, excludedIds: [30, 29] });
  assert.deepEqual(filtered.alerts.map((alert) => alert.id), [27, 26, 25, 24, 23]);
  assert.equal(filtered.unread, 27);
  assert.deepEqual(filtered.excludedIds, [30, 29]);

  const newerOnly = await alertsFor({ limit: 5, afterId: 20, excludedIds: [30, 29] });
  assert.deepEqual(newerOnly.alerts.map((alert) => alert.id), [27, 26, 25, 24, 23]);
  assert.equal(newerOnly.unread, 7, "30/29 excluded, 28 remotely acknowledged, 21–27 unread");
  assert.equal(newerOnly.afterId, 20);

  const exhausted = await alertsFor({ limit: 5, beforeId: 1 });
  assert.deepEqual(exhausted.alerts, []);
  assert.equal(exhausted.unread, 29, "an unfiltered older page still reports the global unread total");
  assert.equal(exhausted.nextCursor, null);

  assert.equal(await acknowledgeAllCameraAlerts(db, otherFarmerId, 25), 0);
  assert.equal(await acknowledgeAllCameraAlerts(db, farmerId, 25), 25);
  assert.equal(await acknowledgeAllCameraAlerts(db, farmerId, 25), 0);
  const remaining = await alertsFor({ limit: 50 });
  assert.deepEqual(remaining.alerts.map((alert) => alert.id), [30, 29, 27, 26]);
  assert.equal(remaining.unread, 4);
  assert.equal(remaining.nextCursor, null);
});

test("clamped limits and empty filters cannot widen or crash alarm queries", async () => {
  const all = await alertsFor({ limit: 0 });
  assert.equal(all.alerts.length, 1, "a zero limit clamps to one row instead of returning everything");
  const capped = await alertsFor({ limit: 500 });
  assert.equal(capped.alerts.length, 4);
  const remainingIds = capped.alerts.map((alert) => alert.id);
  const none = await alertsFor({ excludedIds: remainingIds });
  assert.deepEqual(none.alerts, []);
  assert.equal(none.unread, 0);
});

test("ingest saves one detection and alarm per track, and retries recover receipts without duplicates", async () => {
  const first = await ingest([detection()]);
  assert.equal(first.newDetections.length, 1);
  assert.equal(first.newAlerts.length, 1);
  assert.equal(first.newAlerts[0].message, "Human detected at North field camera");
  assert.equal(first.session.totalDetections, 1);
  assert.deepEqual(first.verification?.ids, [first.newDetections[0].id]);

  const retry = await ingest([detection()]);
  assert.equal(retry.newDetections.length, 0);
  assert.equal(retry.newAlerts.length, 1);
  assert.equal(retry.newAlerts[0].id, first.newAlerts[0].id);
  assert.equal(retry.session.totalDetections, 1);

  await acknowledgeCameraAlert(db, first.newAlerts[0].id, farmerId);
  const afterAck = await ingest([detection()]);
  assert.equal(afterAck.newDetections.length, 0);
  assert.deepEqual(afterAck.newAlerts, []);

  // A distinct person immediately after the first is never suppressed.
  const second = await ingest([detection({ trackId: "p2-run" })]);
  assert.equal(second.newDetections.length, 1);
  assert.equal(second.newAlerts.length, 1);
  assert.notEqual(second.newAlerts[0].id, first.newAlerts[0].id);

  const animal = await ingest([detection({ trackId: "a1-run", objectClass: "wild boar", category: undefined } as Partial<IngestDetection>)]);
  assert.equal(animal.newAlerts[0].message, "Wild boar detected at North field camera");
  assert.equal(animal.newAlerts[0].category, "animal");
});

test("unconfirmed, non-target, malformed and duplicate tracks never raise alarms", async () => {
  const result = await ingest([
    detection({ trackId: "c1-run", confirmed: false }),
    detection({ trackId: "c2-run", coasting: true }),
    detection({ trackId: "c3-run", objectClass: "car" }),
    detection({ trackId: "c4-run", box: [NaN, 0.1, 0.2, 0.3] }),
    detection({ trackId: "c5-run", box: [0.1, 0.1, 0.2] as unknown as [number, number, number, number] }),
    detection({ trackId: "d1-run" }),
    detection({ trackId: "d1-run" }),
  ]);
  assert.deepEqual(result.newDetections.map((item) => item.trackId), ["d1-run"]);
  assert.equal(result.newAlerts.length, 1);
});

test("detection metadata is clamped, truncated and capped per frame", async () => {
  const result = await ingest([
    detection({
      trackId: `t-${"x".repeat(120)}`, objectClass: "cow", confidence: 5,
      box: [-0.2, 0.9, 0.5, 0.5], path: [[2, -1], [0.5, 0.5]], speed: 5_000,
      direction: "d".repeat(80), hits: 9_999,
    }),
    ...Array.from({ length: 15 }, (_, index) => detection({ trackId: `cap-${index}`, objectClass: "cow" })),
  ]);
  assert.equal(result.newDetections.length, 12);
  const stored = result.newDetections[0];
  assert.equal(stored.trackId?.length, 80);
  assert.equal(stored.confidence, 1);
  assert.equal(stored.speed, 1_000);
  assert.equal(stored.direction?.length, 40);
  assert.ok(stored.box && Math.abs(stored.box[0]) < 1e-10 && Math.abs(stored.box[2] - 0.3) < 1e-10);
  assert.equal(result.newAlerts[0].category, "animal");
});

test("an interrupted ingest repairs the missing alarm without duplicating its detection", async () => {
  const [orphan] = await database.insert(cameraDetections).values({
    sessionId, farmerId, label: "Person", category: "person", trackId: "repair-run",
    box: [0.2, 0.2, 0.2, 0.3], confirmed: true, source: "on-device",
  }).returning();
  const result = await ingest([detection({ trackId: "repair-run" })]);
  assert.equal(result.newDetections.length, 0);
  assert.equal(result.newAlerts.length, 1);
  assert.equal(result.newAlerts[0].detectionId, orphan.id);
});

test("frame versions increase strictly, metadata polls avoid JPEG bytes, and stopped sessions stay ended", async () => {
  const before = await ingest([], { frame: "data:image/jpeg;base64,AAAA" });
  const after = await ingest([], { frame: "data:image/jpeg;base64,BBBB" });
  assert.ok(new Date(after.session.frameUpdatedAt!).getTime() > new Date(before.session.frameUpdatedAt!).getTime());

  const raw = await database.select({ frame: cameraSessions.latestFrame }).from(cameraSessions).where(eq(cameraSessions.id, sessionId));
  assert.equal(raw[0].frame, "data:image/jpeg;base64,BBBB");
  const metadata = await database.select(cameraSessionMetadataColumns).from(cameraSessions).where(eq(cameraSessions.id, sessionId));
  assert.equal(metadata[0].latestFrame, null);
  const listed = await listCameraSessions(db, farmerId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].frameUrl, `/api/camera/sessions/${sessionId}/frame?v=${new Date(metadata[0].frameUpdatedAt!).getTime()}`);
  assert.ok(!("latestFrame" in listed[0]));

  await database.update(cameraSessions).set({ status: "ended", endedAt: new Date(), latestDetections: [] }).where(eq(cameraSessions.id, sessionId));
  const stopped = await ingest([], { frame: "data:image/jpeg;base64,CCCC" });
  assert.equal(stopped.session.status, "ended");
  assert.deepEqual(stopped.session.latestDetections, []);
  const fenced = await database.select({ frame: cameraSessions.latestFrame, status: cameraSessions.status }).from(cameraSessions).where(eq(cameraSessions.id, sessionId));
  assert.equal(fenced[0].status, "ended");
  assert.equal(fenced[0].frame, "data:image/jpeg;base64,BBBB");

  const pairing = await getCameraSessionByToken(db, session.token);
  assert.equal(pairing?.farmerName, "Test farmer");
  assert.equal(pairing?.session.status, "ended");
});

test("Groq refutations keep alarms for human review and never acknowledge them", async (t) => {
  await database.update(cameraSessions).set({ status: "live", endedAt: null }).where(eq(cameraSessions.id, sessionId));
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GROQ_API_KEY;
  t.after(() => { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey; });
  process.env.GROQ_API_KEY = "test-key";
  const reply = (verdict: unknown) => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(verdict) } }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  };

  reply({ verdict: "none", humans: 0, human_confidence: 0, animals: [] });
  const weak = await ingest([detection({ trackId: "weak-dog-run", objectClass: "dog", confidence: 0.5 })]);
  await verifyCameraDetections(db, sessionId, weak.verification!.ids, weak.verification!.frame);
  const refuted = await database.select().from(cameraDetections).where(eq(cameraDetections.id, weak.newDetections[0].id));
  assert.equal(refuted[0].source, "groq");
  assert.equal(refuted[0].verified, false);
  const refutedAlert = await database.select().from(cameraAlerts).where(eq(cameraAlerts.detectionId, weak.newDetections[0].id));
  assert.match(refutedAlert[0].message, /AI could not confirm/);
  assert.equal(refutedAlert[0].acknowledgedAt, null);
  assert.ok(!((await loadSession()).latestDetections ?? []).some((item) => item.trackId === "weak-dog-run"));

  reply({ verdict: "animal", humans: 0, human_confidence: 0.2, animals: [{ species: "wild boar", confidence: 0.9 }] });
  const person = await ingest([detection({ trackId: "mislabel-run", confidence: 0.55 })]);
  await verifyCameraDetections(db, sessionId, person.verification!.ids, person.verification!.frame);
  const relabelled = await database.select().from(cameraDetections).where(eq(cameraDetections.id, person.newDetections[0].id));
  assert.equal(relabelled[0].label, "Wild boar");
  assert.equal(relabelled[0].category, "animal");
  assert.equal(relabelled[0].verified, true);
  const relabelledAlert = await database.select().from(cameraAlerts).where(eq(cameraAlerts.detectionId, person.newDetections[0].id));
  assert.equal(relabelledAlert[0].label, "Wild boar");
  assert.equal(relabelledAlert[0].message, "Wild boar detected at North field camera");
  assert.ok(((await loadSession()).latestDetections ?? []).some((item) => item.trackId === "mislabel-run" && item.label === "Wild boar"));

  reply({ verdict: "none", humans: 0, human_confidence: 0, animals: [] });
  const strong = await ingest([detection({ trackId: "strong-run", confidence: 0.85 })]);
  await verifyCameraDetections(db, sessionId, strong.verification!.ids, strong.verification!.frame);
  const retained = await database.select().from(cameraDetections).where(eq(cameraDetections.id, strong.newDetections[0].id));
  assert.equal(retained[0].source, "on-device");
  assert.equal(retained[0].label, "Person");
  assert.equal(retained[0].verified, false);

  globalThis.fetch = (async () => new Response("upstream failed", { status: 500 })) as typeof fetch;
  const failed = await ingest([detection({ trackId: "provider-down-run", objectClass: "cow", confidence: 0.7 })]);
  await verifyCameraDetections(db, sessionId, failed.verification!.ids, failed.verification!.frame);
  const untouched = await database.select().from(cameraDetections).where(eq(cameraDetections.id, failed.newDetections[0].id));
  assert.equal(untouched[0].label, "Cow");
  assert.equal(untouched[0].source, "on-device");
});

test("verification is a no-op without an API key, ids, or an existing detection", async (t) => {
  const originalKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  t.after(() => { if (originalKey !== undefined) process.env.GROQ_API_KEY = originalKey; });
  const rows: CameraAlert[] = await database.select().from(cameraAlerts).limit(1);
  const before = rows[0];
  await verifyCameraDetections(db, sessionId, [], "data:image/jpeg;base64,AAAA");
  await verifyCameraDetections(db, sessionId, [999_999], "data:image/jpeg;base64,AAAA");
  const afterRows: CameraAlert[] = await database.select().from(cameraAlerts).where(eq(cameraAlerts.id, before.id));
  assert.deepEqual(afterRows[0], before);
});
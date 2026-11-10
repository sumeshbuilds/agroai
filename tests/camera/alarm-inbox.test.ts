import assert from "node:assert/strict";
import { test } from "node:test";
import { CameraAlarmInbox } from "../../src/lib/camera-alarm-inbox";
import { MAX_ALARM_EXCLUSIONS } from "../../src/lib/camera-alert-request";
import { alarm, alarmPage } from "./fixtures";

const alarms = (count: number, start = 1) => Array.from({ length: count }, (_, index) => alarm(start + index));
const ids = (inbox: CameraAlarmInbox) => inbox.getSnapshot().alerts.map((item) => item.id);

test("all alarms latch; empty polls, remote acknowledgements and AI disagreement do not stop them", () => {
  const inbox = new CameraAlarmInbox();
  inbox.ingest(alarmPage(alarms(8)));
  assert.equal(ids(inbox).length, 8);
  inbox.ingest(alarmPage([]));
  assert.equal(ids(inbox).length, 8);
  inbox.ingest(alarmPage([alarm(8, { source: "groq", verified: false, reviewStatus: "unconfirmed" })]));
  assert.equal(inbox.getSnapshot().alerts[0].reviewStatus, "unconfirmed");
  assert.equal(inbox.getSnapshot().unread, 8);
});

test("offline reload preserves alarms and individual dismissal tombstones", () => {
  const inbox = new CameraAlarmInbox();
  inbox.ingest(alarmPage(alarms(7)));
  inbox.dismiss(6);
  const restored = new CameraAlarmInbox();
  restored.hydrate(inbox.serialize());
  assert.deepEqual(ids(restored), [7, 5, 4, 3, 2, 1]);
  assert.deepEqual(restored.getSnapshot().pending.ids, [6]);
  restored.ingest(alarmPage(alarms(7))); // Stale, unfiltered response.
  assert.deepEqual(ids(restored), [7, 5, 4, 3, 2, 1]);
  assert.equal(restored.getSnapshot().unread, 6);
});

test("stop-through snapshots do not stop genuinely newer alarms", () => {
  const inbox = new CameraAlarmInbox();
  inbox.ingest(alarmPage(alarms(90)));
  inbox.dismissThrough(inbox.getSnapshot().latestId);
  assert.equal(inbox.getSnapshot().unread, 0);
  assert.equal(inbox.getSnapshot().nextCursor, null);
  inbox.ingest(alarmPage(alarms(93))); // Request began before the click.
  assert.deepEqual(ids(inbox), [93, 92, 91]);
  assert.equal(inbox.getSnapshot().unread, 3);
  inbox.ingest(alarmPage(alarms(93), inbox.getQueryScope()));
  assert.equal(inbox.getSnapshot().nextCursor, null);
  assert.equal(inbox.getSnapshot().unread, 3);
});

test("an old acknowledgement response cannot clear a later stop snapshot", () => {
  const inbox = new CameraAlarmInbox();
  inbox.ingest(alarmPage([alarm(100)]));
  inbox.dismissThrough(100);
  inbox.ingest(alarmPage([alarm(101)], inbox.getQueryScope()));
  inbox.dismissThrough(101);
  inbox.savedThrough(100);
  assert.equal(inbox.getSnapshot().pending.throughId, 101);
  inbox.savedThrough(101);
  assert.equal(inbox.getSnapshot().pending.throughId, 0);
  assert.equal(inbox.isDismissed(100), true);
  assert.equal(inbox.isDismissed(101), true);
});

test("saved single dismissals fence stale totals even after pending acknowledgements clear", () => {
  const inbox = new CameraAlarmInbox();
  const rows = alarms(100);
  inbox.ingest(alarmPage(rows));
  inbox.dismiss(2); // Not on the fresh page.
  inbox.savedId(2);
  inbox.ingest(alarmPage(rows));
  assert.equal(inbox.getSnapshot().unread, 99);
  assert.deepEqual(inbox.getQueryScope().excludedIds, [2]);
  inbox.ingest(alarmPage(rows, inbox.getQueryScope()));
  assert.equal(inbox.getSnapshot().unread, 99);
});

test("fresh polling never overwrites unfinished older pagination", () => {
  const inbox = new CameraAlarmInbox();
  const rows = alarms(160);
  inbox.ingest(alarmPage(rows));
  assert.equal(inbox.getSnapshot().nextCursor, 111);
  inbox.ingest(alarmPage(rows));
  assert.equal(inbox.getSnapshot().nextCursor, 111);
  const beforeId = inbox.getSnapshot().nextCursor!;
  inbox.ingest(alarmPage(rows, { beforeId }), beforeId);
  assert.equal(inbox.getSnapshot().nextCursor, 61);
  inbox.ingest(alarmPage(rows));
  assert.equal(inbox.getSnapshot().nextCursor, 61);
});

test("large new gaps and old history both catch up in bounded older pages", () => {
  const inbox = new CameraAlarmInbox();
  inbox.ingest(alarmPage(alarms(120)));
  const oldCursor = inbox.getSnapshot().nextCursor!;
  inbox.ingest(alarmPage(alarms(120), { beforeId: oldCursor }), oldCursor);
  const rows = alarms(480);
  inbox.ingest(alarmPage(rows));
  let pages = 0;
  while (inbox.getSnapshot().nextCursor) {
    const beforeId = inbox.getSnapshot().nextCursor!;
    inbox.ingest(alarmPage(rows, { ...inbox.getQueryScope(), beforeId }), beforeId);
    inbox.ingest(alarmPage(rows, inbox.getQueryScope()));
    assert.ok(++pages < 15, "pagination must make progress");
  }
  assert.equal(ids(inbox).length, 480);
  assert.equal(inbox.getSnapshot().unread, 480);
  inbox.ingest(alarmPage([...rows, alarm(10_000)], inbox.getQueryScope()));
  assert.equal(inbox.getSnapshot().nextCursor, null, "empty numeric gaps do not need thousands of requests");
  assert.equal(ids(inbox).length, 481);
});

test("exhausted old pages preserve totals and stop looping", () => {
  const inbox = new CameraAlarmInbox();
  inbox.ingest(alarmPage(alarms(140)));
  const beforeId = inbox.getSnapshot().nextCursor!;
  const remote = alarms(50, 91); // Older records were acknowledged elsewhere.
  inbox.ingest(alarmPage(remote, { beforeId }), beforeId);
  assert.equal(inbox.getSnapshot().nextCursor, null);
  assert.equal(inbox.getSnapshot().unread, 50);
});

test("pending dismissals beyond the URL cap subtract from the global total, not only this page", () => {
  const inbox = new CameraAlarmInbox();
  const rows = alarms(MAX_ALARM_EXCLUSIONS + 100);
  inbox.ingest(alarmPage(rows));
  for (let id = 1; id <= MAX_ALARM_EXCLUSIONS + 20; id += 1) inbox.dismiss(id);
  assert.equal(inbox.getQueryScope().excludedIds.length, MAX_ALARM_EXCLUSIONS);
  inbox.ingest(alarmPage(rows, inbox.getQueryScope()));
  assert.equal(inbox.getSnapshot().unread, 80);
  while (inbox.getSnapshot().nextCursor) {
    const beforeId = inbox.getSnapshot().nextCursor!;
    inbox.ingest(alarmPage(rows, { ...inbox.getQueryScope(), beforeId }), beforeId);
  }
  assert.equal(ids(inbox).length, 80);
  assert.ok(ids(inbox).every((id) => id > MAX_ALARM_EXCLUSIONS + 20));
});

test("hydration accepts version 1, reconciles contradictory pending stops and normalises nullable fields", () => {
  const inbox = new CameraAlarmInbox();
  inbox.hydrate(JSON.stringify({
    version: 1, throughId: 4, latestId: 2, pending: { throughId: 5, ids: [6, "7", -1] },
    alerts: [alarm(4), alarm(6), { ...alarm(8), confidence: 200, createdAt: "invalid", lat: 100, lng: 200 }],
  }));
  assert.deepEqual(ids(inbox), [8]);
  const item = inbox.getSnapshot().alerts[0];
  assert.equal(item.confidence, 1);
  assert.equal(item.createdAt, null);
  assert.equal(item.lat, null);
  assert.equal(item.lng, null);
  assert.equal(inbox.isDismissed(6), true);
  assert.equal(inbox.getSnapshot().latestId, 8);
  assert.deepEqual(inbox.getSnapshot().pending, { throughId: 5, ids: [6] });
});

test("corrupt storage, invalid alerts, invalid ids and non-advancing cursors cannot revive alarms", () => {
  const inbox = new CameraAlarmInbox();
  for (const raw of ["{", "null", "[]", '{"version":99}', JSON.stringify({ version: 2, alerts: [null, {}, { ...alarm(1), category: "vehicle" }] })]) inbox.hydrate(raw);
  assert.deepEqual(ids(inbox), []);
  for (const id of [0, -1, 1.5, NaN, Infinity]) { inbox.dismiss(id); inbox.dismissThrough(id); }
  assert.deepEqual(inbox.getSnapshot().pending, { throughId: 0, ids: [] });
  assert.throws(() => inbox.ingest({ ...alarmPage([alarm(4)]), nextCursor: 10 }, 10), /Invalid camera alarm page/);
});

test("external-store snapshots are stable between changes and subscriptions clean up", () => {
  const inbox = new CameraAlarmInbox();
  const initial = inbox.getSnapshot();
  assert.equal(inbox.getSnapshot(), initial);
  let changes = 0;
  const unsubscribe = inbox.subscribe(() => { changes += 1; });
  inbox.ingest(alarmPage([alarm(1)]));
  assert.notEqual(inbox.getSnapshot(), initial);
  unsubscribe();
  inbox.dismiss(1);
  assert.equal(changes, 1);
});

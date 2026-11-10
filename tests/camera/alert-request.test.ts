import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ALARM_EXCLUSIONS, parseCameraAlarmAcknowledgement, parseCameraAlarmQuery } from "../../src/lib/camera-alert-request";

test("acknowledgements require an explicit valid single id or stopped snapshot", () => {
  assert.deepEqual(parseCameraAlarmAcknowledgement({ id: 12 }), { all: false, id: 12 });
  assert.deepEqual(parseCameraAlarmAcknowledgement({ all: true, throughId: 99 }), { all: true, throughId: 99 });
  for (const value of [null, [], {}, { all: true }, { all: "true" }, { all: false },
    { id: "12" }, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: NaN }, { id: Infinity },
    { all: true, throughId: 99, id: 12 }, { all: false, id: 12 }, { id: 12, throughId: 99 },
    { all: true, throughId: "99" }, { all: true, throughId: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.equal(parseCameraAlarmAcknowledgement(value), null, JSON.stringify(value));
  }
});

test("query scopes validate cursors, de-duplicate exclusions and bound page sizes", () => {
  assert.deepEqual(parseCameraAlarmQuery(new URLSearchParams("before=90&after=10&exclude=12,12,13&limit=500&all=1")), {
    beforeId: 90, afterId: 10, excludedIds: [12, 13], limit: 50, includeAcknowledged: true,
  });
  assert.equal(parseCameraAlarmQuery(new URLSearchParams())?.limit, 20);
  assert.equal(parseCameraAlarmQuery(new URLSearchParams("after=0"))?.afterId, 0);
  for (const query of ["before=0", "before=-1", "before=1.5", "before=1e3", "before=NaN", "after=-1",
    "before=9007199254740992", "before=1&before=2", "exclude=", "exclude=1,", "exclude=1,x", "exclude=0", "exclude=1&exclude=2"]) {
    assert.equal(parseCameraAlarmQuery(new URLSearchParams(query)), null, query);
  }
  assert.equal(parseCameraAlarmQuery(new URLSearchParams({ exclude: Array.from({ length: MAX_ALARM_EXCLUSIONS + 1 }, (_, id) => id + 1).join(",") })), null);
});

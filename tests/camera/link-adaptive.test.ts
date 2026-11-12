import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isDegradedLink,
  nextPollDelay,
  nextSessionListDelay,
  uploadBackoffMs,
  uploadCadenceMs,
  uploadTimeoutMs,
} from "../../src/lib/camera-link";

describe("phone link tuning", () => {
  it("treats measured slowness and recent failures as degraded", () => {
    assert.equal(isDegradedLink({ slow: false, uploadMs: 300, failures: 0 }), false);
    assert.equal(isDegradedLink({ slow: true, uploadMs: 300, failures: 0 }), true);
    assert.equal(isDegradedLink({ slow: false, uploadMs: 3_000, failures: 0 }), true);
    assert.equal(isDegradedLink({ slow: false, uploadMs: 300, failures: 1 }), true);
  });

  it("keeps the upload timeout bounded so a hung request cannot stall forever", () => {
    assert.equal(uploadTimeoutMs({ slow: false, uploadMs: 0 }), 18_000);
    assert.equal(uploadTimeoutMs({ slow: true, uploadMs: 0 }), 14_000);
    assert.equal(uploadTimeoutMs({ slow: false, uploadMs: 1_000 }), 18_000);
    assert.equal(uploadTimeoutMs({ slow: true, uploadMs: 20_000 }), 25_000);
  });

  it("backs off exponentially after failed uploads", () => {
    assert.equal(uploadBackoffMs(0), 0);
    assert.equal(uploadBackoffMs(1), 2_000);
    assert.equal(uploadBackoffMs(2), 4_000);
    assert.equal(uploadBackoffMs(3), 8_000);
    assert.equal(uploadBackoffMs(4), 16_000);
    assert.equal(uploadBackoffMs(8), 30_000);
  });

  it("leaves roughly half the measured link free for the next frame", () => {
    assert.equal(
      uploadCadenceMs({ baseIntervalMs: 700, uploadMs: 4_000, failures: 0, slow: false }),
      8_000,
    );
    assert.equal(
      uploadCadenceMs({ baseIntervalMs: 700, uploadMs: 300, failures: 0, slow: false }),
      700,
    );
    assert.equal(
      uploadCadenceMs({ baseIntervalMs: 5_000, uploadMs: 1_000, failures: 3, slow: true }),
      8_000,
    );
    assert.equal(
      uploadCadenceMs({ baseIntervalMs: 700, uploadMs: 40_000, failures: 0, slow: true }),
      30_000,
    );
  });
});

describe("dashboard poll tuning", () => {
  it("polls slowly when offline or hidden and backs off after failures", () => {
    const base = {
      hidden: false,
      online: true,
      failures: 0,
      live: true,
      slow: false,
      hasFrame: true,
    };

    assert.equal(nextPollDelay({ ...base, online: false }), 10_000);
    assert.equal(nextPollDelay({ ...base, hidden: true }), 15_000);
    assert.equal(nextPollDelay(base), 1_500);
    assert.equal(nextPollDelay({ ...base, slow: true }), 4_000);
    assert.equal(nextPollDelay({ ...base, failures: 1 }), 3_000);
    assert.equal(nextPollDelay({ ...base, failures: 2 }), 6_000);
    assert.equal(nextPollDelay({ ...base, failures: 6 }), 15_000);
  });

  it("slows the cheap session-list poll too", () => {
    assert.equal(nextSessionListDelay({ hidden: false, online: true, failures: 0 }), 8_000);
    assert.equal(nextSessionListDelay({ hidden: false, online: true, failures: 2 }), 16_000);
    assert.equal(nextSessionListDelay({ hidden: false, online: true, failures: 5 }), 24_000);
    assert.equal(nextSessionListDelay({ hidden: true, online: true, failures: 0 }), 20_000);
    assert.equal(nextSessionListDelay({ hidden: false, online: false, failures: 0 }), 15_000);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  alertCooldownRemaining,
  batteryPercentLabel,
  cameraDeviceStatus,
  canRaiseIntrusion,
  hasCaptureAnimal,
  isSecurityAnimalClass,
  isSecurityAnimalConfident,
  parseHeartbeat,
  parseRtcDescription,
  SECURITY_ALERT_COOLDOWN_MS,
  SECURITY_MIN_CONFIDENCE,
  trimOfflineQueue,
} from "../../src/lib/security-camera";

describe("security camera animal gate", () => {
  it("only accepts the configured COCO-SSD animal classes", () => {
    assert.equal(isSecurityAnimalClass("cow"), true);
    assert.equal(isSecurityAnimalClass(" Elephant "), true);
    assert.equal(isSecurityAnimalClass("person"), false);
    assert.equal(isSecurityAnimalClass("car"), false);
  });

  it("requires at least 55% confidence", () => {
    assert.equal(SECURITY_MIN_CONFIDENCE, 0.55);
    assert.equal(isSecurityAnimalConfident("cow", 0.55), true);
    assert.equal(isSecurityAnimalConfident("cow", 0.549), false);
    assert.equal(isSecurityAnimalConfident("person", 0.99), false);
    assert.equal(isSecurityAnimalConfident("cow", Number.NaN), false);
  });

  it("ignores coasting and unconfirmed tracks when opening the capture gate", () => {
    const base = { objectClass: "cow", confidence: 0.9, confirmed: true };
    assert.equal(hasCaptureAnimal([base]), true);
    assert.equal(hasCaptureAnimal([{ ...base, coasting: true }]), false);
    assert.equal(hasCaptureAnimal([{ ...base, confirmed: false }]), false);
    assert.equal(
      hasCaptureAnimal([{ ...base, objectClass: "person" }, { ...base, confidence: 0.4 }]),
      false,
    );
  });
});

describe("security camera alert cooldown", () => {
  it("allows the first alert and blocks the next 15 seconds", () => {
    const now = 1_000_000;
    assert.equal(canRaiseIntrusion(0, now), true);
    assert.equal(canRaiseIntrusion(now, now + 1_000), false);
    assert.equal(
      alertCooldownRemaining(now, now + 1_000),
      SECURITY_ALERT_COOLDOWN_MS - 1_000,
    );
    assert.equal(canRaiseIntrusion(now, now + SECURITY_ALERT_COOLDOWN_MS), true);
  });

  it("treats an invalid stored timestamp as ready", () => {
    assert.equal(canRaiseIntrusion(Number.NaN, 5_000), true);
    assert.equal(canRaiseIntrusion(-1, 5_000), true);
  });
});

describe("security camera device badge", () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");

  it("shows armed while the heartbeat is fresh", () => {
    assert.equal(
      cameraDeviceStatus({
        status: "armed",
        lastHeartbeat: new Date(now - 30_000),
        now,
      }),
      "armed",
    );
  });

  it("falls back to offline after 90 seconds without a heartbeat", () => {
    assert.equal(
      cameraDeviceStatus({
        status: "armed",
        lastHeartbeat: new Date(now - 91_000),
        now,
      }),
      "offline",
    );
    assert.equal(cameraDeviceStatus({ status: "armed", lastHeartbeat: null, now }), "offline");
  });

  it("shows live peek only inside the 60-second window", () => {
    assert.equal(
      cameraDeviceStatus({
        status: "live_peek",
        lastHeartbeat: new Date(now - 5_000),
        livePeekUntil: new Date(now + 30_000),
        now,
      }),
      "live_peek",
    );
    assert.equal(
      cameraDeviceStatus({
        status: "live_peek",
        lastHeartbeat: new Date(now - 5_000),
        livePeekUntil: new Date(now - 1_000),
        now,
      }),
      "armed",
    );
  });

  it("keeps a stopped camera stopped", () => {
    assert.equal(
      cameraDeviceStatus({
        status: "ended",
        lastHeartbeat: new Date(now),
        now,
      }),
      "ended",
    );
  });
});

describe("offline capture queue trimming", () => {
  it("keeps the newest 20 captures, oldest first", () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      capturedAt: new Date(1_000 + index * 1_000).toISOString(),
      id: String(index),
    }));
    const trimmed = trimOfflineQueue(items, 20);
    assert.equal(trimmed.length, 20);
    assert.equal(trimmed[0].id, "5");
    assert.equal(trimmed.at(-1)?.id, "24");
  });

  it("keeps the queue bounded when the limit is zero", () => {
    assert.deepEqual(trimOfflineQueue([{ capturedAt: new Date().toISOString() }], 0), []);
  });
});

describe("heartbeat and signalling parsing", () => {
  it("clamps battery and rejects impossible coordinates", () => {
    const parsed = parseHeartbeat({
      status: "armed",
      batteryLevel: 140,
      deviceLabel: "  Android camera  ",
      lat: 120,
      lng: 85.3,
    });
    assert.deepEqual(parsed, {
      status: "armed",
      batteryLevel: 100,
      deviceLabel: "Android camera",
      lat: null,
      lng: 85.3,
    });
  });

  it("defaults an unknown heartbeat status to armed", () => {
    assert.equal(parseHeartbeat({ status: "exploded" })?.status, "armed");
    assert.equal(parseHeartbeat(null), null);
  });

  it("accepts only plausible SDP text", () => {
    assert.equal(parseRtcDescription({ description: "v=0\r\no=- 1 2 IN IP4 127.0.0.1" }), "v=0\r\no=- 1 2 IN IP4 127.0.0.1");
    assert.equal(parseRtcDescription({ description: "not sdp" }), null);
    assert.equal(parseRtcDescription({}), null);
  });

  it("formats battery labels safely", () => {
    assert.equal(batteryPercentLabel(78.4), "78%");
    assert.equal(batteryPercentLabel(-5), "0%");
    assert.equal(batteryPercentLabel(null), null);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isLowResolution } from "../../src/lib/image";

describe("isLowResolution", () => {
  it("accepts ordinary phone and WhatsApp photos", () => {
    // A WhatsApp-compressed landscape photo (1120 x 638) used to be flagged
    // because its short edge fell under 600 px, even though its long edge is sharp.
    assert.equal(isLowResolution(1120, 638), false);
    assert.equal(isLowResolution(1600, 1200), false);
    assert.equal(isLowResolution(3024, 4032), false);
    assert.equal(isLowResolution(1280, 720), false);
    assert.equal(isLowResolution(1024, 576), false);
    assert.equal(isLowResolution(800, 600), false);
  });

  it("flags genuinely tiny source photos", () => {
    assert.equal(isLowResolution(640, 480), true);
    assert.equal(isLowResolution(480, 640), true);
    assert.equal(isLowResolution(320, 240), true);
    assert.equal(isLowResolution(799, 2000), false);
    assert.equal(isLowResolution(2000, 799), false);
  });

  it("ignores images with no measurable pixels", () => {
    assert.equal(isLowResolution(0, 0), false);
    assert.equal(isLowResolution(0, 1200), false);
    assert.equal(isLowResolution(Number.NaN, 1200), false);
  });
});

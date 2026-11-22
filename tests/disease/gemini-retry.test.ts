import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMissingGeminiModel, isRetryableGeminiError } from "../../src/lib/gemini-resilient";

describe("isRetryableGeminiError", () => {
  it("retries transient demand-spike answers", () => {
    assert.equal(
      isRetryableGeminiError(
        new Error(
          "[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.",
        ),
      ),
      true,
    );
    assert.equal(isRetryableGeminiError(new Error("HTTP 429 rate limit")), true);
    assert.equal(isRetryableGeminiError(new Error("HTTP 500")), true);
    assert.equal(isRetryableGeminiError(new Error("HTTP 502")), true);
    assert.equal(isRetryableGeminiError(new Error("HTTP 504")), true);
  });

  it("does not retry a timeout, a bad model or a bad key", () => {
    assert.equal(
      isRetryableGeminiError(new Error("Request aborted: This operation was aborted")),
      false,
    );
    assert.equal(isRetryableGeminiError(new Error("Request timed out")), false);
    assert.equal(isRetryableGeminiError(new Error("HTTP 404 model not found")), false);
    assert.equal(isRetryableGeminiError(new Error("API key not valid")), false);
    assert.equal(isRetryableGeminiError(new Error("Gemini returned an unreadable analysis.")), false);
  });

  it("does not retry a random error", () => {
    assert.equal(isRetryableGeminiError("something else"), false);
  });
});

describe("isMissingGeminiModel", () => {
  it("flags a model name that no longer exists so the next one is tried", () => {
    assert.equal(
      isMissingGeminiModel(
        new Error("[404 Not Found] models/gemini-2.5-flash is not found for API version v1beta"),
      ),
      true,
    );
    assert.equal(isMissingGeminiModel(new Error("model does not exist")), true);
  });

  it("ignores a busy or timed-out model", () => {
    assert.equal(isMissingGeminiModel(new Error("503 Service Unavailable")), false);
    assert.equal(isMissingGeminiModel(new Error("Request timed out")), false);
  });
});

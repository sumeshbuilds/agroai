import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  identifyWithPlantNet,
  isPlantNetConfigured,
  organForPlantPart,
} from "../../src/lib/plantnet";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.PLANTNET_API_KEY;

interface Recorded {
  url: string;
  organ: string | null;
  hasImagesField: boolean;
}

function installFetch(
  handler: (url: string) => Response | Promise<Response>,
  recorded: Recorded[] = [],
): Recorded[] {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const body = init?.body;
    const form = body instanceof FormData ? body : null;
    recorded.push({
      url,
      organ: form ? String(form.get("organs") ?? "") : null,
      hasImagesField: form ? form.has("images") : false,
    });
    return handler(url);
  }) as typeof fetch;
  return recorded;
}

const SPECIES_OK = {
  query: { project: "all", organs: ["leaf"] },
  predictedOrgans: [{ organ: "leaf", score: 0.66 }],
  bestMatch: "Solanum lycopersicum L.",
  results: [
    {
      score: 0.94,
      species: {
        scientificNameWithoutAuthor: "Solanum lycopersicum",
        scientificName: "Solanum lycopersicum L.",
        genus: { scientificName: "Solanum" },
        family: { scientificName: "Solanaceae" },
        commonNames: ["Tomato", "Garden tomato"],
      },
      gbif: { id: "2930137" },
    },
    {
      score: 0.02,
      species: {
        scientificName: "Solanum pimpinellifolium",
        commonNames: ["Currant tomato"],
        genus: { scientificName: "Solanum" },
        family: { scientificName: "Solanaceae" },
      },
    },
  ],
  version: "2025-08-08 (7.4)",
  remainingIdentificationRequests: 490,
};

const DISEASE_OK = {
  results: [
    { name: "PHYTIN", score: 0.71, description: "Phytophthora infestans" },
    { name: "ALTESO", score: 0.2, description: "Alternaria solani" },
  ],
  version: "2025-08-08 (7.4)",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("plantnet client", () => {
  beforeEach(() => {
    process.env.PLANTNET_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined) delete process.env.PLANTNET_API_KEY;
    else process.env.PLANTNET_API_KEY = ORIGINAL_KEY;
  });

  it("maps plant parts to Pl@ntNet organs", () => {
    assert.equal(organForPlantPart("leaf"), "leaf");
    assert.equal(organForPlantPart("flower"), "flower");
    assert.equal(organForPlantPart("fruit"), "fruit");
    assert.equal(organForPlantPart("root"), "auto");
    assert.equal(organForPlantPart(null), "auto");
  });

  it("is not configured without a key", () => {
    delete process.env.PLANTNET_API_KEY;
    assert.equal(isPlantNetConfigured(), false);
  });

  it("parses species and disease from both endpoints", async () => {
    const recorded = installFetch((url) =>
      url.includes("/v2/diseases") ? json(DISEASE_OK) : json(SPECIES_OK),
    );

    const outcome = await identifyWithPlantNet({
      imageBase64: Buffer.from("fake").toString("base64"),
      mimeType: "image/jpeg",
      plantPart: "leaf",
    });

    assert.ok(outcome.identification);
    assert.equal(outcome.rejected, false);
    assert.equal(outcome.failed, false);
    assert.equal(
      outcome.identification.scientificName,
      "Solanum lycopersicum L.",
    );
    assert.equal(outcome.identification.family, "Solanaceae");
    assert.equal(outcome.identification.score, 0.94);
    assert.equal(outcome.identification.diseases[0].label, "Phytophthora infestans");
    assert.equal(outcome.identification.diseases[0].code, "PHYTIN");
    assert.equal(outcome.identification.commonNames[0], "Tomato");

    assert.equal(recorded.length, 2);
    assert.ok(recorded.some((r) => r.url.includes("/v2/identify/all")));
    assert.ok(recorded.some((r) => r.url.includes("/v2/diseases/identify")));
    assert.ok(recorded.every((r) => r.organ === "leaf"));
    assert.ok(recorded.every((r) => r.hasImagesField));
  });

  it("treats a 404 from the species route as a not-a-plant rejection", async () => {
    installFetch((url) =>
      url.includes("/v2/diseases")
        ? json({ results: [] })
        : json({ error: "Species not found" }, 404),
    );

    const outcome = await identifyWithPlantNet({
      imageBase64: "AAAA",
      mimeType: "image/jpeg",
      plantPart: "leaf",
    });

    assert.equal(outcome.rejected, true);
    assert.equal(outcome.identification?.rejected, true);
    assert.equal(outcome.identification?.scientificName, null);
  });

  it("keeps the species result when the disease route fails", async () => {
    installFetch((url) =>
      url.includes("/v2/diseases")
        ? json({ error: "Too Many Requests" }, 429)
        : json(SPECIES_OK),
    );

    const outcome = await identifyWithPlantNet({
      imageBase64: "AAAA",
      mimeType: "image/jpeg",
      plantPart: "flower",
    });

    assert.ok(outcome.identification);
    assert.equal(outcome.failed, false);
    assert.equal(outcome.identification.scientificName, "Solanum lycopersicum L.");
    assert.deepEqual(outcome.identification.diseases, []);
  });

  it("reports a failure when both routes error", async () => {
    installFetch(() => json({ error: "nope" }, 500));

    const outcome = await identifyWithPlantNet({
      imageBase64: "AAAA",
      mimeType: "image/jpeg",
      plantPart: "leaf",
    });

    assert.equal(outcome.identification, null);
    assert.equal(outcome.failed, true);
    assert.ok(outcome.error);
  });

  it("does not call the network when no key is set", async () => {
    delete process.env.PLANTNET_API_KEY;
    let called = false;
    installFetch(() => {
      called = true;
      return json({});
    });

    const outcome = await identifyWithPlantNet({
      imageBase64: "AAAA",
      mimeType: "image/jpeg",
      plantPart: "leaf",
    });

    assert.equal(called, false);
    assert.equal(outcome.identification, null);
    assert.equal(outcome.failed, false);
  });
});

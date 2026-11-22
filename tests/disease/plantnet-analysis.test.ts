import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  analysePlantImage,
  buildPlantNetAnalysis,
  DiseaseAiUnavailableError,
  mergePlantIdentification,
} from "../../src/lib/disease-ai";
import type { DiseaseAnalysis, PlantIdentification } from "../../src/lib/disease";

const ORIGINAL_FETCH = globalThis.fetch;
const ENV_KEYS = [
  "PLANTNET_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

const SPECIES_OK = {
  predictedOrgans: [{ organ: "leaf", score: 0.7 }],
  results: [
    {
      score: 0.92,
      species: {
        scientificName: "Solanum lycopersicum L.",
        genus: { scientificName: "Solanum" },
        family: { scientificName: "Solanaceae" },
        commonNames: ["Tomato"],
      },
    },
  ],
  version: "2025-08-08 (7.4)",
};

const DISEASE_OK = {
  results: [
    { name: "PHYTIN", score: 0.8, description: "Phytophthora infestans" },
  ],
  version: "2025-08-08 (7.4)",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const INPUT = {
  imageBase64: Buffer.from("fake-image").toString("base64"),
  mimeType: "image/jpeg",
  cropName: null,
  plantPart: "leaf" as const,
};

const identification: PlantIdentification = {
  provider: "plantnet",
  project: "all",
  scientificName: "Solanum lycopersicum L.",
  commonNames: ["Tomato"],
  family: "Solanaceae",
  genus: "Solanum",
  score: 0.92,
  gbifId: null,
  alternatives: [],
  diseases: [{ code: "PHYTIN", label: "Phytophthora infestans", score: 0.8 }],
  organ: "leaf",
  engineVersion: "2025-08-08 (7.4)",
  rejected: false,
};

function analysis(overrides: Partial<DiseaseAnalysis> = {}): DiseaseAnalysis {
  return {
    subject: "plant",
    imageQuality: "good",
    retakeAdvice: null,
    cropName: "Tomato",
    plantPart: "leaf",
    healthStatus: "diseased",
    diseaseName: "Early blight",
    pathogenType: "fungal",
    severity: "moderate",
    confidence: 0.7,
    summary: "Brown spots.",
    symptoms: [],
    causes: [],
    immediateActions: [],
    organicTreatment: [],
    chemicalTreatment: [],
    prevention: [],
    lookAlikes: [],
    differentials: [],
    spreadRisk: "moderate",
    urgency: "act_soon",
    monitoring: null,
    ...overrides,
  };
}

describe("mergePlantIdentification", () => {
  it("adds a Pl@ntNet disease as a differential when the AI has a different one", () => {
    const merged = mergePlantIdentification(analysis(), identification);
    assert.equal(merged.diseaseName, "Early blight");
    assert.ok(
      merged.differentials.some((d) => d.name === "Phytophthora infestans"),
    );
  });

  it("boosts confidence when Pl@ntNet agrees with the AI", () => {
    const merged = mergePlantIdentification(
      analysis({ diseaseName: "Phytophthora infestans", confidence: 0.6 }),
      identification,
    );
    assert.ok(merged.confidence > 0.6);
  });

  it("upgrades an uncertain read when Pl@ntNet is confident", () => {
    const merged = mergePlantIdentification(
      analysis({ healthStatus: "uncertain", diseaseName: null, confidence: 0.3 }),
      identification,
    );
    assert.equal(merged.healthStatus, "diseased");
    assert.equal(merged.diseaseName, "Phytophthora infestans");
    assert.equal(merged.pathogenType, "fungal");
  });

  it("leaves a healthy read untouched for a weak disease signal", () => {
    const weak: PlantIdentification = {
      ...identification,
      diseases: [{ code: null, label: "Aphis sp.", score: 0.3 }],
    };
    const merged = mergePlantIdentification(
      analysis({ healthStatus: "healthy", diseaseName: null }),
      weak,
    );
    assert.equal(merged.healthStatus, "healthy");
  });
});

describe("buildPlantNetAnalysis", () => {
  it("names the disease when the model is confident", () => {
    const result = buildPlantNetAnalysis(INPUT, identification);
    assert.equal(result.healthStatus, "diseased");
    assert.equal(result.diseaseName, "Phytophthora infestans");
    assert.equal(result.cropName, "Tomato");
    assert.equal(result.identification, identification);
  });

  it("stays uncertain when no disease matched", () => {
    const result = buildPlantNetAnalysis(INPUT, {
      ...identification,
      diseases: [],
    });
    assert.equal(result.healthStatus, "uncertain");
    assert.equal(result.diseaseName, null);
    assert.match(result.summary, /identified this plant/i);
  });

  it("reports a non-plant photo", () => {
    const result = buildPlantNetAnalysis(INPUT, {
      ...identification,
      scientificName: null,
      commonNames: [],
      diseases: [],
      rejected: true,
    });
    assert.equal(result.subject, "not_plant");
    assert.equal(result.healthStatus, "uncertain");
  });
});

describe("analysePlantImage orchestration", () => {
  beforeEach(() => {
    process.env.PLANTNET_API_KEY = "test-key";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    for (const key of ENV_KEYS) {
      const value = ORIGINAL_ENV[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns a usable scan from Pl@ntNet alone (no vision provider)", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : String(input);
      return url.includes("/v2/diseases") ? json(DISEASE_OK) : json(SPECIES_OK);
    }) as typeof fetch;

    const result = await analysePlantImage(INPUT);

    assert.equal(result.source, "plantnet");
    assert.equal(result.model, "plantnet");
    assert.ok(result.analysis.identification);
    assert.equal(
      result.analysis.identification?.scientificName,
      "Solanum lycopersicum L.",
    );
    assert.equal(result.analysis.healthStatus, "diseased");
    assert.equal(result.analysis.diseaseName, "Phytophthora infestans");
    assert.equal(result.analysis.cropName, "Tomato");
  });

  it("throws only when no provider is configured", async () => {
    delete process.env.PLANTNET_API_KEY;

    await assert.rejects(
      () => analysePlantImage(INPUT),
      (error: unknown) => error instanceof DiseaseAiUnavailableError,
    );
  });
});

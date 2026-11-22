import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeDiseaseAnalyses,
  normaliseDiseaseAnalysis,
  normalisePlantIdentification,
  type DiseaseAnalysis,
  type PlantIdentification,
} from "../../src/lib/disease";

const identificationFixture: PlantIdentification = {
  provider: "plantnet",
  project: "all",
  scientificName: "Solanum lycopersicum L.",
  commonNames: ["Tomato", "Garden tomato"],
  family: "Solanaceae",
  genus: "Solanum",
  score: 0.94,
  gbifId: "2930137",
  alternatives: [
    {
      scientificName: "Solanum pimpinellifolium",
      commonNames: ["Currant tomato"],
      family: "Solanaceae",
      genus: "Solanum",
      score: 0.03,
      gbifId: null,
    },
  ],
  diseases: [
    { code: "PHYTIN", label: "Phytophthora infestans", score: 0.71 },
    { code: "ALTESO", label: "Alternaria solani", score: 0.2 },
  ],
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
    confidence: 0.78,
    summary: "Brown concentric spots.",
    symptoms: ["Brown spots"],
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

describe("normalisePlantIdentification", () => {
  it("parses a Pl@ntNet identification block", () => {
    const result = normalisePlantIdentification(identificationFixture);
    assert.ok(result);
    assert.equal(result.scientificName, "Solanum lycopersicum L.");
    assert.deepEqual(result.commonNames, ["Tomato", "Garden tomato"]);
    assert.equal(result.family, "Solanaceae");
    assert.equal(result.score, 0.94);
    assert.equal(result.diseases.length, 2);
    assert.equal(result.diseases[0].label, "Phytophthora infestans");
    assert.equal(result.alternatives.length, 1);
  });

  it("returns null when there is nothing to show", () => {
    assert.equal(normalisePlantIdentification(null), null);
    assert.equal(normalisePlantIdentification({}), null);
    assert.equal(
      normalisePlantIdentification({ scientificName: "   ", diseases: [] }),
      null,
    );
  });

  it("keeps a rejection even without a species name", () => {
    const result = normalisePlantIdentification({ rejected: true });
    assert.ok(result);
    assert.equal(result.rejected, true);
    assert.equal(result.scientificName, null);
  });
});

describe("normaliseDiseaseAnalysis with identification", () => {
  it("keeps a Pl@ntNet-only scan that has no AI text", () => {
    const result = normaliseDiseaseAnalysis({
      subject: "plant",
      healthStatus: "uncertain",
      identification: identificationFixture,
    });
    assert.ok(result);
    assert.ok(result.identification);
    assert.equal(result.identification?.scientificName, "Solanum lycopersicum L.");
    // Crop name falls back to the identified common name.
    assert.equal(result.cropName, "Tomato");
  });

  it("upgrades an unclear subject when Pl@ntNet rejects the photo", () => {
    const result = normaliseDiseaseAnalysis({
      subject: "unclear",
      healthStatus: "diseased",
      diseaseName: "Late blight",
      confidence: 0.8,
      summary: "Not sure what this is.",
      identification: { ...identificationFixture, rejected: true, diseases: [] },
    });
    assert.ok(result);
    assert.equal(result.subject, "not_plant");
    assert.equal(result.healthStatus, "uncertain");
    assert.equal(result.diseaseName, null);
  });
});

describe("mergeDiseaseAnalyses with identification", () => {
  it("unions disease candidates from both reads", () => {
    const merged = mergeDiseaseAnalyses(
      analysis({ identification: identificationFixture }),
      analysis({
        identification: {
          ...identificationFixture,
          diseases: [{ code: "ALTESO", label: "Alternaria solani", score: 0.9 }],
        },
      }),
    );
    const labels = merged.analysis.identification?.diseases.map((d) => d.label) ?? [];
    assert.ok(labels.includes("Phytophthora infestans"));
    assert.ok(labels.includes("Alternaria solani"));
    assert.equal(merged.analysis.identification?.diseases.length, 2);
  });

  it("keeps the identification when only one side has it", () => {
    const merged = mergeDiseaseAnalyses(
      analysis({ identification: null }),
      analysis({ identification: identificationFixture }),
    );
    assert.ok(merged.analysis.identification);
  });
});

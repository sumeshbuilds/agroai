import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_RETAKE_ADVICE,
  mergeDiseaseAnalyses,
  normaliseDiseaseAnalysis,
  type DiseaseAnalysis,
} from "../../src/lib/disease";
import {
  knownThreatsForCrop,
  weatherContextLine,
} from "../../src/lib/disease-context";
import type { WeatherSnapshot } from "../../src/lib/weather";

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
    summary: "Brown concentric spots on lower leaves.",
    symptoms: ["Brown spots", "Yellow halo"],
    causes: ["Wet foliage"],
    immediateActions: ["Remove infected leaves"],
    organicTreatment: ["Neem oil"],
    chemicalTreatment: [],
    prevention: ["Rotate crops"],
    lookAlikes: [],
    differentials: [],
    spreadRisk: "moderate",
    urgency: "act_soon",
    monitoring: "Check again in 2-3 days.",
    ...overrides,
  };
}

describe("normaliseDiseaseAnalysis", () => {
  it("normalises aliases, confidence and ranked differentials", () => {
    const result = normaliseDiseaseAnalysis({
      subject: "plant",
      imageQuality: "blurry",
      healthStatus: "infected",
      diseaseName: "Early blight",
      pathogen_type: "fungus",
      severity: "severe",
      confidence: 78,
      summary: "Spots",
      symptoms: ["Brown spots"],
      immediate_actions: ["Remove leaves"],
      differentials: [
        { name: "Septoria leaf spot", confidence: 0.42, note: "Grey centres." },
        { name: "Early blight", confidence: 0.8 },
        "Nutrient deficiency",
        { name: "Septoria leaf spot", confidence: 0.55 },
      ],
      spread_risk: "critical",
      urgency: "immediately",
    });

    assert.ok(result);
    assert.equal(result.healthStatus, "diseased");
    assert.equal(result.pathogenType, "fungal");
    assert.equal(result.severity, "high");
    assert.equal(result.confidence, 0.78);
    assert.equal(result.imageQuality, "poor");
    assert.equal(result.spreadRisk, "high");
    assert.equal(result.urgency, "act_now");
    assert.equal(result.differentials.length, 2);
    assert.equal(result.differentials[0].name, "Septoria leaf spot");
    assert.equal(result.differentials[0].confidence, 0.55);
    assert.equal(result.differentials[1].name, "Nutrient deficiency");
    assert.match(result.retakeAdvice ?? "", /blurry|photo/i);
  });

  it("never attaches a disease name to a non-plant photo", () => {
    const result = normaliseDiseaseAnalysis({
      subject: "not_plant",
      imageQuality: "good",
      healthStatus: "diseased",
      diseaseName: "Late blight",
      confidence: 0.9,
      summary: "A hand holding a phone.",
    });

    assert.ok(result);
    assert.equal(result.subject, "not_plant");
    assert.equal(result.healthStatus, "uncertain");
    assert.equal(result.diseaseName, null);
    assert.equal(result.severity, "none");
    assert.equal(result.spreadRisk, "low");
    assert.ok(result.retakeAdvice);
  });

  it("downgrades a very low-confidence diagnosis to uncertain", () => {
    const result = normaliseDiseaseAnalysis({
      subject: "plant",
      healthStatus: "diseased",
      diseaseName: "Leaf spot",
      confidence: 0.3,
      summary: "Hard to see.",
      symptoms: ["One spot"],
    });

    assert.ok(result);
    assert.equal(result.healthStatus, "uncertain");
    assert.equal(result.urgency, "monitor");
    assert.equal(result.retakeAdvice, DEFAULT_RETAKE_ADVICE);
  });

  it("clears disease fields for a healthy plant and sets a review date", () => {
    const result = normaliseDiseaseAnalysis({
      subject: "plant",
      imageQuality: "good",
      healthStatus: "healthy",
      diseaseName: "Blight",
      pathogenType: "fungal",
      severity: "high",
      confidence: 0.88,
      summary: "Leaves look clean.",
    });

    assert.ok(result);
    assert.equal(result.healthStatus, "healthy");
    assert.equal(result.diseaseName, null);
    assert.equal(result.pathogenType, "unknown");
    assert.equal(result.severity, "none");
    assert.equal(result.spreadRisk, "low");
    assert.equal(result.urgency, "monitor");
    assert.match(result.monitoring ?? "", /7 days/i);
  });

  it("rejects a reply with nothing usable", () => {
    assert.equal(normaliseDiseaseAnalysis({}), null);
    assert.equal(normaliseDiseaseAnalysis(null), null);
  });
});

describe("disease context", () => {
  it("uses the crop stage's own threat list", () => {
    const threats = knownThreatsForCrop("Paddy (Rice)", 30);
    assert.ok(threats.length > 0);
    assert.ok(threats.some((threat) => /planthopper|borer|blight/i.test(threat)));
  });

  it("falls back to the crop preset when age is unknown", () => {
    const threats = knownThreatsForCrop("Tomato");
    assert.ok(threats.some((threat) => /whitefly|blight|borer/i.test(threat)));
  });

  it("summarises only real forecast values", () => {
    const snapshot: WeatherSnapshot = {
      latitude: 20.29,
      longitude: 85.82,
      timezone: "Asia/Kolkata",
      timezoneAbbreviation: "IST",
      current: {
        time: "2026-11-12T09:00",
        temperature: 28,
        humidity: 82,
        precipitation: 0,
        windSpeed: 6,
        soilMoisture: 0.31,
      },
      daily: [
        {
          date: "2026-11-12",
          tempMax: 31,
          tempMin: 22,
          precipitationSum: 4,
          precipitationProbability: 60,
          windSpeedMax: 10,
        },
        {
          date: "2026-11-13",
          tempMax: 30,
          tempMin: 21,
          precipitationSum: 8,
          precipitationProbability: 80,
          windSpeedMax: 12,
        },
        {
          date: "2026-11-14",
          tempMax: 29,
          tempMin: 20,
          precipitationSum: 2,
          precipitationProbability: 40,
          windSpeedMax: 9,
        },
      ],
      hourlySoilMoisture: [],
      fetchedAt: "2026-11-12T09:00:00.000Z",
      source: "open-meteo",
    };

    const line = weatherContextLine(snapshot);
    assert.match(line, /temperature 20-31°C/);
    assert.match(line, /humidity 82%/);
    assert.match(line, /rain chance next 3 days 60%/);
    assert.match(line, /surface soil moisture 31%/);
  });
});

describe("mergeDiseaseAnalyses", () => {
  it("raises confidence when both providers agree", () => {
    const merged = mergeDiseaseAnalyses(
      analysis({ confidence: 0.7 }),
      analysis({
        confidence: 0.72,
        symptoms: ["Brown spots", "Yellow halo", "Dark edges"],
      }),
    );

    assert.equal(merged.agreed, true);
    assert.ok(merged.analysis.confidence > 0.72);
    assert.equal(merged.analysis.diseaseName, "Early blight");
  });

  it("keeps the stronger read but lowers certainty when providers disagree", () => {
    const merged = mergeDiseaseAnalyses(
      analysis({ confidence: 0.8 }),
      analysis({
        diseaseName: "Septoria leaf spot",
        confidence: 0.6,
        summary: "Small grey spots with dark borders.",
      }),
    );

    assert.equal(merged.agreed, false);
    assert.equal(merged.analysis.diseaseName, "Early blight");
    assert.ok(merged.analysis.confidence < 0.8);
    assert.ok(
      merged.analysis.differentials.some(
        (item) => item.name === "Septoria leaf spot",
      ),
    );
    assert.ok(merged.analysis.retakeAdvice);
  });

  it("turns a healthy/diseased disagreement into an uncertain result", () => {
    const merged = mergeDiseaseAnalyses(
      analysis({ healthStatus: "healthy", diseaseName: null, confidence: 0.9 }),
      analysis({ confidence: 0.65 }),
    );

    assert.equal(merged.agreed, false);
    assert.equal(merged.analysis.healthStatus, "uncertain");
    assert.equal(merged.analysis.diseaseName, "Early blight");
  });

  it("never diagnoses a photo that one provider says is not a plant", () => {
    const merged = mergeDiseaseAnalyses(
      analysis({ confidence: 0.9 }),
      analysis({
        subject: "not_plant",
        healthStatus: "uncertain",
        diseaseName: null,
        confidence: 0.3,
      }),
    );

    assert.equal(merged.agreed, false);
    assert.equal(merged.analysis.subject, "unclear");
    assert.equal(merged.analysis.healthStatus, "uncertain");
    assert.equal(merged.analysis.diseaseName, null);
    assert.equal(merged.analysis.severity, "none");
    assert.ok(merged.analysis.retakeAdvice);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessAgroWeather,
  findWorkWindow,
} from "../../src/lib/agro-advisory";
import {
  buildDailyPlan,
  completionId,
  computeStreak,
  planProgress,
} from "../../src/lib/daily-tasks";
import type { DiseaseAnalysis } from "../../src/lib/disease";
import {
  mapClassifierLabel,
  mergeClassifierSignal,
  type ClassifierSignal,
} from "../../src/lib/disease-classifier";
import { getFieldShoppingList } from "../../src/lib/recommendations";
import {
  analyseSoil,
  recommendCrops,
  textureFromPercentages,
  type ClimateSummary,
} from "../../src/lib/soil";
import { makeWeather } from "./fixtures";

describe("soil texture triangle", () => {
  it("classifies sand, loam and clay consistently", () => {
    assert.equal(textureFromPercentages(90, 5), "sandy");
    assert.equal(textureFromPercentages(60, 10), "sandy_loam");
    assert.equal(textureFromPercentages(40, 30), "clay_loam");
    assert.equal(textureFromPercentages(20, 50), "clay");
  });
});

describe("soil analysis", () => {
  it("flags acidic, low-carbon soil and gives an action", () => {
    const soil = analyseSoil({
      ph: 5.8,
      organicCarbon: 0.3,
      nitrogen: 200,
      phosphorus: 6,
      potassium: 100,
      sandPct: 40,
      clayPct: 35,
    });

    assert.equal(soil.source, "soil-health-card");
    assert.equal(soil.phStatus, "acidic");
    assert.equal(soil.texture, "clay_loam");
    assert.ok(soil.issues.some((issue) => issue.key === "ph-low"));
    assert.ok(soil.issues.some((issue) => issue.key === "organic-carbon"));
    assert.ok(soil.issues.every((issue) => issue.action.length > 10));
    assert.ok(soil.score < 70);
  });

  it("does not invent an issue when values are healthy", () => {
    const soil = analyseSoil({
      ph: 6.8,
      ec: 0.4,
      organicCarbon: 0.9,
      nitrogen: 600,
      phosphorus: 40,
      potassium: 300,
      texture: "loam",
    });

    assert.equal(soil.phStatus, "neutral");
    assert.equal(soil.ecStatus, "normal");
    assert.equal(soil.issues.filter((issue) => issue.severity === "warning").length, 0);
    assert.ok(soil.score >= 75);
  });

  it("labels missing data as missing rather than guessing", () => {
    const soil = analyseSoil(null);
    assert.equal(soil.source, "missing");
    assert.equal(soil.texture, null);
    assert.equal(soil.ph, null);
    assert.match(soil.summary, /No soil test/i);
  });
});

describe("crop fit", () => {
  const climate: ClimateSummary = {
    annualRainfallMm: 1350,
    meanTempC: 27,
    maxMonthlyTempC: 33,
    source: "archive",
    capturedAt: "2026-11-01T00:00:00.000Z",
  };

  it("ranks paddy highly on a clay field with high rainfall", () => {
    const soil = analyseSoil({
      ph: 6.6,
      organicCarbon: 0.7,
      nitrogen: 400,
      phosphorus: 20,
      potassium: 200,
      texture: "clay",
    });
    const crops = recommendCrops({ soil, climate, month: 6, limit: 6 });
    const paddy = crops.find((entry) => entry.crop.name.startsWith("Paddy"));
    assert.ok(paddy);
    assert.ok(paddy.score >= 70);
    assert.ok(paddy.reasons.length > 0);
  });

  it("prefers groundnut on light soil with moderate rainfall", () => {
    const soil = analyseSoil({
      ph: 6.6,
      organicCarbon: 0.55,
      texture: "sandy_loam",
    });
    const crops = recommendCrops({
      soil,
      climate: { ...climate, annualRainfallMm: 650, meanTempC: 29 },
      month: 6,
      limit: 8,
    });
    const names = crops.slice(0, 4).map((entry) => entry.crop.name);
    assert.ok(names.some((name) => /Groundnut|Sesame|Ragi/i.test(name)));
  });

  it("marks a crop as a poor fit when pH and temperature are far off", () => {
    const soil = analyseSoil({ ph: 4.8, texture: "sandy" });
    const crops = recommendCrops({
      soil,
      climate: { ...climate, meanTempC: 12, annualRainfallMm: 300 },
      month: 1,
      limit: 22,
    });
    assert.ok(crops.some((entry) => entry.rating === "poor"));
  });
});

describe("field work windows", () => {
  it("keeps a dry, calm week workable and finds a spray window", () => {
    const weather = makeWeather({ soilMoisture: 0.16, et0: 5.5 });
    const agro = assessAgroWeather(weather, {
      cropName: "Tomato",
      ageDays: 50,
    });

    assert.equal(agro.days.length, 7);
    assert.ok(agro.workableDays >= 5);
    assert.ok(agro.sprayingWindow);
    const hour = Number(agro.sprayingWindow.split(" ")[1].slice(0, 2));
    assert.ok(hour >= 6 && hour <= 17, "spray window must be in daylight");
    assert.ok(agro.irrigation.deficitMm > 20);
    assert.equal(agro.days[0].verdict, "good");
  });

  it("marks the first days unworkable when rain is heavy", () => {
    const weather = makeWeather({
      rainyDays: [0, 1, 2],
      rainChance: 85,
      rainMm: 30,
      wind: 30,
      gust: 50,
    });
    const agro = assessAgroWeather(weather, {
      cropName: "Paddy (Rice)",
      ageDays: 40,
    });

    assert.equal(agro.days[0].verdict, "avoid");
    assert.equal(agro.days[0].operations.spraying.suitable, false);
    assert.ok(agro.days[0].reasons.length > 0);
    assert.equal(agro.workableDays < 7, true);
  });

  it("returns null when no calm block exists", () => {
    const weather = makeWeather({ rainyDays: [0], rainMm: 20, wind: 28, gust: 45 });
    const window = findWorkWindow(weather.hourlyAgro.slice(0, 24), (point) => {
      return (point.windSpeed ?? 99) < 5;
    });
    assert.equal(window, null);
  });

  it("raises disease pressure after long wet periods", () => {
    const weather = makeWeather({
      rainyDays: [0, 1, 2],
      leafWetness: 80,
      humidity: 92,
    });
    const agro = assessAgroWeather(weather);
    assert.equal(agro.diseasePressure.level, "high");
    assert.ok(agro.diseasePressure.leafWetnessHours > 0);
  });
});

describe("daily checklist", () => {
  it("builds a capped, deduplicated plan with reasons", () => {
    const weather = makeWeather({
      rainyDays: [0, 1],
      rainMm: 25,
      soilMoisture: 0.1,
      tempMax: 38,
    });
    const agro = assessAgroWeather(weather, {
      cropName: "Maize",
      ageDays: 30,
    });
    const plan = buildDailyPlan({
      crop: { id: 4, cropName: "Maize", ageDays: 30, durationDays: 100 },
      agro,
      pest: null,
      soil: analyseSoil({ ph: 5.2, organicCarbon: 0.3 }),
      date: "2026-11-12",
    });

    assert.ok(plan.tasks.length > 0);
    assert.ok(plan.tasks.length <= 9);
    assert.equal(new Set(plan.tasks.map((task) => task.title)).size, plan.tasks.length);
    assert.ok(plan.tasks.every((task) => task.reasons.length > 0));
    assert.ok(plan.tasks.some((task) => task.id === "weather-drainage"));
    assert.ok(plan.xpAvailable > 0);
  });

  it("counts only the tasks that belong to this plan and day", () => {
    const plan = buildDailyPlan({
      crop: { id: 1, cropName: "Tomato", ageDays: 20 },
      agro: assessAgroWeather(makeWeather()),
      pest: null,
      soil: null,
      date: "2026-11-12",
    });
    const first = plan.tasks[0];
    const completed = [
      completionId(plan.date, plan.cropId, first.id),
      "2026-11-11:1:other-task",
    ];
    const progress = planProgress(plan, completed);

    assert.equal(progress.done, 1);
    assert.equal(progress.total, plan.tasks.length);
    assert.ok(progress.xpEarned > 0);

    const again = planProgress(plan, [
      completionId(plan.date, plan.cropId, first.id),
      completionId(plan.date, plan.cropId, first.id),
    ]);
    assert.equal(again.done, 1);
    assert.equal(again.xpEarned, progress.xpEarned);
  });

  it("computes a streak that survives a missed-today start", () => {
    assert.equal(
      computeStreak(["2026-11-10", "2026-11-11", "2026-11-12"], "2026-11-12"),
      3,
    );
    assert.equal(
      computeStreak(["2026-11-09", "2026-11-10"], "2026-11-12"),
      0,
    );
    assert.equal(
      computeStreak(["2026-11-09", "2026-11-10"], "2026-11-11"),
      2,
    );
  });
});

describe("dynamic shopping list", () => {
  it("uses a labelled search for soil correction and a verified listing for traps", () => {
    const list = getFieldShoppingList({
      cropName: "Tomato",
      advisory: "",
      pestLevel: "high",
      diseasePressure: "high",
      soilIssues: ["Acidic soil"],
      soilPh: 5.4,
      taskCategories: ["pest", "soil"],
      limit: 6,
    });

    const traps = list.find((item) => item.id === "monitoring-traps");
    assert.ok(traps?.verified);
    assert.match(traps?.url ?? "", /amazon\.in\/dp\//);

    const lime = list.find((item) => item.id === "agricultural-lime");
    assert.ok(lime);
    assert.equal(lime.verified, false);
    assert.match(lime.url, /amazon\.in\/s\?/);
    assert.ok(lime.reason.includes("acidic"));
  });
});

describe("classifier consensus", () => {
  const analysis: DiseaseAnalysis = {
    subject: "plant",
    imageQuality: "good",
    retakeAdvice: null,
    cropName: "Tomato",
    plantPart: "leaf",
    healthStatus: "diseased",
    diseaseName: "Late blight",
    pathogenType: "fungal",
    severity: "high",
    confidence: 0.7,
    summary: "Dark water-soaked lesions.",
    symptoms: ["Dark lesions"],
    causes: ["Wet weather"],
    immediateActions: ["Remove affected leaves"],
    organicTreatment: [],
    chemicalTreatment: [],
    prevention: [],
    lookAlikes: [],
    differentials: [],
    spreadRisk: "high",
    urgency: "act_now",
    monitoring: null,
  };

  function signal(overrides: Partial<ClassifierSignal> = {}): ClassifierSignal {
    return {
      provider: "huggingface",
      model: "test-model",
      rawLabel: "Tomato___Late_blight",
      score: 0.9,
      cropName: "tomato",
      diseaseName: "Late blight",
      pathogenType: "fungal",
      healthStatus: "diseased",
      compatible: true,
      ...overrides,
    };
  }

  it("maps PlantVillage labels to crop and disease", () => {
    const mapped = mapClassifierLabel("Tomato___Late_blight", "Tomato");
    assert.equal(mapped.cropName, "tomato");
    assert.equal(mapped.diseaseName, "Late blight");
    assert.equal(mapped.pathogenType, "fungal");
    assert.equal(mapped.healthStatus, "diseased");
    assert.equal(mapped.compatible, true);

    const healthy = mapClassifierLabel("Potato___healthy", "Potato");
    assert.equal(healthy.healthStatus, "healthy");
    assert.equal(healthy.diseaseName, null);

    const incompatible = mapClassifierLabel("Grape___Black_rot", "Paddy (Rice)");
    assert.equal(incompatible.compatible, false);
  });

  it("raises confidence when the classifier agrees", () => {
    const merged = mergeClassifierSignal(analysis, signal());
    assert.equal(merged.agreed, true);
    assert.ok(merged.analysis.confidence > analysis.confidence);
    assert.ok(merged.analysis.confidence <= 0.95);
  });

  it("adds a differential and lowers confidence when it disagrees", () => {
    const merged = mergeClassifierSignal(
      analysis,
      signal({ diseaseName: "Early blight", score: 0.8 }),
    );
    assert.equal(merged.agreed, false);
    assert.ok(merged.analysis.confidence < analysis.confidence);
    assert.ok(
      merged.analysis.differentials.some((entry) => entry.name === "Early blight"),
    );
  });

  it("ignores an incompatible classifier crop", () => {
    const merged = mergeClassifierSignal(
      analysis,
      signal({ compatible: false, cropName: "grape" }),
    );
    assert.equal(merged.agreed, null);
    assert.equal(merged.analysis, analysis);
  });
});

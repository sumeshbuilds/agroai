import { getCropDayGuide } from "./crop-guide";
import type { WeatherSnapshot } from "./weather";

/**
 * Pest-risk engine.
 *
 * It combines the farmer's real crop data (name, day since sowing, expected
 * duration) with the live Open-Meteo forecast (rain, temperature, wind, soil
 * moisture) and returns a transparent, rule-based risk assessment. Every
 * factor is shown in the UI so the farmer can see *why* the siren is raised.
 */

export type PestRiskLevel = "low" | "moderate" | "high" | "critical";

export interface PestThreat {
  name: string;
  emoji: string;
  reason: string;
}

export interface PestRiskWeather {
  rainChance3d: number;
  rainMm3d: number;
  wetDays7: number;
  avgTempC: number;
  maxTempC: number;
  windKmh: number;
  soilMoisturePct: number | null;
}

export interface PestRiskAssessment {
  level: PestRiskLevel;
  score: number;
  headline: string;
  summary: string;
  threats: PestThreat[];
  factors: string[];
  actions: string[];
  weather: PestRiskWeather;
  crop: {
    name: string;
    ageDays: number;
    durationDays: number;
    stage: string;
  };
  analysedAt: string;
}

export const PEST_LEVEL_META: Record<
  PestRiskLevel,
  { label: string; blurb: string }
> = {
  low: {
    label: "Low risk",
    blurb: "Conditions do not favour a pest outbreak right now. Keep doing routine scouting.",
  },
  moderate: {
    label: "Watch closely",
    blurb: "Some conditions are turning favourable. Scout the crop every 2–3 days.",
  },
  high: {
    label: "High risk",
    blurb: "Pest pressure is likely. Inspect today and act on the first sign of damage.",
  },
  critical: {
    label: "Critical risk",
    blurb: "Weather and crop stage strongly favour an outbreak. Inspect immediately.",
  },
};

interface ThreatRule {
  name: string;
  emoji: string;
  reason: (context: RiskContext) => string | null;
}

interface RiskContext {
  cropName: string;
  stageName: string;
  ageDays: number;
  rainChance3d: number;
  rainMm3d: number;
  wetDays7: number;
  avgTempC: number;
  maxTempC: number;
  windKmh: number;
  soil: number | null;
  humid: boolean;
  dry: boolean;
  cool: boolean;
  warm: boolean;
  hot: boolean;
  flowering: boolean;
  vegetative: boolean;
  young: boolean;
  maturing: boolean;
}

const rainy = (ctx: RiskContext) =>
  ctx.rainChance3d >= 55 || ctx.rainMm3d >= 8 || ctx.wetDays7 >= 3;

const threatRules: Record<string, ThreatRule[]> = {
  rice: [
    {
      name: "Brown planthopper",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.humid && ctx.warm
          ? "Continuous humid, warm weather and a flooded canopy favour planthopper build-up."
          : null,
    },
    {
      name: "Stem borer",
      emoji: "🐛",
      reason: (ctx) =>
        ctx.vegetative || ctx.young
          ? "Young tillers are the most vulnerable stage for stem borer dead-hearts."
          : null,
    },
    {
      name: "Rice blast",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.humid && ctx.avgTempC >= 20 && ctx.avgTempC <= 29
          ? "Warm, humid nights with leaf wetness favour blast lesions."
          : null,
    },
  ],
  wheat: [
    {
      name: "Yellow rust",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.cool && ctx.humid
          ? "Cool, moist weather is ideal for yellow-rust pustules."
          : null,
    },
    {
      name: "Aphids",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.dry && ctx.warm
          ? "Dry, warming conditions let aphid colonies multiply on ears and leaves."
          : null,
    },
    {
      name: "Powdery mildew",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.humid && ctx.avgTempC >= 15 && ctx.avgTempC <= 25
          ? "Humid, mild conditions support powdery mildew on dense canopies."
          : null,
    },
  ],
  maize: [
    {
      name: "Fall armyworm",
      emoji: "🐛",
      reason: (ctx) =>
        ctx.vegetative || ctx.young
          ? "Whorl-stage maize is the preferred feeding window for fall armyworm."
          : "Armyworm can still enter cobs and late whorls before harvest.",
    },
    {
      name: "Stem borer",
      emoji: "🐛",
      reason: (ctx) =>
        ctx.warm ? "Warm weather speeds up stem-borer development in the stem." : null,
    },
    {
      name: "Leaf blight",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.humid ? "Long leaf-wetness periods favour leaf-blight lesions." : null,
    },
  ],
  tomato: [
    {
      name: "Fruit borer",
      emoji: "🐛",
      reason: (ctx) =>
        ctx.flowering
          ? "Flowering and young fruit are when borers lay eggs on the calyx."
          : null,
    },
    {
      name: "Whitefly",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.dry && ctx.warm
          ? "Dry, warm foliage favours whitefly and the viruses they carry."
          : null,
    },
    {
      name: "Early blight",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.humid ? "Rain splash and humid foliage spread early-blight spores." : null,
    },
  ],
  cotton: [
    {
      name: "Pink bollworm",
      emoji: "🐛",
      reason: (ctx) =>
        ctx.flowering || ctx.maturing
          ? "Squares and developing bolls are the entry points for bollworm."
          : null,
    },
    {
      name: "Whitefly",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.dry && ctx.warm
          ? "Hot, dry spells favour whitefly populations and sticky lint."
          : null,
    },
    {
      name: "Jassids",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.warm ? "Warm weather supports jassid nymphs on the leaf underside." : null,
    },
  ],
  onion: [
    {
      name: "Thrips",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.dry && ctx.warm
          ? "Dry, warm leaf whorls are ideal for thrips feeding and silvering."
          : null,
    },
    {
      name: "Purple blotch",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.humid ? "Humid foliage after rain favours purple-blotch lesions." : null,
    },
  ],
  potato: [
    {
      name: "Late blight",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.cool && ctx.humid
          ? "Cool, wet nights are the classic late-blight trigger."
          : null,
    },
    {
      name: "Aphids",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.dry && ctx.warm
          ? "Dry warmth builds aphid colonies that also spread virus."
          : null,
    },
  ],
  generic: [
    {
      name: "Aphids & sucking pests",
      emoji: "🦟",
      reason: (ctx) =>
        ctx.dry && ctx.warm
          ? "Dry, warm conditions favour aphids, thrips and mites."
          : null,
    },
    {
      name: "Fungal leaf spot",
      emoji: "🍂",
      reason: (ctx) =>
        ctx.humid ? "Wet leaves and high humidity favour fungal leaf spots." : null,
    },
    {
      name: "Cutworm / soil pests",
      emoji: "🐛",
      reason: (ctx) =>
        ctx.young ? "Young seedlings are vulnerable to cutworm damage at the base." : null,
    },
  ],
};

function cropGroup(cropName: string): string {
  const name = cropName.toLowerCase();
  if (name.includes("paddy") || name.includes("rice")) return "rice";
  if (name.includes("wheat")) return "wheat";
  if (name.includes("maize") || name.includes("corn")) return "maize";
  if (name.includes("tomato")) return "tomato";
  if (name.includes("cotton")) return "cotton";
  if (name.includes("onion")) return "onion";
  if (name.includes("potato")) return "potato";
  return "generic";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function levelFromScore(score: number): PestRiskLevel {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 32) return "moderate";
  return "low";
}

export function assessPestRisk(input: {
  cropName: string;
  ageDays: number;
  durationDays?: number | null;
  weather: WeatherSnapshot;
}): PestRiskAssessment {
  const { cropName, ageDays, durationDays, weather } = input;
  const guide = getCropDayGuide(cropName, ageDays, durationDays);

  const days = weather.daily.slice(0, 7);
  const next3 = days.slice(0, 3);

  const rainChance3d = Math.round(
    average(next3.map((day) => day.precipitationProbability)),
  );
  const rainMm3d = Number(
    next3
      .reduce((sum, day) => sum + day.precipitationSum, 0)
      .toFixed(1),
  );
  const wetDays7 = days.filter(
    (day) => day.precipitationProbability >= 50 || day.precipitationSum >= 2,
  ).length;
  const avgTempC = Number(
    average(next3.map((day) => (day.tempMax + day.tempMin) / 2)).toFixed(1),
  );
  const maxTempC = Math.round(
    Math.max(0, ...next3.map((day) => day.tempMax)),
  );
  const windKmh = Math.round(
    Math.max(0, ...next3.map((day) => day.windSpeedMax)),
  );
  const soil = weather.current.soilMoisture;
  const soilMoisturePct = soil === null ? null : Math.round(soil * 100);

  const ctx: RiskContext = {
    cropName,
    stageName: guide.stage.name,
    ageDays: guide.ageDays,
    rainChance3d,
    rainMm3d,
    wetDays7,
    avgTempC,
    maxTempC,
    windKmh,
    soil,
    humid: rainChance3d >= 55 || rainMm3d >= 8 || (soil !== null && soil >= 0.28),
    dry: rainChance3d < 35 && (soil === null || soil < 0.18),
    cool: avgTempC < 22,
    warm: avgTempC >= 22 && avgTempC <= 34,
    hot: avgTempC > 34,
    flowering: guide.stage.name.toLowerCase().includes("flower"),
    vegetative: guide.stage.name.toLowerCase().includes("vegetative"),
    young: guide.ageDays <= 21,
    maturing: guide.stage.name.toLowerCase().includes("matur") ||
      guide.stage.name.toLowerCase().includes("harvest"),
  };

  let score = 10;
  const factors: string[] = [];

  if (rainChance3d >= 65) {
    score += 24;
    factors.push(`${rainChance3d}% average rain chance over the next 3 days`);
  } else if (rainChance3d >= 45) {
    score += 14;
    factors.push(`${rainChance3d}% average rain chance over the next 3 days`);
  }

  if (rainMm3d >= 15) {
    score += 10;
    factors.push(`About ${rainMm3d} mm of rain expected in 3 days`);
  } else if (rainMm3d >= 5) {
    score += 5;
    factors.push(`About ${rainMm3d} mm of rain expected in 3 days`);
  }

  if (wetDays7 >= 4) {
    score += 10;
    factors.push(`${wetDays7} wet days in the 7-day forecast`);
  }

  if (soil !== null) {
    if (soil >= 0.32) {
      score += 16;
      factors.push(`Surface soil moisture is high (${soilMoisturePct}%)`);
    } else if (soil >= 0.22) {
      score += 9;
      factors.push(`Surface soil moisture is ${soilMoisturePct}%`);
    } else if (soil < 0.1) {
      score += 7;
      factors.push(`Surface soil is dry (${soilMoisturePct}%), favouring mites and thrips`);
    }
  }

  if (ctx.warm) {
    score += 10;
    factors.push(`Average temperature around ${avgTempC}°C suits pest development`);
  } else if (ctx.hot) {
    score += 6;
    factors.push(`Heat stress at ${maxTempC}°C can weaken the crop's defences`);
  } else if (ctx.cool && !ctx.humid) {
    score -= 3;
  }

  if (windKmh < 12) {
    score += 4;
    factors.push(`Calm air (max ${windKmh} km/h) helps pests settle and spread`);
  } else if (windKmh > 35) {
    score -= 4;
  }

  if (ctx.flowering) {
    score += 12;
    factors.push(`The crop is at ${guide.stage.name} — the most sensitive stage`);
  } else if (ctx.vegetative) {
    score += 6;
  } else if (ctx.maturing) {
    score += 4;
  }

  if (ctx.young) {
    score += 5;
    factors.push("Young seedlings are easily set back by early pest damage");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = levelFromScore(score);

  const rules = threatRules[cropGroup(cropName)] ?? threatRules.generic;
  const threats: PestThreat[] = [];

  for (const rule of rules) {
    const reason = rule.reason(ctx);
    if (reason && threats.length < 3) {
      threats.push({ name: rule.name, emoji: rule.emoji, reason });
    }
  }

  if (threats.length === 0) {
    threats.push({
      name: "Aphids & sucking pests",
      emoji: "🦟",
      reason: "Routine scouting is still worthwhile even though conditions are calm.",
    });
  }

  const actions: string[] = [
    `Walk the field in the early morning and inspect ${threats[0].name.toLowerCase()} hot-spots first.`,
  ];

  if (rainy(ctx)) {
    actions.push(
      "Do not spray before rain — check the field drainage and remove infected leaves instead.",
    );
  } else if (ctx.dry) {
    actions.push(
      "Check leaf undersides for mites and thrips; a light irrigation and mulch reduce stress.",
    );
  } else {
    actions.push(
      "If you must spray, use the calm early-morning window and follow the label dose.",
    );
  }

  if (level === "high" || level === "critical") {
    actions.push(
      "Act today: spot-treat only affected patches and re-check the same spots after 3 days.",
    );
  } else if (level === "moderate") {
    actions.push("Re-run this analysis after the next rain or in 3 days.");
  } else {
    actions.push("No urgent action — keep the weekly scouting routine.");
  }

  const summary =
    level === "low"
      ? `${guide.stage.name} · day ${guide.ageDays}. Weather is not strongly favouring pests right now.`
      : `${guide.stage.name} · day ${guide.ageDays}. ${PEST_LEVEL_META[level].blurb}`;

  return {
    level,
    score,
    headline: `${cropName}: ${PEST_LEVEL_META[level].label.toLowerCase()}`,
    summary,
    threats,
    factors,
    actions,
    weather: {
      rainChance3d,
      rainMm3d,
      wetDays7,
      avgTempC,
      maxTempC,
      windKmh,
      soilMoisturePct,
    },
    crop: {
      name: cropName,
      ageDays: guide.ageDays,
      durationDays: guide.durationDays,
      stage: guide.stage.name,
    },
    analysedAt: new Date().toISOString(),
  };
}

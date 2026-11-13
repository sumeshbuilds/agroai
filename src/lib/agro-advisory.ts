import { getCropDayGuide } from "./crop-guide";
import type { DailyForecast, HourlyAgroPoint, WeatherSnapshot } from "./weather";

/**
 * Field-work intelligence.
 *
 * Turns a plain weather forecast into the question a farmer actually asks:
 * "Should I work today, and when?" Everything here is deterministic and
 * explainable, so the UI can show the reasons behind a red or green day.
 *
 * The rules are deliberately conservative and labelled as forecast-based
 * estimates, not measurements from a field sensor.
 */

export type WorkVerdict = "good" | "caution" | "avoid";

export type FieldOperation =
  | "sowing"
  | "spraying"
  | "irrigation"
  | "fertilising"
  | "weeding"
  | "harvesting"
  | "scouting";

export const FIELD_OPERATIONS: FieldOperation[] = [
  "sowing",
  "spraying",
  "irrigation",
  "fertilising",
  "weeding",
  "harvesting",
  "scouting",
];

export const OPERATION_META: Record<
  FieldOperation,
  { label: string; emoji: string }
> = {
  sowing: { label: "Sowing / transplanting", emoji: "🌱" },
  spraying: { label: "Spraying", emoji: "💧" },
  irrigation: { label: "Irrigation", emoji: "🚿" },
  fertilising: { label: "Fertiliser", emoji: "🧪" },
  weeding: { label: "Weeding", emoji: "🌿" },
  harvesting: { label: "Harvest / drying", emoji: "🌾" },
  scouting: { label: "Pest scouting", emoji: "🔎" },
};

export interface WorkWindow {
  /** `HH:MM` local time. */
  start: string;
  end: string;
  label: string;
}

export interface OperationAdvice {
  suitable: boolean;
  note: string;
}

export type DiseasePressureLevel = "low" | "moderate" | "high";

export interface DayWorkPlan {
  date: string;
  verdict: WorkVerdict;
  /** 0–100 confidence-ish score for the day being workable. */
  score: number;
  summary: string;
  reasons: string[];
  rainChance: number;
  rainMm: number;
  tempMax: number;
  tempMin: number;
  windMax: number;
  windGustMax: number;
  humidity: number;
  et0: number;
  soilMoisture: number | null;
  bestWindow: WorkWindow | null;
  operations: Record<FieldOperation, OperationAdvice>;
  diseasePressure: DiseasePressureLevel;
}

export interface AgroAssessment {
  generatedAt: string;
  days: DayWorkPlan[];
  workableDays: number;
  bestDay: string | null;
  /** Human-readable window for the next suitable sowing day. */
  sowingWindow: string | null;
  sprayingWindow: string | null;
  irrigation: {
    /** Sum of ET0 minus rain over the next 7 days, mm. */
    deficitMm: number;
    advice: string;
    nextWindow: string | null;
  };
  heatStress: {
    level: "none" | "watch" | "high";
    maxTemp: number;
    advice: string | null;
  };
  diseasePressure: {
    level: DiseasePressureLevel;
    /** Leaf-wetness hours in the next 72 h. */
    leafWetnessHours: number;
    reasons: string[];
    advice: string;
  };
  /** Growing degree days accumulated over the next 7 days. */
  gdd: number;
  gddBase: number;
  summary: string;
  /** True when the crop is close enough to harvest to prioritise drying work. */
  harvestWindow: boolean;
}

interface CropContext {
  cropName: string;
  ageDays: number;
  durationDays?: number | null;
}

const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function hourLabel(iso: string): string {
  return iso.slice(11, 16);
}

function dateOf(time: string): string {
  return time.slice(0, 10);
}

function groupByDate(points: HourlyAgroPoint[]): Map<string, HourlyAgroPoint[]> {
  const map = new Map<string, HourlyAgroPoint[]>();
  for (const point of points) {
    const key = dateOf(point.time);
    const list = map.get(key);
    if (list) list.push(point);
    else map.set(key, [point]);
  }
  return map;
}

/**
 * Finds the first run of consecutive hours that satisfies `allowed`.
 * The window is widened to at least `minHours` when a shorter run exists.
 */
export function findWorkWindow(
  points: HourlyAgroPoint[],
  allowed: (point: HourlyAgroPoint) => boolean,
  minHours = 3,
): WorkWindow | null {
  let run: HourlyAgroPoint[] = [];

  for (const point of points) {
    if (allowed(point)) {
      run.push(point);
      if (run.length >= minHours) {
        return {
          start: hourLabel(run[0].time),
          end: hourLabel(run[run.length - 1].time),
          label: `${hourLabel(run[0].time)}–${hourLabel(run[run.length - 1].time)}`,
        };
      }
    } else {
      run = [];
    }
  }

  return null;
}

const sprayHourAllowed = (point: HourlyAgroPoint): boolean => {
  const hour = Number(point.time.slice(11, 13));
  const rain = point.precipitationProbability ?? 0;
  const wind = point.windSpeed ?? 0;
  const gust = point.windGust ?? 0;
  const temp = point.temperature ?? 25;
  const humidity = point.humidity ?? 60;
  const wet = point.leafWetness ?? 0;
  const vpd = point.vpd ?? 1;
  // Spray in daylight, after the dew has dried and before the evening
  // inversion. Night spraying wastes product on wet leaves and increases
  // drift into still air.
  return (
    hour >= 6 &&
    hour <= 17 &&
    rain <= 25 &&
    wind <= 12 &&
    gust <= 20 &&
    temp >= 12 &&
    temp <= 34 &&
    humidity <= 88 &&
    wet <= 45 &&
    vpd >= 0.35
  );
};

const irrigationHourAllowed = (point: HourlyAgroPoint): boolean => {
  const hour = Number(point.time.slice(11, 13));
  return (
    hour >= 5 &&
    hour <= 9 &&
    (point.precipitationProbability ?? 0) < 35 &&
    (point.windSpeed ?? 0) <= 18
  );
};

function bestWindowFor(
  points: HourlyAgroPoint[],
  operation: FieldOperation,
): WorkWindow | null {
  if (operation === "spraying" || operation === "fertilising") {
    return findWorkWindow(points, sprayHourAllowed, 2);
  }
  if (operation === "irrigation") {
    return findWorkWindow(points, irrigationHourAllowed, 2);
  }
  if (operation === "sowing" || operation === "weeding") {
    return findWorkWindow(
      points,
      (point) => {
        const hour = Number(point.time.slice(11, 13));
        return (
          hour >= 6 &&
          hour <= 18 &&
          (point.precipitationProbability ?? 0) <= 35 &&
          (point.temperature ?? 25) <= 34 &&
          (point.windSpeed ?? 0) <= 20
        );
      },
      2,
    );
  }
  if (operation === "harvesting") {
    return findWorkWindow(
      points,
      (point) => {
        const hour = Number(point.time.slice(11, 13));
        return (
          hour >= 7 &&
          hour <= 18 &&
          (point.precipitationProbability ?? 0) <= 20 &&
          (point.humidity ?? 60) <= 80
        );
      },
      2,
    );
  }
  return null;
}

/** Base temperature (°C) used for growing-degree-day accumulation. */
export function gddBaseForCrop(cropName?: string | null): number {
  const name = (cropName ?? "").toLowerCase();
  if (name.includes("wheat") || name.includes("barley") || name.includes("mustard")) return 5;
  if (name.includes("cotton")) return 15;
  if (name.includes("maize") || name.includes("corn")) return 10;
  if (name.includes("rice") || name.includes("paddy")) return 10;
  if (name.includes("potato")) return 7;
  if (name.includes("tomato") || name.includes("chilli") || name.includes("brinjal")) return 10;
  if (name.includes("onion")) return 7;
  if (name.includes("millet") || name.includes("ragi")) return 10;
  return 10;
}

function diseasePressureFor(points: HourlyAgroPoint[]): {
  level: DiseasePressureLevel;
  leafWetnessHours: number;
  reasons: string[];
} {
  let wetHours = 0;
  let humidHours = 0;
  let warmWetHours = 0;

  for (const point of points) {
    const wet = (point.leafWetness ?? 0) >= 50;
    const humid = (point.humidity ?? 0) >= 85;
    const temp = point.temperature ?? 25;
    if (wet) wetHours += 1;
    if (humid) humidHours += 1;
    if ((wet || humid) && temp >= 18 && temp <= 30) warmWetHours += 1;
  }

  const reasons: string[] = [];
  if (wetHours > 0) {
    reasons.push(`${wetHours} h of likely leaf wetness`);
  }
  if (humidHours > 0) {
    reasons.push(`${humidHours} humid hours (≥85%)`);
  }
  if (warmWetHours >= 8) {
    reasons.push(`${warmWetHours} warm, wet hours favour fungal spots`);
  }

  const level: DiseasePressureLevel =
    wetHours >= 18 || warmWetHours >= 16
      ? "high"
      : wetHours >= 8 || humidHours >= 10 || warmWetHours >= 8
        ? "moderate"
        : "low";

  return { level, leafWetnessHours: wetHours, reasons };
}

function verdictFromScore(score: number): WorkVerdict {
  if (score >= 66) return "good";
  if (score >= 38) return "caution";
  return "avoid";
}

function operationAdvice(
  operation: FieldOperation,
  day: DailyForecast,
  window: WorkWindow | null,
  context: {
    soilMoisture: number | null;
    diseasePressure: DiseasePressureLevel;
    harvestWindow: boolean;
    flowering: boolean;
  },
): OperationAdvice {
  const rainChance = day.precipitationProbability;
  const rainMm = day.precipitationSum;
  const wind = day.windSpeedMax;
  const gust = day.windGustMax;
  const heat = day.tempMax;
  const dryWindow = rainChance < 30 && rainMm < 1;
  const soil = context.soilMoisture;

  switch (operation) {
    case "spraying": {
      if (!window) {
        return {
          suitable: false,
          note: "No calm, rain-free 2-hour window. Do not spray today.",
        };
      }
      if (rainChance >= 55 || rainMm >= 3) {
        return {
          suitable: false,
          note: `Rain likely (${rainChance}%). Spray would wash off — wait.`,
        };
      }
      if (wind >= 25 || gust >= 35) {
        return {
          suitable: false,
          note: `Too windy (${Math.round(wind)} km/h, gusts ${Math.round(gust)}). Drift risk.`,
        };
      }
      if (heat >= 36) {
        return {
          suitable: false,
          note: "Heat above 36°C can burn leaves. Spray before 9 am another day.",
        };
      }
      if (context.flowering) {
        return {
          suitable: true,
          note: `Best window ${window.label}. Flowering crop — spray late evening to protect pollinators.`,
        };
      }
      return {
        suitable: true,
        note: `Calm window ${window.label}. Check the label dose and wear protective clothing.`,
      };
    }
    case "fertilising": {
      if (rainChance >= 70 || rainMm >= 8) {
        return {
          suitable: false,
          note: "Heavy rain could leach the nutrients. Apply after the wet spell.",
        };
      }
      if (!dryWindow && rainChance >= 40) {
        return {
          suitable: true,
          note: "Light rain after application helps uptake — avoid a heavy downpour.",
        };
      }
      return {
        suitable: true,
        note: window
          ? `Apply in the ${window.label} window, then water lightly if the soil is dry.`
          : "Apply in the cooler part of the day and water lightly.",
      };
    }
    case "irrigation": {
      const dry = soil !== null && soil < 0.2;
      if (rainChance >= 60) {
        return {
          suitable: false,
          note: `Rain is likely (${rainChance}%). Let the field soak it up first.`,
        };
      }
      if (!dry && day.et0 < 3) {
        return {
          suitable: false,
          note: "Soil moisture and evaporation do not justify watering today.",
        };
      }
      return {
        suitable: true,
        note: window
          ? `Irrigate early (${window.label}) to cut evaporation loss.`
          : "Irrigate early morning or after sunset.",
      };
    }
    case "sowing": {
      if (rainMm >= 40) {
        return {
          suitable: false,
          note: "Very wet day — seed may rot or wash away.",
        };
      }
      if (soil !== null && soil < 0.1) {
        return {
          suitable: false,
          note: "Topsoil is too dry for sowing. Pre-irrigate, then sow.",
        };
      }
      if (soil !== null && soil > 0.38) {
        return {
          suitable: false,
          note: "Soil is waterlogged. Wait until it drains and is workable.",
        };
      }
      if (rainChance >= 70) {
        return {
          suitable: false,
          note: "Heavy rain expected — sowing now risks a washed-out stand.",
        };
      }
      return {
        suitable: true,
        note:
          rainChance >= 35
            ? "Useful planting rain is possible. Sow shallow and check emergence."
            : "Good sowing conditions. Place seed at the recommended depth.",
      };
    }
    case "weeding": {
      if (rainMm >= 5) {
        return {
          suitable: false,
          note: "Wet soil makes weeding messy and spreads weed seed.",
        };
      }
      if (heat >= 38) {
        return {
          suitable: false,
          note: "Too hot for manual weeding. Work early morning instead.",
        };
      }
      return {
        suitable: true,
        note: "Soil is workable. Remove weeds before they set seed.",
      };
    }
    case "harvesting": {
      if (context.harvestWindow) {
        if (rainChance >= 45 || rainMm >= 3) {
          return {
            suitable: false,
            note: "Rain at harvest risks mould and discolouration. Cover the produce.",
          };
        }
        return {
          suitable: true,
          note: "Dry window — harvest, then dry the produce to safe moisture.",
        };
      }
      return {
        suitable: false,
        note: "The crop is not in its harvest window yet.",
      };
    }
    case "scouting": {
      if (rainChance >= 80) {
        return {
          suitable: false,
          note: "Heavy rain limits visibility. Scout when it eases.",
        };
      }
      if (context.diseasePressure === "high") {
        return {
          suitable: true,
          note: "High disease pressure — inspect leaf undersides and lower canopy today.",
        };
      }
      return {
        suitable: true,
        note: "Walk a diagonal pattern and check 10 plants at random.",
      };
    }
  }
}

/**
 * Builds the 7-day field-work plan from the live forecast.
 */
export function assessAgroWeather(
  weather: WeatherSnapshot,
  crop?: CropContext | null,
): AgroAssessment {
  const guide = crop
    ? getCropDayGuide(crop.cropName, crop.ageDays, crop.durationDays)
    : null;
  const harvestWindow = guide?.isHarvestWindow ?? false;
  const flowering = Boolean(guide?.stage.name.toLowerCase().includes("flower"));
  const byDate = groupByDate(weather.hourlyAgro);
  const gddBase = gddBaseForCrop(crop?.cropName);
  const days = weather.daily.slice(0, 7);

  let gdd = 0;
  const dayPlans: DayWorkPlan[] = days.map((day) => {
    const hours = byDate.get(day.date) ?? [];
    const pressure = diseasePressureFor(hours);
    const soil =
      hours.find((point) => point.soilMoisture !== null)?.soilMoisture ??
      weather.current.soilMoisture;

    let score = 100;
    const reasons: string[] = [];

    if (day.precipitationProbability >= 70) {
      score -= 45;
      reasons.push(`${day.precipitationProbability}% rain chance`);
    } else if (day.precipitationProbability >= 45) {
      score -= 24;
      reasons.push(`${day.precipitationProbability}% rain chance`);
    }
    if (day.precipitationSum >= 15) {
      score -= 28;
      reasons.push(`~${round(day.precipitationSum, 1)} mm rain`);
    } else if (day.precipitationSum >= 5) {
      score -= 12;
      reasons.push(`~${round(day.precipitationSum, 1)} mm rain`);
    }
    if (day.windGustMax >= 45 || day.windSpeedMax >= 35) {
      score -= 24;
      reasons.push(`wind up to ${Math.round(day.windSpeedMax)} km/h`);
    } else if (day.windSpeedMax >= 22) {
      score -= 10;
      reasons.push(`breezy (${Math.round(day.windSpeedMax)} km/h)`);
    }
    if (day.tempMax >= 40) {
      score -= 22;
      reasons.push(`heat ${Math.round(day.tempMax)}°C`);
    } else if (day.tempMax >= 36) {
      score -= 10;
      reasons.push(`hot (${Math.round(day.tempMax)}°C)`);
    }
    if (day.humidityMean >= 90) {
      score -= 6;
      reasons.push("very humid");
    }
    if (pressure.level === "high") {
      score -= 6;
      reasons.push("long leaf-wetness period");
    }
    if (reasons.length === 0) reasons.push("dry, calm and workable");

    score = Math.max(0, Math.min(100, Math.round(score)));
    const verdict = verdictFromScore(score);

    const priorityOperation: FieldOperation = harvestWindow
      ? "harvesting"
      : flowering
        ? "spraying"
        : "sowing";
    const bestWindow =
      bestWindowFor(hours, priorityOperation) ??
      bestWindowFor(hours, "spraying") ??
      bestWindowFor(hours, "sowing") ??
      bestWindowFor(hours, "irrigation") ??
      bestWindowFor(hours, "weeding");

    const operations = Object.fromEntries(
      FIELD_OPERATIONS.map((operation) => [
        operation,
        operationAdvice(operation, day, bestWindowFor(hours, operation), {
          soilMoisture: soil ?? null,
          diseasePressure: pressure.level,
          harvestWindow,
          flowering,
        }),
      ]),
    ) as Record<FieldOperation, OperationAdvice>;

    gdd += Math.max(0, (day.tempMax + day.tempMin) / 2 - gddBase);

    return {
      date: day.date,
      verdict,
      score,
      summary:
        verdict === "good"
          ? "Good day for field work"
          : verdict === "caution"
            ? "Workable with care"
            : "Better to stay out of the field",
      reasons: reasons.slice(0, 4),
      rainChance: day.precipitationProbability,
      rainMm: round(day.precipitationSum, 1),
      tempMax: day.tempMax,
      tempMin: day.tempMin,
      windMax: day.windSpeedMax,
      windGustMax: day.windGustMax,
      humidity: day.humidityMean,
      et0: round(day.et0, 1),
      soilMoisture: soil ?? null,
      bestWindow,
      operations,
      diseasePressure: pressure.level,
    };
  });

  const workableDays = dayPlans.filter((day) => day.verdict !== "avoid").length;
  const bestDay =
    dayPlans
      .filter((day) => day.verdict === "good")
      .sort((a, b) => b.score - a.score)[0]?.date ?? null;

  const sowingDay = dayPlans.find((day) => day.operations.sowing.suitable);
  const sprayingDay = dayPlans.find((day) => day.operations.spraying.suitable);
  const irrigationDay = dayPlans.find((day) => day.operations.irrigation.suitable);
  const windowFor = (day: DayWorkPlan | undefined, operation: FieldOperation) =>
    day ? bestWindowFor(byDate.get(day.date) ?? [], operation) : null;

  const deficitMm = round(
    dayPlans.reduce(
      (sum, day) => sum + Math.max(0, day.et0 - day.rainMm),
      0,
    ),
    1,
  );

  const maxTemp = Math.max(0, ...dayPlans.map((day) => day.tempMax));
  const heatLevel =
    maxTemp >= 40 ? "high" : maxTemp >= 36 ? "watch" : "none";

  const pressure = diseasePressureFor(weather.hourlyAgro.slice(0, 72));
  const diseaseAdvice =
    pressure.level === "high"
      ? "Long wet-canopy periods. Inspect now and prefer preventive cultural steps over calendar spraying."
      : pressure.level === "moderate"
        ? "Some wet, humid hours. Check the lower canopy every 2–3 days."
        : "Canopy dries quickly. Keep routine scouting.";

  const summary =
    workableDays >= 6
      ? `A strong week: ${workableDays} of ${days.length} days are workable.`
      : workableDays >= 4
        ? `Mixed week: ${workableDays} of ${days.length} days are workable. Plan around the wet or windy days.`
        : `Difficult week: only ${workableDays} of ${days.length} days are workable. Protect the soil and postpone sprays.`;

  return {
    generatedAt: new Date().toISOString(),
    days: dayPlans,
    workableDays,
    bestDay,
    sowingWindow: sowingDay
      ? `${sowingDay.date} ${windowFor(sowingDay, "sowing")?.label ?? "morning"}`
      : null,
    sprayingWindow: sprayingDay
      ? `${sprayingDay.date} ${windowFor(sprayingDay, "spraying")?.label ?? "early morning"}`
      : null,
    irrigation: {
      deficitMm,
      advice:
        deficitMm >= 25
          ? "Evaporation is well ahead of rainfall. Plan 2–3 irrigations this week."
          : deficitMm >= 12
            ? "A moderate moisture deficit is building. Irrigate the lightest soils first."
            : deficitMm >= 4
              ? "Small deficit. Check the topsoil before watering."
              : "Rain is keeping pace with evaporation. Hold irrigation unless the soil feels dry.",
      nextWindow: irrigationDay
        ? windowFor(irrigationDay, "irrigation")?.label ?? null
        : null,
    },
    heatStress: {
      level: heatLevel,
      maxTemp: round(maxTemp, 1),
      advice:
        heatLevel === "high"
          ? "Heat above 40°C. Irrigate before 10 am, mulch exposed soil and avoid spraying."
          : heatLevel === "watch"
            ? "Hot afternoons. Prefer early-morning field work."
            : null,
    },
    diseasePressure: {
      level: pressure.level,
      leafWetnessHours: pressure.leafWetnessHours,
      reasons: pressure.reasons,
      advice: diseaseAdvice,
    },
    gdd: Math.round(gdd),
    gddBase,
    summary,
    harvestWindow,
  };
}

export const DAY_VERDICT_META: Record<
  WorkVerdict,
  { label: string; tone: "leaf" | "warn" | "danger" }
> = {
  good: { label: "Go", tone: "leaf" },
  caution: { label: "Care", tone: "warn" },
  avoid: { label: "Wait", tone: "danger" },
};

export const DISEASE_PRESSURE_META: Record<
  DiseasePressureLevel,
  { label: string; tone: "leaf" | "warn" | "danger"; blurb: string }
> = {
  low: {
    label: "Low",
    tone: "leaf",
    blurb: "Leaves dry quickly, so fungal spread is limited.",
  },
  moderate: {
    label: "Moderate",
    tone: "warn",
    blurb: "Some wet, humid hours — scout the lower canopy.",
  },
  high: {
    label: "High",
    tone: "danger",
    blurb: "Long leaf-wetness periods strongly favour disease.",
  },
};

export function operationLabel(operation: FieldOperation): string {
  return OPERATION_META[operation].label;
}

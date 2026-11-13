import { GoogleGenerativeAI } from "@google/generative-ai";

import { assessAgroWeather, type AgroAssessment } from "./agro-advisory";
import { getCropDayGuide } from "./crop-guide";
import type { SoilAnalysis } from "./soil";
import type { DailyForecast, WeatherSnapshot } from "./weather";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export interface WeeklyReportInput {
  cropName: string;
  growthStage: string;
  ageDays: number;
  sowingDate: string;
  /** Expected sowing-to-harvest duration, used to place the crop in its stage. */
  durationDays?: number | null;
  weather: WeatherSnapshot;
  /** Soil Health Card analysis, when the farmer saved one. */
  soil?: SoilAnalysis | null;
  /** Pre-computed work windows; recomputed here when omitted. */
  agro?: AgroAssessment | null;
}

export interface WeeklyReportResult {
  actionPlan: string;
  /** Odia version of the same plan; null when translation was unavailable. */
  actionPlanOr: string | null;
  source: "gemini" | "fallback";
  model: string;
  note?: string;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Generates the weekly 4-point action plan. Falls back to a deterministic,
 * weather-driven advisory when the Gemini key is missing or the API errors,
 * so the dashboard is always populated for demos.
 */
export async function generateWeeklyReport(
  input: WeeklyReportInput,
): Promise<WeeklyReportResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = getGeminiModel();

  if (!apiKey) {
    return {
      actionPlan: buildFallbackPlan(input),
      actionPlanOr: null,
      source: "fallback",
      model: "rule-based",
      note: "GEMINI_API_KEY is not set — showing the built-in rule-based advisory. Add a key to .env.local for AI-generated advice.",
    };
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const generativeModel = client.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      systemInstruction:
        "You are an experienced agricultural extension officer advising smallholder farmers in India. Be specific, practical and brief. Always answer in clear, simple English.",
    });

    const result = await generativeModel.generateContent(buildPrompt(input));
    const text = result.response.text().trim();

    if (!text) {
      throw new Error("Gemini returned an empty response.");
    }

    const actionPlanOr = await translatePlanToOdia(client, model, text);
    return { actionPlan: text, actionPlanOr, source: "gemini", model };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[gemini] generation failed, using fallback:", message);

    const fallback = buildFallbackPlan(input);
    let actionPlanOr: string | null = null;
    try {
      actionPlanOr = await translatePlanToOdia(
        new GoogleGenerativeAI(apiKey),
        model,
        fallback,
      );
    } catch {
      actionPlanOr = null;
    }

    return {
      actionPlan: fallback,
      actionPlanOr,
      source: "fallback",
      model: "rule-based",
      note: `Gemini call failed (${message}). Showing the built-in rule-based advisory instead.`,
    };
  }
}

/**
 * Translates a finished plan into simple spoken Odia. The five "## " headings
 * stay in English so the UI can map them to icons and translate them itself.
 * Returns null on any failure; the English plan is always the source of truth.
 */
async function translatePlanToOdia(
  client: GoogleGenerativeAI,
  model: string,
  plan: string,
): Promise<string | null> {
  try {
    const translator = client.getGenerativeModel({
      model,
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      systemInstruction:
        "You translate farm advisories from English to simple, spoken Odia (ଓଡ଼ିଆ) that a village farmer understands. Keep numbers, units, weekday names in Odia, and crop names in common Odia. Keep every line starting with '## ' exactly as in the input, in English. Output only the translation.",
    });
    const result = await translator.generateContent(plan);
    const text = result.response.text().trim();
    const hasOdia = /[\u0B00-\u0B7F]/.test(text);
    const headings = (text.match(/^##\s/gm) ?? []).length;
    const sourceHeadings = (plan.match(/^##\s/gm) ?? []).length;
    return hasOdia && headings === sourceHeadings ? text : null;
  } catch (error) {
    console.error(
      "[gemini] odia translation failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export function buildPrompt(input: WeeklyReportInput): string {
  const { cropName, ageDays, sowingDate, weather } = input;
  const guide = getCropDayGuide(cropName, ageDays, input.durationDays);
  const agro =
    input.agro ??
    assessAgroWeather(weather, {
      cropName,
      ageDays,
      durationDays: input.durationDays,
    });

  const forecast = weather.daily
    .map(
      (day) =>
        `${day.date}: ${day.tempMin.toFixed(0)}-${day.tempMax.toFixed(0)}°C, ` +
        `rain ${day.precipitationProbability}% (${day.precipitationSum.toFixed(1)} mm), ` +
        `wind up to ${day.windSpeedMax.toFixed(0)} km/h, ET₀ ${day.et0.toFixed(1)} mm`,
    )
    .join("\n");

  const soil =
    weather.current.soilMoisture === null
      ? "unknown"
      : `${(weather.current.soilMoisture * 100).toFixed(0)}%`;

  const soilLines: string[] = [];
  const soilTest = input.soil;
  if (soilTest && soilTest.source === "soil-health-card") {
    soilLines.push(
      `Soil test: pH ${soilTest.ph ?? "unknown"}, texture ${soilTest.textureLabel ?? "unknown"}, ` +
        `organic carbon ${soilTest.organicCarbon ?? "unknown"}%, ` +
        `N ${soilTest.nitrogen ?? "?"} kg/ha, P ${soilTest.phosphorus ?? "?"} kg/ha, K ${soilTest.potassium ?? "?"} kg/ha.`,
    );
    if (soilTest.issues.length > 0) {
      soilLines.push(
        `Soil issues: ${soilTest.issues.map((issue) => issue.title).join("; ")}.`,
      );
    }
  }

  return [
    `Crop: ${cropName}`,
    `Growth stage: ${guide.stage.name} (day ${guide.ageDays} of about ${guide.durationDays})`,
    `Sown on: ${sowingDate} (${ageDays} days old)`,
    `Farm location: ${weather.latitude.toFixed(3)}, ${weather.longitude.toFixed(3)} (${weather.timezone})`,
    `Current temperature: ${weather.current.temperature ?? "n/a"}°C`,
    `Surface soil moisture (0–7 cm): ${soil}`,
    `7-day water balance: ET₀ ${agro.irrigation.deficitMm.toFixed(1)} mm more than rainfall; ${agro.workableDays} of 7 days are workable.`,
    `Best spray window: ${agro.sprayingWindow ?? "none — rain or wind all week"}.`,
    `Disease pressure: ${agro.diseasePressure.level} (${agro.diseasePressure.leafWetnessHours} leaf-wetness hours in 72 h).`,
    ...soilLines,
    "",
    "Stage focus for this crop:",
    guide.stage.focus,
    `Typical tasks now: ${guide.stage.tasks.join("; ")}`,
    `Watch for now: ${guide.stage.watchFor.join(", ")}`,
    "",
    "Next 7 days forecast:",
    forecast,
    "",
    "Write this week's action plan as five short sections with these exact headings:",
    "## Irrigation",
    "## Fertilizer & Spraying",
    "## Pest & Disease Watch",
    "## Best Field-Work Days",
    "## Next Step",
    `Each section must be 1-2 sentences and specific to ${cropName} at the ${guide.stage.name} stage. Reference specific days from the forecast (e.g. 'Do not spray on Wednesday because of high rain probability'). Use the ET₀ balance and workable-day count in the field-work section, and use the soil test to shape the fertiliser advice. In Pest & Disease Watch, name the crop-specific threats listed above. Do not add any other sections.`,
  ].join("\n");
}

/** Deterministic, weather- and crop-stage-driven advisory used when Gemini is unavailable. */
export function buildFallbackPlan(input: WeeklyReportInput): string {
  const { cropName, ageDays, weather } = input;
  const guide = getCropDayGuide(cropName, ageDays, input.durationDays);
  const days = weather.daily.slice(0, 7);
  const agro =
    input.agro ??
    assessAgroWeather(weather, {
      cropName,
      ageDays,
      durationDays: input.durationDays,
    });

  const wettest = pickDay(days, (day) => day.precipitationProbability);
  const windiest = pickDay(days, (day) => day.windSpeedMax);
  const dry = pickDay(days, (day) => -day.precipitationSum);
  const soil = weather.current.soilMoisture;

  const wetSoon = days.slice(0, 3).some((day) => day.precipitationSum >= 10);
  const soilDry = soil !== null && soil < 0.12;

  const waterTask = guide.stage.tasks.find((task) =>
    /water|irrigat|flood|moist/i.test(task),
  );

  const irrigationBase = wetSoon
    ? `Rain is forecast around ${dayName(wettest)} — pause irrigation and let the rainfall soak in.`
    : soilDry || agro.irrigation.deficitMm >= 18
      ? `The 7-day evaporation deficit is about ${agro.irrigation.deficitMm.toFixed(0)} mm. Irrigate early morning${agro.irrigation.nextWindow ? ` (${agro.irrigation.nextWindow})` : ` on ${dayName(dry)}`}.`
      : `Soil moisture is adequate. Keep a light irrigation schedule and skip any watering on ${dayName(wettest)} if rain arrives.`;

  const irrigation = `${irrigationBase}${
    waterTask ? ` At this stage: ${lowerFirst(waterTask)}` : ""
  }`;

  const sprayDay = days
    .slice(0, 4)
    .reduce<DailyForecast | null>((best, day) => {
      if (!best) return day;
      const score = (d: DailyForecast) =>
        d.windSpeedMax + d.precipitationProbability * 0.6;
      return score(day) < score(best) ? day : best;
    }, null);

  const feedTask = guide.stage.tasks.find((task) =>
    /fertil|nitrogen|top.?dress|nutrient|manure|compost|feed/i.test(task),
  );

  const lowNutrients =
    input.soil?.ratings
      .filter((rating) => rating.level === "low")
      .map((rating) => rating.label) ?? [];

  const soilNote =
    lowNutrients.length > 0
      ? ` The soil test shows ${lowNutrients.join(", ").toLowerCase()} low, so match the dose to the crop plan and confirm it with your KVK.`
      : "";

  const sprayBase = sprayDay
    ? `Spray or apply fertilizer on ${dayName(sprayDay)} when winds are lowest (~${sprayDay.windSpeedMax.toFixed(0)} km/h). Avoid spraying on ${dayName(windiest)} — winds up to ${windiest.windSpeedMax.toFixed(0)} km/h.${soilNote}`
    : `Spray in the calm early-morning window and avoid windy days.${soilNote}`;

  const spray = `${sprayBase}${
    feedTask ? ` For this crop: ${lowerFirst(feedTask)}` : ""
  }`;

  const humid = days.slice(0, 3).some((day) => day.precipitationProbability >= 60);
  const watchFor = guide.stage.watchFor.slice(0, 2).join(" and ");
  const pest = humid
    ? `With rain and high humidity expected, watch ${cropName.toLowerCase()} for ${watchFor}. Inspect the underside of leaves and remove any infected parts.`
    : `Dry, warm conditions favour ${watchFor} at this stage. Scout ${cropName.toLowerCase()} every 2-3 days and act on the first sign of damage.`;

  const fieldWork = `${agro.summary}${
    agro.sprayingWindow
      ? ` The cleanest spray gap is ${agro.sprayingWindow}.`
      : " No calm, rain-free spray gap is available this week."
  }${
    agro.harvestWindow
      ? " The crop is in its harvest window — protect the drying floor from rain."
      : ""
  }`;

  const stageTask = guide.stage.tasks[0];
  const followUpTask = guide.stage.tasks[1];
  const nextStep = `Day ${guide.ageDays} · ${guide.stage.name}. ${stageTask}${
    followUpTask ? ` ${followUpTask}` : ""
  }`;

  return [
    "## Irrigation",
    irrigation,
    "",
    "## Fertilizer & Spraying",
    spray,
    "",
    "## Pest & Disease Watch",
    pest,
    "",
    "## Best Field-Work Days",
    fieldWork,
    "",
    "## Next Step",
    nextStep,
  ].join("\n");
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function pickDay(
  days: DailyForecast[],
  score: (day: DailyForecast) => number,
): DailyForecast {
  return days.reduce((best, day) => (score(day) > score(best) ? day : best), days[0]);
}

function dayName(day: DailyForecast | undefined): string {
  if (!day) return "the next few days";
  const date = new Date(`${day.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day.date;
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}

/** Compact weather summary persisted alongside every weekly report. */
export function summariseWeather(snapshot: WeatherSnapshot) {
  return {
    timezone: snapshot.timezone,
    current: snapshot.current,
    daily: snapshot.daily,
    capturedAt: snapshot.fetchedAt,
  };
}

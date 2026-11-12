/**
 * Builds the small, factual context block sent with a plant photo.
 *
 * Everything here comes from the farmer's own crop record or the live
 * Open-Meteo forecast. Weather is best-effort: a slow upstream must never block
 * a diagnosis, so it gets a short timeout and simply disappears from the prompt
 * if it fails.
 */

import { getCropDayGuide, getCropPreset } from "./crop-guide";
import type { DiseaseContext } from "./disease-ai";
import { fetchWeather, type WeatherSnapshot } from "./weather";

const WEATHER_TIMEOUT_MS = 2_500;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Crop-specific threats for the current stage, or all known stages. */
export function knownThreatsForCrop(
  cropName: string,
  ageDays?: number | null,
  durationDays?: number | null,
): string[] {
  if (ageDays != null && Number.isFinite(ageDays)) {
    const current = getCropDayGuide(cropName, ageDays, durationDays);
    if (current.stage.watchFor.length > 0) return current.stage.watchFor;
  }

  const preset = getCropPreset(cropName);
  const seen = new Set<string>();
  for (const stage of preset.stages) {
    for (const threat of stage.watchFor) seen.add(threat);
  }
  return [...seen].slice(0, 8);
}

/** One compact line that the vision model can use to rank likely causes. */
export function weatherContextLine(weather: WeatherSnapshot): string {
  const next = weather.daily.slice(0, 3);
  const parts: string[] = [];

  if (next.length > 0) {
    const min = Math.round(Math.min(...next.map((day) => day.tempMin)));
    const max = Math.round(Math.max(...next.map((day) => day.tempMax)));
    parts.push(`temperature ${min}-${max}°C`);
  }

  if (weather.current.humidity !== null) {
    parts.push(`humidity ${Math.round(weather.current.humidity)}%`);
  }

  if (next.length > 0) {
    const chance = Math.round(
      average(next.map((day) => day.precipitationProbability)),
    );
    const rain = next.reduce((sum, day) => sum + day.precipitationSum, 0);
    parts.push(
      `rain chance next 3 days ${chance}% (~${rain.toFixed(1)} mm)`,
    );
  }

  if (weather.current.soilMoisture !== null) {
    parts.push(
      `surface soil moisture ${Math.round(weather.current.soilMoisture * 100)}%`,
    );
  }

  return parts.join(", ");
}

export async function loadWeatherContext(farm: {
  centroidLat: number;
  centroidLng: number;
}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

  try {
    const weather = await fetchWeather(farm.centroidLat, farm.centroidLng, {
      signal: controller.signal,
    });
    return weatherContextLine(weather) || null;
  } catch {
    // Weather is optional context; the photo is still worth analysing.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Builds the context for a crop that is linked to the farmer's farm. */
export function cropContext(input: {
  cropName: string;
  ageDays: number;
  durationDays?: number | null;
  weather?: string | null;
}): DiseaseContext {
  const guide = getCropDayGuide(
    input.cropName,
    input.ageDays,
    input.durationDays,
  );

  return {
    cropName: input.cropName,
    growthStage: guide.stage.name,
    ageDays: guide.ageDays,
    durationDays: guide.durationDays,
    knownThreats: guide.stage.watchFor,
    weather: input.weather ?? null,
  };
}

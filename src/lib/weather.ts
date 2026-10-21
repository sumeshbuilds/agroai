export const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProbability: number;
  windSpeedMax: number;
}

export interface HourlySoilMoisture {
  time: string;
  value: number | null;
}

export interface CurrentWeather {
  time: string | null;
  temperature: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  soilMoisture: number | null;
}

export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneAbbreviation: string;
  current: CurrentWeather;
  daily: DailyForecast[];
  hourlySoilMoisture: HourlySoilMoisture[];
  fetchedAt: string;
  source: "open-meteo";
}

export interface WeatherWarning {
  level: "info" | "warning" | "danger";
  title: string;
  detail: string;
}

export class WeatherFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherFetchError";
  }
}

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  current?: Record<string, unknown>;
  hourly?: {
    time?: string[];
    soil_moisture_0_to_1cm?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
  };
  reason?: string;
}

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Fetches the agricultural weather forecast for a farm centroid from
 * Open-Meteo (no API key required).
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    current: "temperature_2m,precipitation,wind_speed_10m",
    hourly: "soil_moisture_0_to_1cm",
    daily:
      "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "7",
  });

  const response = await fetch(`${OPEN_METEO_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });

  const payload = (await response.json()) as OpenMeteoResponse;

  if (!response.ok) {
    throw new WeatherFetchError(
      payload?.reason ?? `Open-Meteo request failed (${response.status}).`,
    );
  }

  const dailyTime = payload.daily?.time ?? [];
  const daily: DailyForecast[] = dailyTime.map((date, index) => ({
    date,
    tempMax: num(payload.daily?.temperature_2m_max?.[index]) ?? 0,
    tempMin: num(payload.daily?.temperature_2m_min?.[index]) ?? 0,
    precipitationSum: num(payload.daily?.precipitation_sum?.[index]) ?? 0,
    precipitationProbability:
      num(payload.daily?.precipitation_probability_max?.[index]) ?? 0,
    windSpeedMax: num(payload.daily?.wind_speed_10m_max?.[index]) ?? 0,
  }));

  const hourly = payload.hourly ?? {};
  const hourlySoilMoisture: HourlySoilMoisture[] = (hourly.time ?? [])
    .slice(0, 48)
    .map((time, index) => ({
      time,
      value: num(hourly.soil_moisture_0_to_1cm?.[index]),
    }));

  const currentSoilMoisture = findCurrentSoilMoisture(hourlySoilMoisture);

  return {
    latitude: num(payload.latitude) ?? latitude,
    longitude: num(payload.longitude) ?? longitude,
    timezone: payload.timezone ?? "UTC",
    timezoneAbbreviation: payload.timezone_abbreviation ?? "UTC",
    current: {
      time: typeof payload.current?.time === "string" ? payload.current.time : null,
      temperature: num(payload.current?.temperature_2m),
      precipitation: num(payload.current?.precipitation),
      windSpeed: num(payload.current?.wind_speed_10m),
      soilMoisture: currentSoilMoisture,
    },
    daily,
    hourlySoilMoisture,
    fetchedAt: new Date().toISOString(),
    source: "open-meteo",
  };
}

function findCurrentSoilMoisture(points: HourlySoilMoisture[]): number | null {
  if (points.length === 0) return null;

  const now = Date.now();
  let closest = points[0];
  let closestDelta = Number.POSITIVE_INFINITY;

  for (const point of points) {
    if (point.value === null) continue;
    const delta = Math.abs(new Date(point.time).getTime() - now);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = point;
    }
  }

  return closest.value;
}

/** Derives actionable rain / wind / heat / soil warnings from a snapshot. */
export function buildWeatherWarnings(snapshot: WeatherSnapshot): WeatherWarning[] {
  const warnings: WeatherWarning[] = [];
  const next = snapshot.daily.slice(0, 3);

  const wettest = next.reduce<DailyForecast | null>((best, day) => {
    if (!best) return day;
    return day.precipitationProbability > best.precipitationProbability
      ? day
      : best;
  }, null);

  if (wettest && wettest.precipitationProbability >= 70 && wettest.precipitationSum >= 5) {
    warnings.push({
      level: "danger",
      title: `Heavy rain expected ${formatDay(wettest.date)}`,
      detail: `${wettest.precipitationProbability}% chance, ~${wettest.precipitationSum.toFixed(1)} mm. Delay spraying and check field drainage.`,
    });
  } else if (wettest && wettest.precipitationProbability >= 50) {
    warnings.push({
      level: "warning",
      title: `Rain likely ${formatDay(wettest.date)}`,
      detail: `${wettest.precipitationProbability}% chance. Plan irrigation and spraying around it.`,
    });
  }

  const windiest = next.reduce<DailyForecast | null>((best, day) => {
    if (!best) return day;
    return day.windSpeedMax > best.windSpeedMax ? day : best;
  }, null);

  if (windiest && windiest.windSpeedMax >= 40) {
    warnings.push({
      level: "danger",
      title: `High winds ${formatDay(windiest.date)}`,
      detail: `Up to ${windiest.windSpeedMax.toFixed(0)} km/h. Do not spray and secure young plants.`,
    });
  } else if (windiest && windiest.windSpeedMax >= 25) {
    warnings.push({
      level: "warning",
      title: `Breezy ${formatDay(windiest.date)}`,
      detail: `Up to ${windiest.windSpeedMax.toFixed(0)} km/h. Spray early morning while winds are calm.`,
    });
  }

  const hottest = next.reduce<DailyForecast | null>((best, day) => {
    if (!best) return day;
    return day.tempMax > best.tempMax ? day : best;
  }, null);

  if (hottest && hottest.tempMax >= 40) {
    warnings.push({
      level: "warning",
      title: `Heat stress ${formatDay(hottest.date)}`,
      detail: `High of ${hottest.tempMax.toFixed(0)}°C. Irrigate before midday to protect the crop.`,
    });
  }

  const soil = snapshot.current.soilMoisture;
  if (soil !== null && soil < 0.12) {
    warnings.push({
      level: "warning",
      title: "Soil is dry",
      detail: `Surface soil moisture is ${(soil * 100).toFixed(0)}%. Consider irrigation soon.`,
    });
  }

  return warnings;
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { weekday: "long" });
}

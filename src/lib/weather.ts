export const OPEN_METEO_ENDPOINT = "https://api.open-meteo.com/v1/forecast";

export interface DailyForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  precipitationProbability: number;
  windSpeedMax: number;
  /** Maximum gust at 10 m, km/h. */
  windGustMax: number;
  /** FAO reference evapotranspiration for the day, mm. */
  et0: number;
  /** Incoming shortwave radiation, MJ/m². */
  radiationMj: number;
  uvIndexMax: number;
  /** Mean relative humidity at 2 m, %. */
  humidityMean: number;
  dewPointMean: number;
  /** Bright sunshine, hours. */
  sunshineHours: number;
}

export interface HourlySoilMoisture {
  time: string;
  value: number | null;
}

/**
 * One hourly forecast row with the extra fields the agronomy engine needs.
 * Kept separate from `hourlySoilMoisture` so existing UI code keeps working.
 */
export interface HourlyAgroPoint {
  time: string;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  windGust: number | null;
  /** Volumetric soil moisture, 0–7 cm. */
  soilMoisture: number | null;
  /** Volumetric soil moisture, 7–28 cm. */
  soilMoistureDeep: number | null;
  soilTemperature: number | null;
  /** Probability that leaves stay wet, %. */
  leafWetness: number | null;
  /** Vapour pressure deficit, kPa. */
  vpd: number | null;
  /** Shortwave radiation, W/m². */
  radiation: number | null;
  et0: number | null;
}

export interface CurrentWeather {
  time: string | null;
  temperature: number | null;
  /** Relative humidity at 2 m (%). */
  humidity: number | null;
  precipitation: number | null;
  windSpeed: number | null;
  windGust: number | null;
  apparentTemperature: number | null;
  dewPoint: number | null;
  radiation: number | null;
  uvIndex: number | null;
  soilMoisture: number | null;
  /** Volumetric soil moisture, 7–28 cm. */
  soilMoistureDeep: number | null;
  soilTemperature: number | null;
  /** Vapour pressure deficit, kPa. */
  vpd: number | null;
}

export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  elevation: number | null;
  timezone: string;
  timezoneAbbreviation: string;
  current: CurrentWeather;
  daily: DailyForecast[];
  hourlySoilMoisture: HourlySoilMoisture[];
  hourlyAgro: HourlyAgroPoint[];
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
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  current?: Record<string, unknown>;
  hourly?: Record<string, Array<number | null> | string[] | undefined>;
  daily?: Record<string, Array<number | null> | string[] | undefined>;
  reason?: string;
}

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const numAt = (
  series: Array<number | null> | string[] | undefined,
  index: number,
): number | null => (Array.isArray(series) ? num(series[index]) : null);

const CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "apparent_temperature",
  "dew_point_2m",
  "shortwave_radiation",
  "uv_index",
  "soil_moisture_0_to_7cm",
  "soil_moisture_7_to_28cm",
  "soil_temperature_0_to_7cm",
  "vapour_pressure_deficit",
].join(",");

const HOURLY_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_gusts_10m",
  "soil_moisture_0_to_7cm",
  "soil_moisture_7_to_28cm",
  "soil_temperature_0_to_7cm",
  "leaf_wetness_probability",
  "vapour_pressure_deficit",
  "shortwave_radiation",
  "et0_fao_evapotranspiration",
].join(",");

const DAILY_FIELDS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "et0_fao_evapotranspiration",
  "shortwave_radiation_sum",
  "uv_index_max",
  "relative_humidity_2m_mean",
  "dew_point_2m_mean",
  "sunshine_duration",
].join(",");

/**
 * Fetches the agricultural weather forecast for a farm centroid from
 * Open-Meteo (no API key required). The response now includes the extra
 * radiation, ET0, soil-temperature and leaf-wetness fields used by the
 * field-work and disease-pressure engines.
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  options: { signal?: AbortSignal } = {},
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    current: CURRENT_FIELDS,
    hourly: HOURLY_FIELDS,
    daily: DAILY_FIELDS,
    timezone: "auto",
    forecast_days: "7",
  });

  let response: Response;
  try {
    response = await fetch(`${OPEN_METEO_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: options.signal,
      cache: "no-store",
    });
  } catch (cause) {
    // Connection errors (e.g. `fetch failed`, connect timeouts) must surface as
    // a weather upstream failure, not an unhandled 500.
    throw new WeatherFetchError(
      `Could not reach Open-Meteo (${cause instanceof Error ? cause.message : "network error"}).`,
    );
  }

  const payload = (await response.json()) as OpenMeteoResponse;

  if (!response.ok) {
    throw new WeatherFetchError(
      payload?.reason ?? `Open-Meteo request failed (${response.status}).`,
    );
  }

  const dailyTime = (payload.daily?.time as string[] | undefined) ?? [];
  const daily: DailyForecast[] = dailyTime.map((date, index) => ({
    date,
    tempMax: numAt(payload.daily?.temperature_2m_max, index) ?? 0,
    tempMin: numAt(payload.daily?.temperature_2m_min, index) ?? 0,
    precipitationSum: numAt(payload.daily?.precipitation_sum, index) ?? 0,
    precipitationProbability:
      numAt(payload.daily?.precipitation_probability_max, index) ?? 0,
    windSpeedMax: numAt(payload.daily?.wind_speed_10m_max, index) ?? 0,
    windGustMax: numAt(payload.daily?.wind_gusts_10m_max, index) ?? 0,
    et0: numAt(payload.daily?.et0_fao_evapotranspiration, index) ?? 0,
    radiationMj: numAt(payload.daily?.shortwave_radiation_sum, index) ?? 0,
    uvIndexMax: numAt(payload.daily?.uv_index_max, index) ?? 0,
    humidityMean: numAt(payload.daily?.relative_humidity_2m_mean, index) ?? 0,
    dewPointMean: numAt(payload.daily?.dew_point_2m_mean, index) ?? 0,
    sunshineHours: (numAt(payload.daily?.sunshine_duration, index) ?? 0) / 3600,
  }));

  const hourlyTime = (payload.hourly?.time as string[] | undefined) ?? [];
  const hourlyAgro: HourlyAgroPoint[] = hourlyTime
    .slice(0, 168)
    .map((time, index) => ({
      time,
      temperature: numAt(payload.hourly?.temperature_2m, index),
      humidity: numAt(payload.hourly?.relative_humidity_2m, index),
      precipitation: numAt(payload.hourly?.precipitation, index),
      precipitationProbability: numAt(
        payload.hourly?.precipitation_probability,
        index,
      ),
      windSpeed: numAt(payload.hourly?.wind_speed_10m, index),
      windGust: numAt(payload.hourly?.wind_gusts_10m, index),
      soilMoisture: numAt(payload.hourly?.soil_moisture_0_to_7cm, index),
      soilMoistureDeep: numAt(payload.hourly?.soil_moisture_7_to_28cm, index),
      soilTemperature: numAt(
        payload.hourly?.soil_temperature_0_to_7cm,
        index,
      ),
      leafWetness: numAt(payload.hourly?.leaf_wetness_probability, index),
      vpd: numAt(payload.hourly?.vapour_pressure_deficit, index),
      radiation: numAt(payload.hourly?.shortwave_radiation, index),
      et0: numAt(payload.hourly?.et0_fao_evapotranspiration, index),
    }));

  const hourlySoilMoisture: HourlySoilMoisture[] = hourlyAgro
    .slice(0, 48)
    .map((point) => ({ time: point.time, value: point.soilMoisture }));

  const currentSoilMoisture = findCurrentSoilMoisture(hourlySoilMoisture);

  return {
    latitude: num(payload.latitude) ?? latitude,
    longitude: num(payload.longitude) ?? longitude,
    elevation: num(payload.elevation),
    timezone: payload.timezone ?? "UTC",
    timezoneAbbreviation: payload.timezone_abbreviation ?? "UTC",
    current: {
      time:
        typeof payload.current?.time === "string"
          ? payload.current.time
          : null,
      temperature: num(payload.current?.temperature_2m),
      humidity: num(payload.current?.relative_humidity_2m),
      precipitation: num(payload.current?.precipitation),
      windSpeed: num(payload.current?.wind_speed_10m),
      windGust: num(payload.current?.wind_gusts_10m),
      apparentTemperature: num(payload.current?.apparent_temperature),
      dewPoint: num(payload.current?.dew_point_2m),
      radiation: num(payload.current?.shortwave_radiation),
      uvIndex: num(payload.current?.uv_index),
      soilMoisture: currentSoilMoisture ?? num(payload.current?.soil_moisture_0_to_7cm),
      soilMoistureDeep: num(payload.current?.soil_moisture_7_to_28cm),
      soilTemperature: num(payload.current?.soil_temperature_0_to_7cm),
      vpd: num(payload.current?.vapour_pressure_deficit),
    },
    daily,
    hourlySoilMoisture,
    hourlyAgro,
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

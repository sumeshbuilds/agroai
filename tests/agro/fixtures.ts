import type {
  DailyForecast,
  HourlyAgroPoint,
  WeatherSnapshot,
} from "../../src/lib/weather";

export interface WeatherOptions {
  soilMoisture?: number | null;
  rainChance?: number;
  rainMm?: number;
  wind?: number;
  gust?: number;
  tempMax?: number;
  tempMin?: number;
  humidity?: number;
  et0?: number;
  leafWetness?: number;
  /** Days (0-based) that should be rainy. */
  rainyDays?: number[];
  days?: number;
  startDate?: string;
}

/**
 * Deterministic forecast fixture. Hourly rows cover each day 00:00–23:00 so the
 * work-window engine can find calm, rain-free blocks.
 */
export function makeWeather(options: WeatherOptions = {}): WeatherSnapshot {
  const days = options.days ?? 7;
  const startDate = options.startDate ?? "2026-11-12";
  const start = new Date(`${startDate}T00:00:00Z`);
  const rainyDays = new Set(options.rainyDays ?? []);
  const rainChance = options.rainChance ?? 10;
  const rainMm = options.rainMm ?? 0;
  const wind = options.wind ?? 8;
  const gust = options.gust ?? 14;
  const tempMax = options.tempMax ?? 29;
  const tempMin = options.tempMin ?? 19;
  const humidity = options.humidity ?? 62;
  const et0 = options.et0 ?? 4.5;
  const soilMoisture = options.soilMoisture ?? 0.24;
  const leafWetness = options.leafWetness ?? 15;

  const daily: DailyForecast[] = [];
  const hourlyAgro: HourlyAgroPoint[] = [];

  for (let day = 0; day < days; day += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + day);
    const iso = date.toISOString().slice(0, 10);
    const wet = rainyDays.has(day);

    daily.push({
      date: iso,
      tempMax,
      tempMin,
      precipitationSum: wet ? rainMm : 0,
      precipitationProbability: wet ? 80 : rainChance,
      windSpeedMax: wind,
      windGustMax: gust,
      et0,
      radiationMj: 18,
      uvIndexMax: 6,
      humidityMean: wet ? 90 : humidity,
      dewPointMean: 18,
      sunshineHours: wet ? 1 : 7,
    });

    for (let hour = 0; hour < 24; hour += 1) {
      const hourRain = wet ? 70 : rainChance;
      hourlyAgro.push({
        time: `${iso}T${String(hour).padStart(2, "0")}:00`,
        temperature: hour >= 6 && hour <= 16 ? tempMax : tempMin,
        humidity: wet ? 92 : hour <= 8 ? 85 : humidity,
        precipitation: wet ? 1.5 : 0,
        precipitationProbability: hourRain,
        windSpeed: hour >= 9 && hour <= 16 ? wind : Math.max(2, wind - 4),
        windGust: hour >= 9 && hour <= 16 ? gust : Math.max(4, gust - 6),
        soilMoisture,
        soilMoistureDeep: soilMoisture + 0.04,
        soilTemperature: 24,
        leafWetness: wet ? 75 : hour <= 7 ? leafWetness + 30 : leafWetness,
        vpd: 0.9,
        radiation: hour >= 6 && hour <= 17 ? 420 : 0,
        et0: 0.2,
      });
    }
  }

  return {
    latitude: 20.09,
    longitude: 83.16,
    elevation: 130,
    timezone: "Asia/Kolkata",
    timezoneAbbreviation: "IST",
    current: {
      time: `${startDate}T09:00`,
      temperature: (tempMax + tempMin) / 2,
      humidity,
      precipitation: 0,
      windSpeed: wind,
      windGust: gust,
      apparentTemperature: tempMax,
      dewPoint: 18,
      radiation: 380,
      uvIndex: 5,
      soilMoisture,
      soilMoistureDeep: soilMoisture + 0.04,
      soilTemperature: 24,
      vpd: 0.9,
    },
    daily,
    hourlySoilMoisture: hourlyAgro
      .slice(0, 48)
      .map((point) => ({ time: point.time, value: point.soilMoisture })),
    hourlyAgro,
    fetchedAt: `${startDate}T03:00:00.000Z`,
    source: "open-meteo",
  };
}

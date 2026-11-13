import type { ClimateSummary } from "./soil";

/**
 * Climate normals from Open-Meteo's ERA5 archive (free, no key).
 *
 * A crop-fit decision needs more than the next seven days. We read the last
 * 365 days of daily rainfall and temperature for the farm centroid and derive
 * an annual rainfall estimate, a mean temperature and the warmest month mean.
 * The result is cached in-process for 12 hours because normals move slowly.
 */

const ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: ClimateSummary | null;
}

const cache = new Map<string, CacheEntry>();

interface ArchiveResponse {
  daily?: {
    time?: string[];
    precipitation_sum?: Array<number | null>;
    temperature_2m_mean?: Array<number | null>;
  };
  reason?: string;
}

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function fetchClimate(
  latitude: number,
  longitude: number,
): Promise<ClimateSummary | null> {
  const end = new Date();
  end.setDate(end.getDate() - 2);
  const start = new Date(end);
  start.setDate(start.getDate() - 364);

  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    start_date: isoDate(start),
    end_date: isoDate(end),
    daily: "precipitation_sum,temperature_2m_mean",
    timezone: "auto",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${ARCHIVE_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as ArchiveResponse;
    const times = payload.daily?.time ?? [];
    const rain = payload.daily?.precipitation_sum ?? [];
    const temp = payload.daily?.temperature_2m_mean ?? [];

    if (times.length === 0) return null;

    let rainfall = 0;
    let tempSum = 0;
    let tempCount = 0;
    const monthTotals = new Map<string, { sum: number; count: number }>();

    times.forEach((date, index) => {
      const rainValue = num(rain[index]);
      const tempValue = num(temp[index]);
      if (rainValue !== null) rainfall += rainValue;
      if (tempValue !== null) {
        tempSum += tempValue;
        tempCount += 1;
        const month = date.slice(0, 7);
        const entry = monthTotals.get(month) ?? { sum: 0, count: 0 };
        entry.sum += tempValue;
        entry.count += 1;
        monthTotals.set(month, entry);
      }
    });

    if (tempCount === 0) return null;

    const monthlyMeans = [...monthTotals.values()]
      .filter((entry) => entry.count >= 10)
      .map((entry) => entry.sum / entry.count);

    return {
      annualRainfallMm: round(rainfall, 0),
      meanTempC: round(tempSum / tempCount, 1),
      maxMonthlyTempC:
        monthlyMeans.length > 0 ? round(Math.max(...monthlyMeans), 1) : null,
      source: "archive",
      capturedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the last-12-month climate summary, or null when the archive is
 * unreachable. Never throws: crop fit degrades to soil-only scoring.
 */
export async function fetchClimateSummary(
  latitude: number,
  longitude: number,
): Promise<ClimateSummary | null> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await fetchClimate(latitude, longitude);
  cache.set(key, {
    value,
    // A failed archive call should be retried soon; a success is stable.
    expiresAt: Date.now() + (value ? CACHE_TTL_MS : 15 * 60 * 1000),
  });
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt,
    )[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return value;
}

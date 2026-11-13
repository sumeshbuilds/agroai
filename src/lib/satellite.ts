import type { GeoPoint } from "./types";

/**
 * Sentinel-2 vegetation observation (optional integration).
 *
 * Copernicus Data Space is used through the Sentinel Hub Statistical API. It
 * needs a free CDSE OAuth client (`CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`); when
 * those are absent the feature reports "not configured" instead of guessing.
 *
 * What the number means: NDVI is a 0–1 vegetation index from 10 m Sentinel-2
 * pixels. It says whether the field's canopy is greener or browner than the
 * previous usable scene. It cannot identify a pest, prove ownership, or detect
 * a person. Small plots (< ~1 ha) contain too few pixels to be reliable.
 */

export interface SatelliteObservation {
  available: true;
  provider: "sentinel-2-l2a";
  /** Observation date, `YYYY-MM-DD`. */
  observedAt: string;
  ndvi: number;
  ndviMin: number | null;
  ndviMax: number | null;
  validPixelPct: number;
  trend: "rising" | "stable" | "falling" | "unknown";
  previous: { date: string; ndvi: number } | null;
  /** Plain-language reading of the change. */
  interpretation: string;
  caveats: string[];
  smallPlot: boolean;
  areaAcres: number | null;
  capturedAt: string;
}

export type SatelliteErrorCode =
  | "SATELLITE_NOT_CONFIGURED"
  | "SATELLITE_NO_SCENE"
  | "SATELLITE_UPSTREAM"
  | "SATELLITE_INVALID_FARM";

export class SatelliteError extends Error {
  code: SatelliteErrorCode;

  constructor(code: SatelliteErrorCode, message: string) {
    super(message);
    this.name = "SatelliteError";
    this.code = code;
  }
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface StatsResponse {
  status?: string;
  data?: Array<{
    interval?: { from?: string; to?: string };
    outputs?: {
      ndvi?: {
        bands?: { B0?: { stats?: Record<string, unknown> } };
      };
      dataMask?: {
        bands?: { B0?: { stats?: Record<string, unknown> } };
      };
    };
  }>;
  error?: { message?: string };
}

const TOKEN_URL =
  process.env.CDSE_TOKEN_URL?.trim() ||
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATISTICS_URL =
  process.env.CDSE_STATISTICS_URL?.trim() ||
  "https://sh.dataspace.copernicus.eu/api/v1/statistics";

const LOOKBACK_DAYS = clampNumber(
  Number(process.env.SATELLITE_LOOKBACK_DAYS),
  10,
  120,
  45,
);
const OBSERVATION_CACHE_MS = 60 * 60 * 1000;
const observationCache = new Map<
  string,
  { expiresAt: number; value: SatelliteObservation }
>();

let tokenCache: TokenCache | null = null;

function clampNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function isSatelliteConfigured(): boolean {
  return Boolean(
    process.env.CDSE_CLIENT_ID?.trim() &&
      process.env.CDSE_CLIENT_SECRET?.trim(),
  );
}

const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B04", "B08", "SCL", "dataMask"],
    output: [
      { id: "ndvi", bands: 1 },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const cloudy = s.SCL === 3 || s.SCL === 8 || s.SCL === 9 || s.SCL === 10 || s.SCL === 11;
  const denom = s.B08 + s.B04;
  const ndvi = denom === 0 ? 0 : (s.B08 - s.B04) / denom;
  return { ndvi: [ndvi], dataMask: [cloudy ? 0 : s.dataMask] };
}`;

async function getToken(): Promise<string> {
  const clientId = process.env.CDSE_CLIENT_ID?.trim();
  const clientSecret = process.env.CDSE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new SatelliteError(
      "SATELLITE_NOT_CONFIGURED",
      "Satellite observations need a free Copernicus Data Space OAuth client.",
    );
  }

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const scope = process.env.CDSE_SCOPE?.trim();
  if (scope) body.set("scope", scope);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new SatelliteError(
        "SATELLITE_UPSTREAM",
        `Copernicus sign-in failed (${response.status}). Check CDSE_CLIENT_ID and CDSE_CLIENT_SECRET.`,
      );
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new SatelliteError(
        "SATELLITE_UPSTREAM",
        "Copernicus returned no access token.",
      );
    }

    tokenCache = {
      token: payload.access_token,
      expiresAt: Date.now() + clampNumber(Number(payload.expires_in), 60, 3600, 600) * 1000,
    };
    return tokenCache.token;
  } finally {
    clearTimeout(timer);
  }
}

function bboxOf(points: GeoPoint[]): [number, number, number, number] {
  const lngs = points.map(([, lng]) => lng);
  const lats = points.map(([lat]) => lat);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

/** Rough planar area in acres, duplicated cheaply to avoid a server import cycle. */
function areaAcres(points: GeoPoint[]): number | null {
  if (points.length < 3) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371008.8;
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    total +=
      toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  const m2 = Math.abs((total * R * R) / 2);
  return m2 / 4046.8564224;
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function meanFromStats(stats: Record<string, unknown> | undefined): number | null {
  return stats ? numberFrom(stats.mean) : null;
}

function parseSeries(payload: StatsResponse): Array<{
  date: string;
  ndvi: number;
  validPixelPct: number;
}> {
  const rows: Array<{ date: string; ndvi: number; validPixelPct: number }> = [];

  for (const entry of payload.data ?? []) {
    const from = entry.interval?.from;
    if (!from) continue;
    const ndvi = meanFromStats(entry.outputs?.ndvi?.bands?.B0?.stats);
    if (ndvi === null) continue;
    const valid = meanFromStats(entry.outputs?.dataMask?.bands?.B0?.stats);
    const validPixelPct = valid === null ? 0 : Math.round(valid * 100);
    if (validPixelPct < 5) continue;
    rows.push({ date: from.slice(0, 10), ndvi, validPixelPct });
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function interpret(
  latest: number,
  previous: number | null,
  smallPlot: boolean,
): {
  trend: SatelliteObservation["trend"];
  interpretation: string;
  caveats: string[];
} {
  const caveats = [
    "Sentinel-2 pixels are about 10 m across; a small plot mixes field and non-field pixels.",
    "Cloud cover can leave gaps for 1–3 weeks in the monsoon.",
    "NDVI shows canopy greenness, not pest damage, ownership or yield.",
  ];

  if (smallPlot) {
    caveats.unshift(
      "This plot is small for a 10 m satellite pixel, so treat the index as a rough field-level check.",
    );
  }

  if (previous === null) {
    return {
      trend: "unknown",
      interpretation:
        "First usable observation for this field. The next cloud-free scene will show a change.",
      caveats,
    };
  }

  const change = latest - previous;
  if (Math.abs(change) < 0.04) {
    return {
      trend: "stable",
      interpretation:
        "Canopy greenness is stable compared with the previous usable scene.",
      caveats,
    };
  }
  if (change > 0) {
    return {
      trend: "rising",
      interpretation:
        "Canopy greenness has increased since the previous usable scene — consistent with active growth after rain or irrigation.",
      caveats,
    };
  }
  return {
    trend: "falling",
    interpretation:
      "Canopy greenness has fallen since the previous usable scene. Check the field for water stress, pests, disease or harvest progress.",
    caveats,
  };
}

/**
 * Fetches the latest usable Sentinel-2 NDVI for a field boundary.
 * Throws a coded `SatelliteError` when unavailable; callers show the code.
 */
export async function fetchSatelliteObservation(input: {
  farmId: number;
  points: GeoPoint[];
  latitude: number;
  longitude: number;
}): Promise<SatelliteObservation> {
  const { points, farmId } = input;
  if (!isSatelliteConfigured()) {
    throw new SatelliteError(
      "SATELLITE_NOT_CONFIGURED",
      "Satellite monitoring is not configured. Add CDSE_CLIENT_ID and CDSE_CLIENT_SECRET to enable it.",
    );
  }
  if (points.length < 3) {
    throw new SatelliteError(
      "SATELLITE_INVALID_FARM",
      "Draw the farm boundary first — satellite statistics need a polygon.",
    );
  }

  const cacheKey = `${farmId}:${points
    .map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join(";")}`;
  const cached = observationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const token = await getToken();
  const bbox = bboxOf(points);
  const area = areaAcres(points);
  const smallPlot = area !== null && area < 1;

  const geometry = {
    type: "Polygon" as const,
    coordinates: [
      [...points.map(([lat, lng]) => [lng, lat]), [points[0][1], points[0][0]]],
    ],
  };

  const payload = {
    input: {
      bounds: {
        bbox,
        geometry,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            maxCloudCoverage: clampNumber(
              Number(process.env.SATELLITE_MAX_CLOUD),
              0,
              100,
              45,
            ),
            mosaickingOrder: "leastCC",
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: isoDaysAgo(LOOKBACK_DAYS),
        to: new Date().toISOString(),
      },
      aggregationInterval: { of: "P1D" },
      evalscript: EVALSCRIPT,
      resx: 10,
      resy: 10,
    },
    calculations: {
      ndvi: {
        statistics: {
          percentiles: [10, 50, 90],
        },
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(STATISTICS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 401) {
      tokenCache = null;
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new SatelliteError(
        "SATELLITE_UPSTREAM",
        `Copernicus statistics request failed (${response.status}). ${detail}`,
      );
    }

    const parsed = (await response.json()) as StatsResponse;
    if (parsed.error?.message) {
      throw new SatelliteError("SATELLITE_UPSTREAM", parsed.error.message);
    }

    const series = parseSeries(parsed);
    if (series.length === 0) {
      throw new SatelliteError(
        "SATELLITE_NO_SCENE",
        `No cloud-free Sentinel-2 scene was found in the last ${LOOKBACK_DAYS} days.`,
      );
    }

    const latest = series[series.length - 1];
    const previous = series.length > 1 ? series[series.length - 2] : null;
    const reading = interpret(latest.ndvi, previous?.ndvi ?? null, smallPlot);

    const value: SatelliteObservation = {
      available: true,
      provider: "sentinel-2-l2a",
      observedAt: latest.date,
      ndvi: Math.round(latest.ndvi * 1000) / 1000,
      ndviMin: null,
      ndviMax: null,
      validPixelPct: latest.validPixelPct,
      trend: reading.trend,
      previous: previous
        ? { date: previous.date, ndvi: Math.round(previous.ndvi * 1000) / 1000 }
        : null,
      interpretation: reading.interpretation,
      caveats: reading.caveats,
      smallPlot,
      areaAcres: area === null ? null : Math.round(area * 100) / 100,
      capturedAt: new Date().toISOString(),
    };

    observationCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + OBSERVATION_CACHE_MS,
    });
    return value;
  } catch (error) {
    if (error instanceof SatelliteError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SatelliteError(
        "SATELLITE_UPSTREAM",
        "Copernicus took too long to respond. Try again later.",
      );
    }
    throw new SatelliteError(
      "SATELLITE_UPSTREAM",
      error instanceof Error
        ? error.message
        : "Could not read the satellite observation.",
    );
  } finally {
    clearTimeout(timer);
  }
}

export const TREND_META: Record<
  SatelliteObservation["trend"],
  { label: string; tone: "leaf" | "warn" | "danger" | "muted" }
> = {
  rising: { label: "Greening up", tone: "leaf" },
  stable: { label: "Stable", tone: "muted" },
  falling: { label: "Browning", tone: "danger" },
  unknown: { label: "First reading", tone: "muted" },
};

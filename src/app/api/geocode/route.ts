import { fail, ok } from "@/lib/http";
import {
  parseCoordinateQuery,
  type GeocodeKind,
  type GeocodePlace,
} from "@/lib/geocode";

/**
 * GET /api/geocode?q=<village|town|lat,lng>
 *
 * Keyless village / town search backed by Photon (OpenStreetMap). The public
 * endpoint asks for at most one request per second, so results are cached per
 * server instance and upstream calls are spaced out.
 */

const PHOTON_URL = "https://photon.komoot.io/api/";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 120;
const RESULT_LIMIT = 6;
const UPSTREAM_GAP_MS = 600;

interface PhotonProperties {
  osm_type?: string;
  osm_id?: number;
  osm_key?: string;
  osm_value?: string;
  name?: string;
  street?: string;
  locality?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  type?: string;
  extent?: number[];
}

interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: PhotonProperties;
}

interface CacheEntry {
  at: number;
  places: GeocodePlace[];
}

const cache = new Map<string, CacheEntry>();

// Serialise upstream calls so a burst of keystrokes cannot hammer Photon.
let upstreamQueue: Promise<unknown> = Promise.resolve();
let lastUpstreamCall = 0;

async function callPhoton(url: URL, signal: AbortSignal): Promise<Response> {
  const run = upstreamQueue.then(async () => {
    const abort = () => new DOMException("Aborted", "AbortError");
    if (signal.aborted) throw abort();

    const wait = Math.max(0, UPSTREAM_GAP_MS - (Date.now() - lastUpstreamCall));
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    if (signal.aborted) throw abort();

    lastUpstreamCall = Date.now();
    return fetch(url, {
      signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "AgroAI/0.1 (farm field map location search)",
      },
    });
  });

  upstreamQueue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

// Villages/towns/cities and administrative areas should outrank roads and
// stations, but keep Photon's relevance order inside each group so an exact
// city match still beats a same-named village in another state.
const KIND_GROUP: Record<GeocodeKind, number> = {
  village: 0,
  hamlet: 0,
  town: 0,
  city: 0,
  locality: 0,
  suburb: 0,
  neighbourhood: 0,
  dwelling: 0,
  farm: 0,
  district: 0,
  state: 0,
  country: 0,
  coordinate: 0,
  street: 1,
  station: 1,
  area: 1,
  place: 1,
};

const PLACE_KINDS: Record<string, GeocodeKind> = {
  village: "village",
  hamlet: "hamlet",
  isolated_dwelling: "dwelling",
  farm: "farm",
  town: "town",
  city: "city",
  locality: "locality",
  suburb: "suburb",
  neighbourhood: "neighbourhood",
  quarter: "neighbourhood",
  borough: "suburb",
  county: "district",
  district: "district",
  state: "state",
  region: "state",
  country: "country",
};

function lookupPlaceKind(value: string): GeocodeKind | null {
  return Object.hasOwn(PLACE_KINDS, value) ? PLACE_KINDS[value] : null;
}

function resolveKind(props: PhotonProperties): GeocodeKind {
  const key = (props.osm_key ?? "").toLowerCase();
  const value = (props.osm_value ?? "").toLowerCase();
  const type = (props.type ?? "").toLowerCase();

  if (key === "place") return lookupPlaceKind(value) ?? "place";

  if (key === "boundary" && value === "administrative") {
    if (type === "county" || type === "district") return "district";
    if (type === "state" || type === "region") return "state";
    if (type === "country") return "country";
    if (type === "city") return "city";
    if (type === "town") return "town";
    return "area";
  }

  if (key === "highway") return "street";
  if (key === "railway") return "station";
  if (key === "landuse" || key === "natural" || key === "waterway") {
    return "area";
  }

  return lookupPlaceKind(type) ?? "place";
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildName(props: PhotonProperties): string | null {
  return (
    clean(props.name) ??
    clean(props.street) ??
    clean(props.city) ??
    clean(props.county) ??
    clean(props.state) ??
    clean(props.country)
  );
}

function buildDetail(props: PhotonProperties, name: string): string {
  const parts = [
    clean(props.locality),
    clean(props.city),
    clean(props.county),
    clean(props.state),
    clean(props.country),
  ].filter((part): part is string => part !== null);

  const deduped: string[] = [];
  for (const part of parts) {
    if (part.toLowerCase() === name.toLowerCase()) continue;
    if (deduped.some((seen) => seen.toLowerCase() === part.toLowerCase())) {
      continue;
    }
    deduped.push(part);
  }

  return deduped.slice(0, 3).join(", ");
}

function parseExtent(
  extent: number[] | undefined,
): [number, number, number, number] | null {
  if (!extent || extent.length !== 4) return null;
  const [west, north, east, south] = extent;
  if (![west, north, east, south].every((value) => Number.isFinite(value))) {
    return null;
  }
  // Photon returns [west, north, east, south]; Leaflet expects
  // [south, west, north, east].
  return [south, west, north, east];
}

function mapFeature(feature: PhotonFeature): GeocodePlace | null {
  const props = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) return null;

  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = buildName(props);
  if (!name) return null;

  const kind = resolveKind(props);
  const id =
    props.osm_type && props.osm_id
      ? `${props.osm_type}${props.osm_id}`
      : `${lat},${lng}`;

  return {
    id,
    name,
    detail: buildDetail(props, name),
    kind,
    lat,
    lng,
    bbox: parseExtent(props.extent),
  };
}

function getCached(key: string): GeocodePlace[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.places;
}

function setCached(key: string, places: GeocodePlace[]): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), places });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  if (query.length < MIN_QUERY_LENGTH) {
    return ok({ places: [] });
  }

  // A raw GPS pair needs no network hop.
  const coordinates = parseCoordinateQuery(query);
  if (coordinates) {
    const place: GeocodePlace = {
      id: `coordinate:${coordinates.lat},${coordinates.lng}`,
      name: `${coordinates.lat.toFixed(5)}, ${coordinates.lng.toFixed(5)}`,
      detail: "GPS coordinates",
      kind: "coordinate",
      lat: coordinates.lat,
      lng: coordinates.lng,
      bbox: null,
    };
    return ok({ places: [place] });
  }

  // Keep the cache key independent of the map position: results are global.
  const cacheKey = query.toLowerCase();

  const cached = getCached(cacheKey);
  if (cached) return ok({ places: cached });

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "10");
  url.searchParams.set("lang", "en");

  try {
    const response = await callPhoton(url, request.signal);

    if (!response.ok) {
      console.error(`[geocode] Photon responded with ${response.status}`);
      return fail("Location search is unavailable right now.", 502);
    }

    const payload = (await response.json()) as {
      features?: PhotonFeature[];
    };

    const seen = new Set<string>();
    const places: GeocodePlace[] = [];

    for (const feature of payload.features ?? []) {
      const place = mapFeature(feature);
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      places.push(place);
    }

    places.sort((a, b) => KIND_GROUP[a.kind] - KIND_GROUP[b.kind]);

    const top = places.slice(0, RESULT_LIMIT);
    // Do not cache empty results: a transient upstream hiccup should not hide
    // a real village for the rest of the day.
    if (top.length > 0) setCached(cacheKey, top);

    return ok({ places: top });
  } catch (error) {
    if (request.signal.aborted) {
      return ok({ places: [] });
    }
    console.error("[geocode] request failed:", error);
    return fail("Location search is unavailable right now.", 502);
  }
}

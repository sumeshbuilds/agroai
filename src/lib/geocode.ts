/**
 * Types and small helpers for place (village / town) search. This module is
 * shared by the geocoding API route and the map UI, so it must stay free of
 * server-only imports.
 */

export type GeocodeKind =
  | "village"
  | "hamlet"
  | "town"
  | "city"
  | "locality"
  | "suburb"
  | "neighbourhood"
  | "dwelling"
  | "farm"
  | "district"
  | "state"
  | "country"
  | "street"
  | "station"
  | "area"
  | "coordinate"
  | "place";

export interface GeocodePlace {
  /** Stable identifier (OSM type + id, or the coordinate pair). */
  id: string;
  name: string;
  /** Context line under the name, e.g. "Attabira, Odisha, India". */
  detail: string;
  kind: GeocodeKind;
  lat: number;
  lng: number;
  /** Bounding box as `[south, west, north, east]`, when the source has one. */
  bbox: [number, number, number, number] | null;
}

export interface GeocodeResponse {
  places: GeocodePlace[];
}

/** Zoom to use when flying to a place of the given kind. */
export const PLACE_ZOOM: Record<GeocodeKind, number> = {
  village: 16,
  hamlet: 16,
  dwelling: 17,
  farm: 17,
  neighbourhood: 16,
  suburb: 15,
  locality: 15,
  town: 15,
  city: 13,
  district: 11,
  state: 8,
  country: 5,
  street: 16,
  station: 17,
  area: 15,
  coordinate: 16,
  place: 15,
};

const KIND_LABELS: Record<GeocodeKind, string> = {
  village: "Village",
  hamlet: "Hamlet",
  town: "Town",
  city: "City",
  locality: "Locality",
  suburb: "Suburb",
  neighbourhood: "Neighbourhood",
  dwelling: "Dwelling",
  farm: "Farm",
  district: "District",
  state: "State",
  country: "Country",
  street: "Street",
  station: "Station",
  area: "Area",
  coordinate: "Pin",
  place: "Place",
};

export function placeKindLabel(kind: GeocodeKind): string {
  return KIND_LABELS[kind] ?? "Place";
}

/**
 * Accepts `"20.29, 85.82"`, `"20.29 85.82"` or `"20.29;85.82"` so a farmer can
 * jump to a GPS reading without typing a place name.
 */
export function parseCoordinateQuery(
  query: string,
): { lat: number; lng: number } | null {
  const match = query
    .trim()
    .match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

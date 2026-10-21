import type { GeoPoint } from "./types";

const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_M = 6371008.8;
const SQUARE_METRES_PER_ACRE = 4046.8564224;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function meanCenter(points: GeoPoint[]): { lat: number; lng: number } {
  const [latSum, lngSum] = points.reduce<[number, number]>(
    (acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng],
    [0, 0],
  );
  return { lat: latSum / points.length, lng: lngSum / points.length };
}

/**
 * Area-weighted centroid of a polygon. Uses a local equirectangular projection
 * so the maths stays planar for small farm-sized polygons, then falls back to
 * the mean of the vertices for degenerate (zero-area) inputs.
 */
export function polygonCentroid(points: GeoPoint[]): { lat: number; lng: number } {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length < 3) return meanCenter(points);

  const meanLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos(toRad(meanLat));

  const xs = points.map(([, lng]) => lng * cosLat);
  const ys = points.map(([lat]) => lat);

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const j = (i + 1) % points.length;
    const cross = xs[i] * ys[j] - xs[j] * ys[i];
    twiceArea += cross;
    cx += (xs[i] + xs[j]) * cross;
    cy += (ys[i] + ys[j]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) return meanCenter(points);

  const centroidX = cx / (3 * twiceArea);
  const centroidY = cy / (3 * twiceArea);

  return { lat: centroidY, lng: cosLat === 0 ? 0 : centroidX / cosLat };
}

/** Approximate surface area of a spherical polygon, in acres. */
export function polygonAreaAcres(points: GeoPoint[]): number {
  if (points.length < 3) return 0;

  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    total +=
      toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }

  const areaM2 = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return areaM2 / SQUARE_METRES_PER_ACRE;
}

/** Initial bearing (0–360°) from the first point towards the second. */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const lat1 = toRad(fromLat);
  const lat2 = toRad(toLat);
  const dLng = toRad(toLng - fromLng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function compassDirection(bearing: number): string {
  return COMPASS_POINTS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8];
}

export function polygonBounds(points: GeoPoint[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;

  for (const [lat, lng] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }

  return { south, west, north, east };
}

/** Radial distance tolerance used to decide if two points are the same place. */
export function isValidPoint(value: unknown): value is GeoPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -90 &&
    value[0] <= 90 &&
    value[1] >= -180 &&
    value[1] <= 180
  );
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

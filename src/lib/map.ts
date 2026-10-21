import type { GeoPoint } from "./types";

/**
 * Esri World Imagery — free, no API key, no billing (unlike Google/Mapbox).
 */
export const ESRI_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/** Roughly centred on India; used until a farm is available. */
export const DEFAULT_CENTER: GeoPoint = [22.9734, 78.6569];
export const DEFAULT_ZOOM = 5;
export const FARM_ZOOM = 15;

/** Radius (km) within which a sighting is considered a threat to a farm. */
export const DANGER_RADIUS_KM = 3;

export interface AnimalKind {
  id: string;
  label: string;
  emoji: string;
  severity: "HIGH" | "MEDIUM" | "CRITICAL";
  source: string;
  color: string;
}

export const ANIMAL_KINDS: AnimalKind[] = [
  {
    id: "Elephant Herd",
    label: "Elephant Herd",
    emoji: "🐘",
    severity: "CRITICAL",
    source: "COMMUNITY_SIGHTING",
    color: "#f97316",
  },
  {
    id: "Wild Boar",
    label: "Wild Boar",
    emoji: "🐗",
    severity: "HIGH",
    source: "EDGE_CAM",
    color: "#a855f7",
  },
  {
    id: "Tiger",
    label: "Tiger",
    emoji: "🐅",
    severity: "CRITICAL",
    source: "FOREST_SATELLITE_GRID",
    color: "#eab308",
  },
  {
    id: "Bear",
    label: "Bear",
    emoji: "🐻",
    severity: "HIGH",
    source: "EDGE_CAM",
    color: "#78350f",
  },
  {
    id: "Forest Fire",
    label: "Forest Fire / Thermal",
    emoji: "🔥",
    severity: "CRITICAL",
    source: "NASA_FIRMS",
    color: "#ef4444",
  },
];

export function animalKind(id: string): AnimalKind {
  return (
    ANIMAL_KINDS.find((kind) => kind.id === id) ?? {
      id,
      label: id,
      emoji: "⚠️",
      severity: "HIGH",
      source: "SIMULATED_SIGHTING",
      color: "#ef4444",
    }
  );
}

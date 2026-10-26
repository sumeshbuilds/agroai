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

/** Radius (km) within which a live camera is considered to watch a farm. */
export const CAMERA_WATCH_RADIUS_KM = 3;

/** Client-side formatting helpers (only used after data loads in the browser). */

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

export function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

export function formatAcres(acres: number | null | undefined): string {
  if (acres === null || acres === undefined) return "—";
  return `${acres.toFixed(2)} acres`;
}

export const SQUARE_METRES_PER_ACRE = 4046.8564224;
export const HECTARES_PER_ACRE = 0.40468564224;

export function acresToHectares(acres: number): number {
  return acres * HECTARES_PER_ACRE;
}

export function acresToSquareMetres(acres: number): number {
  return acres * SQUARE_METRES_PER_ACRE;
}

/** "2.50 acres · 1.01 ha" — used on map + field cards. */
export function formatLandArea(acres: number | null | undefined): string {
  if (acres === null || acres === undefined) return "—";
  return `${acres.toFixed(2)} acres · ${acresToHectares(acres).toFixed(2)} ha`;
}


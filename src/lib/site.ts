/**
 * One place for everything search engines and share cards need.
 *
 * The canonical origin is `www` because `agroai.co.in` issues a 308 redirect
 * to `www.agroai.co.in` — canonical tags, the sitemap and robots.txt must
 * point at the same host to avoid "Page with redirect" reports in Search
 * Console.
 */
const FALLBACK_SITE_URL = "https://www.agroai.co.in";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? FALLBACK_SITE_URL
).replace(/\/+$/, "");

export const SITE_NAME = "AgroAI";

export const SITE_LOCALE = "en_IN";

export const SITE_TITLE =
  "AgroAI Odisha — Farm Security & Crop AI for Kalinga";

export const SITE_DESCRIPTION =
  "AgroAI is an agricultural startup in Odisha (Kalinga). Map your field from satellite imagery, watch it with a spare phone camera, and get weather-led crop guidance and plant-photo disease scans — in Odia and English, on a weak signal.";

export const SITE_KEYWORDS = [
  "AgroAI",
  "AgroAI Odisha",
  "AgroAI Kalinga",
  "agricultural startup in Odisha",
  "agri-tech startup Odisha",
  "smart farming Odisha",
  "Kalinga agriculture",
  "Kalahandi farmers",
  "crop disease detection",
  "farm camera",
  "Odia farming app",
  "satellite farm mapping",
];

export const SITE_GITHUB = "https://github.com/sumeshbuilds/agroai";

/** Absolute URL for a path, e.g. `absoluteUrl("/odisha")`. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Public pages that are safe to index. Keep this list in sync with
 * `src/app/sitemap.ts` and the nav/footer links.
 */
export const INDEXABLE_ROUTES = [
  {
    path: "/",
    changeFrequency: "weekly" as const,
    priority: 1,
  },
  {
    path: "/odisha",
    changeFrequency: "weekly" as const,
    priority: 0.9,
  },
];

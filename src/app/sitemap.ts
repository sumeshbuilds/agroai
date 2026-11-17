import type { MetadataRoute } from "next";

import { INDEXABLE_ROUTES, absoluteUrl } from "@/lib/site";

/**
 * Only public, content-bearing pages belong here. App screens are gated and
 * marked `noindex`; listing them would waste crawl budget.
 *
 * The date is bumped by hand when the copy changes. Recomputing it on every
 * request would teach Google that `lastmod` is noise.
 */
const CONTENT_LAST_MODIFIED = new Date("2026-11-17T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: CONTENT_LAST_MODIFIED,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

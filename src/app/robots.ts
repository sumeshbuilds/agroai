import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * API routes and the token-scoped camera stream are the only places a crawler
 * has nothing useful to read. Private app screens are reachable but carry a
 * `noindex` directive, so a page that was indexed before the launch is dropped
 * cleanly instead of lingering behind a `Disallow`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

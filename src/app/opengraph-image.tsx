import { ImageResponse } from "next/og";

import { SITE_URL } from "@/lib/site";

export const alt =
  "AgroAI — farm security and crop guidance for Odisha and Kalinga";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card Google, WhatsApp and X show for every public page. Generated
 * at build time, so it costs nothing at request time.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#164027",
          color: "#f5f1e6",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 66,
              height: 66,
              borderRadius: 18,
              background: "#f5f1e6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#164027",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            a
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.04em",
            }}
          >
            agroai
          </div>
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#c9f26c",
            }}
          >
            ODISHA · KALINGA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
            }}
          >
            Your land, watched.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              color: "#c9f26c",
            }}
          >
            Your crop, guided.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 16,
              fontSize: 30,
              color: "#aebcaf",
            }}
          >
            Farm camera · crop-day plan · plant-photo scans · weather windows
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 22,
            color: "#aebcaf",
          }}
        >
          <div style={{ display: "flex" }}>
            {SITE_URL.replace(/^https?:\/\//, "")}
          </div>
          <div style={{ display: "flex", color: "#4d6b52" }}>•</div>
          <div style={{ display: "flex" }}>Odia + English</div>
          <div style={{ display: "flex", color: "#4d6b52" }}>•</div>
          <div style={{ display: "flex" }}>Built for a weak signal</div>
        </div>
      </div>
    ),
    { ...size },
  );
}

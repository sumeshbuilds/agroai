import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AgroAI — Smart farming for Odisha",
    short_name: "AgroAI",
    description:
      "Farmland mapping, hyper-local weather, AI crop guidance, plant-photo disease detection and a live phone-powered field camera — built for Odisha (Kalinga).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f3ed",
    theme_color: "#18291f",
    lang: "en-IN",
    dir: "ltr",
    categories: ["business", "productivity", "utilities"],
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgroAI — Smart farming for every field",
    short_name: "AgroAI",
    description:
      "Farmland mapping, hyper-local weather, AI weekly crop advice, plant-photo disease detection and a live phone-powered field camera.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f2f3ed",
    theme_color: "#18291f",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

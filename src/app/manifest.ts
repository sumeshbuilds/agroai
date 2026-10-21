import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgroAI — Smart farming for every field",
    short_name: "AgroAI",
    description:
      "Farmland mapping, hyper-local weather, AI weekly crop advice and wildlife intrusion alerts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: "#047857",
    orientation: "portrait",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}

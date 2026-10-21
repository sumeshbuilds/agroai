import type { Metadata } from "next";

import { MapView } from "@/components/map/MapView";

export const metadata: Metadata = {
  title: "Farm map",
};

export default function MapPage() {
  return <MapView />;
}

import type { Metadata } from "next";

import { CropsView } from "@/components/crops/CropsView";

export const metadata: Metadata = {
  title: "Crops",
};

export default function CropsPage() {
  return <CropsView />;
}

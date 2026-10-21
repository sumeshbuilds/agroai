import type { Metadata } from "next";

import { SimulateView } from "@/components/simulate/SimulateView";

export const metadata: Metadata = {
  title: "Intrusion simulator",
};

export default function SimulatePage() {
  return <SimulateView />;
}

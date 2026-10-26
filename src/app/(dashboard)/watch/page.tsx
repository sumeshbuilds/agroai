import type { Metadata } from "next";

import { WatchView } from "@/components/watch/WatchView";

export const metadata: Metadata = {
  title: "Live field watch",
  description:
    "Pair a phone camera and watch real animal and human movement on your field in near real time.",
};

export default function WatchPage() {
  return <WatchView />;
}

import type { Metadata } from "next";

import { CameraStreamView } from "@/components/camera/CameraStreamView";

export const metadata: Metadata = {
  title: "Field camera",
  description: "Point your phone at the field — live animal and human tracking.",
  robots: { index: false, follow: false },
};

export default function CameraPage() {
  return <CameraStreamView />;
}

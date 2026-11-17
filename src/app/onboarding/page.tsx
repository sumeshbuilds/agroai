import type { Metadata } from "next";

import { OnboardingWizard } from "@/components/auth/OnboardingWizard";

export const metadata: Metadata = {
  title: "Create your farm account",
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <OnboardingWizard />;
}

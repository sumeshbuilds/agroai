import type { Metadata } from "next";

import { LoginPageView } from "@/components/auth/LoginPageView";

export const metadata: Metadata = {
  title: "Welcome back",
};

export default function LoginPage() {
  return <LoginPageView />;
}

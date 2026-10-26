import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth/AuthGate";
import { AppNav } from "@/components/layout/AppNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-dvh flex-col">
        <AppNav />
        <main className="w-full flex-1 pb-24 md:pb-0">{children}</main>
      </div>
    </AuthGate>
  );
}

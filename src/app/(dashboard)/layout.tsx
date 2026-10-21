import type { ReactNode } from "react";

import { AppNav } from "@/components/layout/AppNav";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 md:pb-12">
        {children}
      </main>
    </div>
  );
}

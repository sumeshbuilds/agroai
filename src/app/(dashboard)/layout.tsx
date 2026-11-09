import type { ReactNode } from "react";

import { AuthGate } from "@/components/auth/AuthGate";
import { AppMobile, AppRail } from "@/components/layout/AppNav";

/**
 * App shell: a fixed-height workstation. The dark rail sits on the left on
 * desktop; each page fills the remaining viewport and manages its own
 * scrolling (the home "ops" view pins the satellite map full-height while the
 * analytics column scrolls independently).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
        <div className="sticky top-0 h-dvh shrink-0 p-4 pr-0 max-md:hidden">
          <AppRail />
        </div>
        <div className="flex h-dvh min-w-0 flex-1 flex-col">
          <div className="shrink-0 md:hidden">
            <AppMobile />
          </div>
          <main
            id="main-content"
            tabIndex={-1}
            className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain pb-[calc(6.5rem+env(safe-area-inset-bottom))] outline-none md:pb-0"
          >
            {children}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

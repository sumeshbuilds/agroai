"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";

import { api } from "@/lib/api-client";
import type { FarmerDTO } from "@/lib/types";
import { SessionProvider } from "./session";

/**
 * Client-side session gate for the dashboard shell. API routes enforce the
 * session on the server too — this only handles the redirect and avoids a
 * flash of the dashboard before `/api/auth/me` answers.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [farmer, setFarmer] = useState<FarmerDTO | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    void api
      .me()
      .then(({ farmer: current }) => {
        if (!active) return;
        if (!current) {
          router.replace("/login");
          return;
        }
        setFarmer(current);
      })
      .catch(() => {
        if (active) router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (!farmer) {
    return (
      <div role="status" className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4">
        <span aria-hidden className="animate-pulse-soft flex h-12 w-12 items-center justify-center rounded-2xl bg-rail text-card">
          <Leaf className="h-6 w-6" strokeWidth={2.4} />
        </span>
        <div className="text-center">
          <p className="text-lg font-semibold">Checking your session…</p>
          <p className="muted mt-1 text-sm font-medium">One moment while we load your farm.</p>
        </div>
      </div>
    );
  }

  return <SessionProvider farmer={farmer}>{children}</SessionProvider>;
}

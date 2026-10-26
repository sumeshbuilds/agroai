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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-700 text-white shadow-sm">
          <Leaf className="h-6 w-6" strokeWidth={2.4} />
        </span>
        <div className="text-center">
          <p className="font-semibold">Checking your session…</p>
          <p className="muted mt-1 text-sm">One moment while we load your farm.</p>
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-full w-1/2 animate-pulse-soft rounded-full bg-brand-600" />
        </div>
      </div>
    );
  }

  return <SessionProvider farmer={farmer}>{children}</SessionProvider>;
}

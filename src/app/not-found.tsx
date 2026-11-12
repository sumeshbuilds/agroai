"use client";

import Link from "next/link";
import { Sprout } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--card)] shadow-sm ring-1 ring-[var(--color-line)]">
        <Sprout className="h-7 w-7 text-leaf-600" />
      </span>
      <h1 className="text-[1.7rem] font-semibold tracking-tight">
        {t("Field not found")}
      </h1>
      <p className="muted max-w-sm text-[0.9rem] leading-relaxed">
        {t("This page is not part of AgroAI. Head back to your workstation.")}
      </p>
      <Link href="/dashboard" className="btn btn-primary">
        {t("Back to dashboard")}
      </Link>
    </main>
  );
}

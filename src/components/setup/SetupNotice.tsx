"use client";

import { Database } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { useI18n } from "@/lib/i18n";

/**
 * Shown only when the database is not reachable yet. The Gemini-key notice
 * was intentionally removed — the AI advisory stays quiet about its fallback
 * and the rule-based plan still guides the farmer.
 */
export function SetupNotice({ showDatabase }: { showDatabase?: boolean }) {
  const { t } = useI18n();

  if (!showDatabase) return null;

  return (
    <div className="space-y-2">
      <Callout
        tone="warn"
        icon={<Database className="h-5 w-5" />}
        title={t("Connect your database to start")}
      >
        <p>
          {t("Add")} <code className="font-mono">DATABASE_URL</code>{" "}
          <span>{t("(your Neon Postgres connection string) to")}</span>{" "}
          <code className="font-mono">.env.local</code>
          {t(", then run")} <code className="font-mono">npm run db:push</code>{" "}
          <span>{t("to create the tables and restart")}</span>{" "}
          <code className="font-mono">npm run dev</code>.
        </p>
      </Callout>
    </div>
  );
}

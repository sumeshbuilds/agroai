import { Database } from "lucide-react";

import { Callout } from "@/components/ui/Callout";

/**
 * Shown only when the database is not reachable yet. The Gemini-key notice
 * was intentionally removed — the AI advisory stays quiet about its fallback
 * and the rule-based plan still guides the farmer.
 */
export function SetupNotice({ showDatabase }: { showDatabase?: boolean }) {
  if (!showDatabase) return null;

  return (
    <div className="space-y-2">
      <Callout
        tone="warn"
        icon={<Database className="h-5 w-5" />}
        title="Connect your database to start"
      >
        <p>
          Add <code className="font-mono">DATABASE_URL</code> (your Neon
          Postgres connection string) to{" "}
          <code className="font-mono">.env.local</code>, then run{" "}
          <code className="font-mono">npm run db:push</code> to create the
          tables and restart <code className="font-mono">npm run dev</code>.
        </p>
      </Callout>
    </div>
  );
}

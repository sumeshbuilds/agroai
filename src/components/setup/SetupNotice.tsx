import { Database, KeyRound } from "lucide-react";

import { Callout } from "@/components/ui/Callout";

export function SetupNotice({
  showDatabase,
  showGemini,
}: {
  showDatabase?: boolean;
  showGemini?: boolean;
}) {
  if (!showDatabase && !showGemini) return null;

  return (
    <div className="space-y-2">
      {showDatabase ? (
        <Callout tone="warn" icon={<Database className="h-5 w-5" />} title="Connect your database to start">
          <p>
            Add <code className="font-mono">DATABASE_URL</code> (your Neon Postgres
            connection string) to <code className="font-mono">.env.local</code>,
            then run{" "}
            <code className="font-mono">npm run db:push</code> to create the
            tables and restart <code className="font-mono">npm run dev</code>.
          </p>
        </Callout>
      ) : null}

      {showGemini ? (
        <Callout tone="info" icon={<KeyRound className="h-5 w-5" />} title="AI advisory is using the rule-based fallback">
          <p>
            Add <code className="font-mono">GEMINI_API_KEY</code> to{" "}
            <code className="font-mono">.env.local</code> for Gemini-generated
            weekly advice. The app works without it.
          </p>
        </Callout>
      ) : null}
    </div>
  );
}

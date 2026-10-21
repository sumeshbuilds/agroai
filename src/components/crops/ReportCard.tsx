import { Sparkles } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { MarkdownLite } from "@/components/ui/MarkdownLite";
import { formatRelative } from "@/lib/format";
import type { WeeklyReportDTO } from "@/lib/types";

export function ReportCard({ report }: { report: WeeklyReportDTO }) {
  return (
    <article className="card space-y-3 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-bold">
              {report.cropName
                ? `${report.cropName} — weekly action plan`
                : "Weekly action plan"}
            </h3>
            <p className="muted text-xs">
              Generated {formatRelative(report.createdAt)}
            </p>
          </div>
        </div>

        {report.source === "gemini" ? (
          <span className="chip chip-brand">Gemini · {report.model}</span>
        ) : report.source === "fallback" ? (
          <span className="chip chip-warn">Rule-based fallback</span>
        ) : null}
      </header>

      {report.note ? <Callout tone="info">{report.note}</Callout> : null}

      <MarkdownLite text={report.aiActionPlan} />
    </article>
  );
}

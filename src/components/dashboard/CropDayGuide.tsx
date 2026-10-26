import { CalendarDays, CheckCircle2, ChevronRight, Sprout, TriangleAlert } from "lucide-react";

import { getCropDayGuide } from "@/lib/crop-guide";
import type { CropDTO } from "@/lib/types";

/**
 * Day-by-day crop guide built entirely from the crop the farmer selected and
 * the crop day they entered during onboarding (plus the expected duration).
 */
export function CropDayGuide({ crop }: { crop: CropDTO }) {
  const guide = getCropDayGuide(crop.cropName, crop.ageDays, crop.durationDays);

  return (
    <section className="card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-xl dark:bg-brand-900/40">
            {guide.emoji}
          </span>
          <div>
            <h2 className="text-base font-semibold leading-tight">{crop.cropName} — crop day guide</h2>
            <p className="muted mt-0.5 text-xs">
              {crop.farmlandName ? `${crop.farmlandName} · ` : ""}
              Day {guide.ageDays} of {guide.durationDays}
            </p>
          </div>
        </div>
        <span className="chip chip-brand">
          <Sprout className="h-3.5 w-3.5" />
          {guide.stage.name}
        </span>
      </header>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="muted inline-flex items-center gap-1.5 font-semibold">
            <CalendarDays className="h-3.5 w-3.5" />
            {guide.isHarvestWindow
              ? "Harvest window is open"
              : `Harvest in about ${guide.daysToHarvest} days`}
          </span>
          <span className="font-semibold tabular-nums">{guide.progress}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
            style={{ width: `${Math.max(2, guide.progress)}%` }}
          />
        </div>
      </div>

      <p className="mt-3.5 text-sm leading-relaxed">
        <strong>{guide.stage.focus}</strong>
      </p>

      <div className="mt-3 space-y-2">
        <p className="muted text-[11px] font-semibold uppercase tracking-[0.08em]">
          Do these now
        </p>
        <ul className="space-y-1.5">
          {guide.stage.tasks.map((task) => (
            <li key={task} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              <span>{task}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {guide.stage.watchFor.map((item) => (
          <span key={item} className="chip chip-warn">
            <TriangleAlert className="h-3 w-3" />
            {item}
          </span>
        ))}
      </div>

      {guide.nextStage ? (
        <p className="muted mt-3.5 flex items-start gap-1.5 border-t border-[var(--border)] pt-3 text-xs">
          <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Next stage: <strong className="text-[var(--foreground)]">{guide.nextStage.name}</strong>{" "}
            from day {guide.nextStage.fromDay}.
          </span>
        </p>
      ) : (
        <p className="muted mt-3.5 border-t border-[var(--border)] pt-3 text-xs">
          This is the final stage of the crop cycle.
        </p>
      )}
    </section>
  );
}

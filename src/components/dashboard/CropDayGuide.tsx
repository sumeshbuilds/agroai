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
    <section className="card p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="icon-tile">
            <Sprout className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{crop.cropName} — today in the field</h2>
            <p className="muted mt-1 text-xs leading-relaxed">
              {crop.farmlandName ? `${crop.farmlandName} · ` : ""}
              Day {guide.ageDays} of {guide.durationDays}
            </p>
          </div>
        </div>
        <span className="chip chip-lime">
          <Sprout className="h-3.5 w-3.5" />
          {guide.stage.name}
        </span>
      </header>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="muted inline-flex items-center gap-1.5 font-medium">
            <CalendarDays className="h-3.5 w-3.5" />
            {guide.isHarvestWindow
              ? "Harvest window is open"
              : `Harvest in about ${guide.daysToHarvest} days`}
          </span>
          <span className="font-semibold tabular-nums">{guide.progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={`${crop.cropName} season progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={guide.progress}
          className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep"
        >
          <div
            className="h-full w-full origin-left rounded-full bg-leaf-600"
            style={{ transform: `scaleX(${guide.progress / 100})` }}
          />
        </div>
      </div>

      <p className="mt-3.5 text-sm font-semibold leading-relaxed">
        {guide.stage.focus}
      </p>

      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold">
          Do these now
        </h3>
        <ul className="space-y-2">
          {guide.stage.tasks.map((task) => (
            <li key={task} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-meadow-600" />
              <span>{task}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {guide.stage.watchFor.map((item) => (
          <span key={item} className="chip chip-warn max-w-full whitespace-normal">
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

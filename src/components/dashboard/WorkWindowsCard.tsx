"use client";

import {
  Bug,
  CalendarCheck2,
  CloudRain,
  Droplets,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

import {
  DAY_VERDICT_META,
  DISEASE_PRESSURE_META,
  OPERATION_META,
  type AgroAssessment,
  type DayWorkPlan,
  type FieldOperation,
} from "@/lib/agro-advisory";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekday(iso: string, index: number): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return index === 0 ? "Today" : WEEKDAYS[date.getDay()];
}

const VERDICT_STYLE = {
  good: {
    shell: "border-leaf-300 bg-leaf-100/70",
    dot: "bg-leaf-500",
    text: "text-leaf-700",
  },
  caution: {
    shell: "border-warn-500/40 bg-warn-100/70",
    dot: "bg-warn-500",
    text: "text-warn-700",
  },
  avoid: {
    shell: "border-danger-500/40 bg-danger-100/60",
    dot: "bg-danger-500",
    text: "text-danger-700",
  },
};

const PRIORITY_OPS: FieldOperation[] = [
  "sowing",
  "spraying",
  "irrigation",
  "fertilising",
  "harvesting",
];

export function WorkWindowsCard({
  agro,
  loading = false,
}: {
  agro: AgroAssessment | null;
  loading?: boolean;
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <section className="card p-5" aria-label={t("Field work windows")}>
        <div className="h-4 w-40 animate-pulse-soft rounded bg-paper-deep" />
        <div className="mt-4 h-24 animate-pulse-soft rounded-xl bg-paper-deep" />
        <div className="mt-3 h-16 animate-pulse-soft rounded-xl bg-paper-deep" />
      </section>
    );
  }

  if (!agro) {
    return (
      <section className="card p-5" aria-label={t("Field work windows")}>
        <header className="flex items-center gap-2">
          <span className="icon-tile">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">{t("Work this week")}</h2>
        </header>
        <p className="muted mt-3 text-sm leading-relaxed">
          {t(
            "The 7-day work plan needs a live forecast for this field. It appears automatically when the weather service is reachable.",
          )}
        </p>
      </section>
    );
  }

  const disease = DISEASE_PRESSURE_META[agro.diseasePressure.level];
  const diseaseTone =
    disease.tone === "danger"
      ? "chip-danger"
      : disease.tone === "warn"
        ? "chip-warn"
        : "chip-lime";

  return (
    <section className="card p-5" aria-label={t("Field work windows")}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="icon-tile shrink-0">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {t("Work this week")}
            </h2>
            <p className="muted mt-1 text-xs leading-relaxed">
              {t("Should I work today, and when?")}
            </p>
          </div>
        </div>
        <span className="chip chip-brand">
          {t("{good} of {days} workable", {
            good: agro.workableDays,
            days: agro.days.length,
          })}
        </span>
      </header>

      <div className="mt-4 grid grid-cols-7 gap-1.5" role="list">
        {agro.days.map((day, index) => (
          <DayCell key={day.date} day={day} index={index} />
        ))}
      </div>

      <p className="mt-3 text-sm font-medium leading-relaxed">{t(agro.summary)}</p>

      <div className="mt-4 space-y-2">
        {PRIORITY_OPS.map((operation) => {
          const entry = bestOperationDay(agro.days, operation);
          if (!entry) return null;
          const meta = OPERATION_META[operation];
          return (
            <div
              key={operation}
              className="flex items-start gap-2.5 rounded-xl bg-[var(--card-muted)] px-3 py-2.5"
            >
              <span aria-hidden className="text-base leading-none">
                {meta.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-semibold">
                  {t(meta.label)}
                  <span className="muted ml-1.5 font-normal">
                    · {weekday(entry.day.date, entry.dayIndex)}
                  </span>
                </p>
                <p className="muted mt-0.5 text-[0.72rem] leading-snug">
                  {t(entry.advice.note)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-line)] p-3">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            <Droplets className="h-3.5 w-3.5" />
            {t("Moisture balance")}
          </p>
          <p className="mt-1.5 text-sm font-semibold tabular-nums">
            {t("{mm} mm deficit", { mm: agro.irrigation.deficitMm })}
          </p>
          <p className="muted mt-1 text-[0.72rem] leading-snug">
            {t(agro.irrigation.advice)}
          </p>
        </div>
        <div className={cn("rounded-xl border border-[var(--color-line)] p-3", diseaseTone === "chip-danger" && "border-danger-500/40 bg-danger-100/40")}>
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              <Bug className="h-3.5 w-3.5" />
              {t("Disease pressure")}
            </p>
            <span className={cn("chip px-2 py-0.5 text-[0.62rem]", diseaseTone)}>
              {t(disease.label)}
            </span>
          </div>
          <p className="mt-1.5 text-[0.72rem] leading-snug">
            {t(agro.diseasePressure.advice)}
          </p>
          {agro.diseasePressure.leafWetnessHours > 0 ? (
            <p className="muted mt-1 text-[0.68rem] tabular-nums">
              {t("{hours} h leaf wetness in 72 h", {
                hours: agro.diseasePressure.leafWetnessHours,
              })}
            </p>
          ) : null}
        </div>
      </div>

      <footer className="muted mt-3 flex items-start gap-1.5 text-[0.68rem] leading-relaxed">
        <Sun className="mt-0.5 h-3 w-3 shrink-0" />
        {t(
          "Built from the 7-day forecast, ET₀ and leaf-wetness model. An estimate, not a field-sensor reading.",
        )}
      </footer>
    </section>
  );
}

function DayCell({ day, index }: { day: DayWorkPlan; index: number }) {
  const { t } = useI18n();
  const meta = DAY_VERDICT_META[day.verdict];
  const style = VERDICT_STYLE[day.verdict];

  return (
    <div
      role="listitem"
      title={`${t(day.summary)} — ${day.reasons.map((reason) => t(reason)).join(", ")}`}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center",
        style.shell,
      )}
    >
      <span className="text-[0.62rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        {t(weekday(day.date, index))}
      </span>
      <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden />
      <span className={cn("text-[0.66rem] font-bold", style.text)}>
        {t(meta.label)}
      </span>
      <span className="flex items-center gap-0.5 text-[0.6rem] tabular-nums text-[var(--color-ink-soft)]">
        <CloudRain className="h-2.5 w-2.5" />
        {day.rainChance}%
      </span>
      <span className="flex items-center gap-0.5 text-[0.6rem] tabular-nums text-[var(--color-ink-soft)]">
        <Thermometer className="h-2.5 w-2.5" />
        {Math.round(day.tempMax)}°
      </span>
      <span className="flex items-center gap-0.5 text-[0.6rem] tabular-nums text-[var(--color-ink-soft)]">
        <Wind className="h-2.5 w-2.5" />
        {Math.round(day.windMax)}
      </span>
      <span className="mt-0.5 line-clamp-1 w-full text-[0.56rem] font-medium leading-tight text-[var(--color-ink-soft)]">
        {day.bestWindow ? day.bestWindow.label : t("—")}
      </span>
    </div>
  );
}

function bestOperationDay(
  days: DayWorkPlan[],
  operation: FieldOperation,
): { day: DayWorkPlan; dayIndex: number; advice: { note: string } } | null {
  for (let index = 0; index < days.length; index += 1) {
    const advice = days[index].operations[operation];
    if (advice.suitable) {
      return { day: days[index], dayIndex: index, advice };
    }
  }
  return null;
}

export function WorkWindowsSkeleton() {
  return (
    <section className="card p-5">
      <div className="h-5 w-40 animate-pulse-soft rounded bg-paper-deep" />
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse-soft rounded-xl bg-paper-deep" />
        ))}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  CloudRain,
  Droplets,
  Flame,
  RotateCcw,
  ScanLine,
  Sparkles,
  SprayCan,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

import { useSessionFarmer } from "@/components/auth/session";
import { cn } from "@/lib/cn";
import type { CropDayGuide } from "@/lib/crop-guide";
import type { DailyPlan, DailyTask } from "@/lib/daily-tasks";
import {
  TASK_CATEGORY_META,
  TASK_PRIORITY_META,
  TASK_TIME_META,
} from "@/lib/daily-tasks";
import type { AgroAssessment, DayWorkPlan, WorkVerdict } from "@/lib/agro-advisory";
import { useDailyTasks } from "@/lib/hooks/use-daily-tasks";
import { useOdiaText } from "@/lib/hooks/use-odia-text";
import { useI18n } from "@/lib/i18n";
import type { PestRiskAssessment } from "@/lib/pest-risk";
import type { CropDTO } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const VERDICT_ICON: Record<WorkVerdict, string> = {
  good: "✅",
  caution: "⚠️",
  avoid: "⛔",
};

const VERDICT_TONE: Record<
  WorkVerdict,
  { shell: string; big: string; text: string }
> = {
  good: {
    shell: "border-leaf-300 bg-leaf-100/70",
    big: "bg-leaf-500",
    text: "text-leaf-700",
  },
  caution: {
    shell: "border-warn-500/40 bg-warn-100/70",
    big: "bg-warn-500",
    text: "text-warn-700",
  },
  avoid: {
    shell: "border-danger-500/40 bg-danger-100/60",
    big: "bg-danger-500",
    text: "text-danger-700",
  },
};

function weekday(iso: string, index: number): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return index === 0 ? "Today" : WEEKDAYS[date.getDay()];
}

/** Short, plain reason — big text first, numbers second. */
function oldAdvice(day: DayWorkPlan): string {
  return day.summary;
}

/**
 * The farmer's "what do I do today?" board.
 *
 * Designed to be read standing in a field: one big verdict, four picture
 * tiles, then a tap-to-tick checklist. Detail hides behind a single tap.
 */
export function TodayBoard({
  crop,
  guide,
  dailyPlan,
  agro,
  pest,
  soilPercent,
  rainToday,
  planLoading,
  onScan,
  onWeekly,
  generating,
}: {
  crop: CropDTO;
  guide: CropDayGuide;
  dailyPlan: DailyPlan | null;
  agro: AgroAssessment | null;
  pest: PestRiskAssessment | null;
  soilPercent: number | null;
  rainToday: number | null;
  planLoading: boolean;
  onScan?: () => void;
  onWeekly: () => void;
  generating: boolean;
}) {
  const { t } = useI18n();
  const farmer = useSessionFarmer();
  const state = useDailyTasks(dailyPlan, farmer?.id ?? null);
  const say = useOdiaText([
    ...(dailyPlan?.tasks ?? []).flatMap((task) => [task.title, task.detail, ...task.reasons]),
    ...(agro?.days ?? []).flatMap((day) => [day.summary, ...day.reasons]),
    ...(pest?.threats ?? []).map((threat) => threat.name),
  ]);

  const today = agro?.days[0] ?? null;
  const verdict = today?.verdict ?? null;
  const verdictLabel =
    verdict === "good"
      ? t("Good day to work")
      : verdict === "caution"
        ? t("Work with care")
        : verdict === "avoid"
          ? t("Better to wait today")
          : planLoading
            ? t("Reading the weather...")
            : t("No forecast yet");

  const waterText =
    rainToday !== null && rainToday >= 50
      ? t("Rain may water the field")
      : soilPercent === null
        ? t("No soil reading")
        : soilPercent < 18
          ? t("Soil is dry — water")
          : soilPercent < 28
            ? t("Water is fine today")
            : t("No watering needed");

  const pestText = pest
    ? pest.level === "low"
      ? t("No pest alert")
      : `${t("Watch {pest}", {
          pest: pest.threats[0]?.name ? say(pest.threats[0].name) : t("pests"),
        })}`
    : planLoading
      ? t("Checking pests...")
      : t("No pest report");

  const progress = state.progress;
  const tasks = dailyPlan?.tasks ?? [];

  return (
    <section
      className="card overflow-hidden"
      aria-label={t("Today for {crop}", { crop: t(crop.cropName) })}
    >
      {/* ---------------------------------------------------------------- */}
      {/* Identity + stage                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 pb-4 sm:p-6 sm:pb-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-leaf-100 text-[2.4rem] leading-none"
          >
            {guide.emoji}
          </span>
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight">
              {t(guide.cropName)}
              <span className="chip chip-brand">{t("Day {day}", { day: guide.ageDays })}</span>
            </h2>
            <p className="muted mt-1.5 break-words text-sm">
              {t(guide.stage.name)}
              <span aria-hidden> · </span>
              {guide.isHarvestWindow
                ? t("Harvest window")
                : t("{count} days to harvest", { count: guide.daysToHarvest })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/detect?cropId=${crop.id}`} className="btn btn-secondary" onClick={onScan}>
            <ScanLine aria-hidden className="h-4 w-4" />
            {t("Scan a leaf")}
          </Link>
          <button
            type="button"
            onClick={onWeekly}
            disabled={generating}
            className="btn btn-primary"
          >
            <Sparkles aria-hidden className="h-4 w-4" />
            {generating ? t("Writing...") : t("Weekly advisory")}
          </button>
        </div>
      </div>

      {/* Season bar with stage dots */}
      <SeasonBar guide={guide} />

      {/* ---------------------------------------------------------------- */}
      {/* One big verdict + four picture tiles                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-3 p-5 pt-4 sm:grid-cols-2 sm:p-6 sm:pt-4 lg:grid-cols-4">
        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl border p-3.5 lg:col-span-2",
            verdict ? VERDICT_TONE[verdict].shell : "border-[var(--color-line)] bg-[var(--card-muted)]",
          )}
        >
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--card)] text-[1.9rem] leading-none"
          >
            {verdict ? VERDICT_ICON[verdict] : "🌤️"}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-lg font-bold leading-tight",
                verdict ? VERDICT_TONE[verdict].text : "text-[var(--color-ink-soft)]",
              )}
            >
              {verdictLabel}
            </p>
            <p className="muted mt-1 text-xs leading-snug">
              {today ? say(oldAdvice(today)) : t("Weather service is not reachable right now.")}
            </p>
          </div>
        </div>

        <PictureTile
          emoji="💧"
          label={t("Watering")}
          value={waterText}
          tone={
            soilPercent === null ? "neutral" : soilPercent < 18 ? "warn" : "good"
          }
          footer={
            soilPercent !== null
              ? t("Topsoil {percent}%", { percent: soilPercent })
              : undefined
          }
        />
        <PictureTile
          emoji="🐛"
          label={t("Pest watch")}
          value={pestText}
          tone={
            !pest ? "neutral" : pest.level === "low" ? "good" : pest.level === "moderate" ? "warn" : "danger"
          }
          footer={t("Not a spray order")}
        />
      </div>

      {/* 7-day strip */}
      {agro ? (
        <WeekStrip days={agro.days} workableDays={agro.workableDays} say={say} />
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* The checklist — the actual "today's advice"                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-t border-[var(--color-line)] p-5 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="icon-tile">
              <Sun className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-semibold leading-tight">
                {t("Do these today")}
              </h3>
              <p className="muted text-xs">
                {t("Tap a job once it is done")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip chip-warn" title={t("Consecutive fully-completed days")}>
              <Flame className="h-3.5 w-3.5" />
              {state.streak}
            </span>
            <span className="chip chip-brand">
              <Sparkles className="h-3.5 w-3.5" />
              {t("{xp} XP", { xp: state.xpToday })}
            </span>
          </div>
        </header>

        <div className="mt-3 flex items-center gap-3">
          <ProgressBar percent={progress.percent} done={progress.done} total={progress.total} />
          <button
            type="button"
            onClick={state.resetToday}
            disabled={progress.done === 0}
            className="btn btn-ghost min-h-8 shrink-0 px-2 text-[0.7rem] disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            {t("Reset")}
          </button>
        </div>

        {planLoading && tasks.length === 0 ? (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse-soft rounded-2xl bg-paper-deep" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="muted mt-3 text-sm leading-relaxed">
            {t("No jobs today. Walk the field and check the crop once.")}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {tasks.map((task) => (
              <BigTaskTile
                key={task.id}
                task={task}
                done={state.isDone(task.id)}
                onToggle={() => state.toggle(task.id)}
                say={say}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- */

function SeasonBar({ guide }: { guide: CropDayGuide }) {
  const { t } = useI18n();
  return (
    <div className="px-5 sm:px-6">
      <div className="flex items-center gap-2 text-[0.6875rem] font-medium text-[var(--color-ink-soft)]">
        <span aria-hidden>🌱</span>
        <span className="tabular-nums">{guide.progress}%</span>
        <div
          className="relative ml-1 h-2 flex-1 overflow-hidden rounded-full bg-[var(--card-muted)]"
          role="progressbar"
          aria-label={t("Season progress")}
          aria-valuenow={guide.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="progress-fill h-full rounded-full bg-leaf-500"
            style={{ transform: `scaleX(${guide.progress / 100})` }}
            aria-hidden
          />
        </div>
        <span aria-hidden>🌾</span>
      </div>
    </div>
  );
}

function PictureTile({
  emoji,
  label,
  value,
  footer,
  tone,
}: {
  emoji: string;
  label: string;
  value: string;
  footer?: string;
  tone: "good" | "warn" | "danger" | "neutral";
}) {
  const shell =
    tone === "danger"
      ? "border-danger-500/40 bg-danger-100/50"
      : tone === "warn"
        ? "border-warn-500/40 bg-warn-100/50"
        : tone === "good"
          ? "border-leaf-300 bg-leaf-100/50"
          : "border-[var(--color-line)] bg-[var(--card-muted)]";

  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl border p-3.5", shell)}>
      <span aria-hidden className="text-[1.6rem] leading-none">
        {emoji}
      </span>
      <div className="min-w-0">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-semibold leading-snug">{value}</p>
        {footer ? <p className="muted mt-0.5 text-[0.68rem]">{footer}</p> : null}
      </div>
    </div>
  );
}

function WeekStrip({
  days,
  workableDays,
  say,
}: {
  days: DayWorkPlan[];
  workableDays: number;
  say: (text: string) => string;
}) {
  const { t } = useI18n();
  return (
    <div className="border-t border-[var(--color-line)] px-5 py-3 sm:px-6">
      <p className="mb-2 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        {t("This week")}
        <span className="chip chip-brand px-2 py-0.5 text-[0.6rem]">
          {t("{good} of {days} workable", { good: workableDays, days: days.length })}
        </span>
      </p>
      <div className="grid grid-cols-7 gap-1.5" role="list">
        {days.slice(0, 7).map((day, index) => {
          const style = VERDICT_TONE[day.verdict];
          return (
            <div
              key={day.date}
              role="listitem"
              title={`${say(day.summary)} · ${say(day.reasons[0] ?? "")}`}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-xl border py-1.5",
                style.shell,
              )}
            >
              <span className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
                {t(weekday(day.date, index))}
              </span>
              <span aria-hidden className="text-base leading-none">
                {VERDICT_ICON[day.verdict]}
              </span>
              <span className={cn("text-[0.58rem] font-semibold", style.text)}>
                {t(day.verdict === "good" ? "Go" : day.verdict === "caution" ? "Care" : "Wait")}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.62rem]">
        <span className="inline-flex items-center gap-0.5">
          <Thermometer className="h-3 w-3" />
          {days[0] ? `${Math.round(days[0].tempMin)}–${Math.round(days[0].tempMax)}°C` : "—"}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <CloudRain className="h-3 w-3" />
          {days[0] ? `${days[0].rainChance}%` : "—"}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Wind className="h-3 w-3" />
          {days[0] ? `${Math.round(days[0].windMax)} km/h` : "—"}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Droplets className="h-3 w-3" />
          {t("estimate from the 7-day forecast")}
        </span>
      </p>
    </div>
  );
}

function ProgressBar({
  percent,
  done,
  total,
}: {
  percent: number;
  done: number;
  total: number;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between text-[0.68rem] font-medium">
        <span className="muted">
          {t("{done} of {total} done", { done, total })}
        </span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--card-muted)]">
        <div
          className="progress-fill h-full rounded-full bg-leaf-500"
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
    </div>
  );
}

function BigTaskTile({
  task,
  done,
  onToggle,
  say,
}: {
  task: DailyTask;
  done: boolean;
  onToggle: () => void;
  say: (text: string) => string;
}) {
  const { t } = useI18n();
  const category = TASK_CATEGORY_META[task.category];

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-2xl border-2 p-3 transition-colors",
        done
          ? "border-leaf-300 bg-leaf-100/50"
          : task.priority === "critical"
            ? "border-danger-500/50 bg-danger-100/50"
            : "border-[var(--color-line)] bg-[var(--card)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={t("Mark {task} as done", { task: t(task.title) })}
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 transition-colors",
          done
            ? "border-leaf-600 bg-leaf-600 text-white"
            : "border-[var(--color-line-strong)] bg-[var(--card)] hover:border-leaf-500",
        )}
      >
        {done ? (
          <Check className="h-6 w-6" strokeWidth={3} />
        ) : (
          <span aria-hidden className="text-[1.5rem] leading-none">
            {task.emoji}
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-semibold leading-snug",
            done && "line-through opacity-60",
          )}
        >
          {t(task.title)}
        </p>
        <p
          className={cn(
            "muted mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[0.68rem]",
            done && "opacity-60",
          )}
        >
          <span className="font-medium">{t(TASK_TIME_META[task.when].label)}</span>
          <span aria-hidden>·</span>
          <span>{t(category.label)}</span>
          {task.priority === "critical" ? (
            <span className={cn("chip px-1.5 py-0.5 text-[0.55rem]", category.tone)}>
              {t(TASK_PRIORITY_META.critical.label)}
            </span>
          ) : null}
        </p>

        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-0.5 text-[0.66rem] font-semibold text-accent-700 [&::-webkit-details-marker]:hidden">
            {t("How and why")}
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
          </summary>
          <p className="muted mt-1 text-[0.7rem] leading-snug">{say(task.detail)}</p>
          {task.reasons.length > 0 ? (
            <p className="muted mt-1 text-[0.64rem] leading-snug">
              👉 {task.reasons.map((reason) => say(reason)).join(" · ")}
            </p>
          ) : null}
          {task.action ? (
            <Link
              href={task.action.href}
              className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-semibold text-accent-700 underline-offset-4 hover:underline"
            >
              {t(task.action.label)}
            </Link>
          ) : null}
        </details>
      </div>
    </li>
  );
}

/** Small pest-only pill reused by the weekly plan header. */
export function PestPill({ pest }: { pest: PestRiskAssessment | null }) {
  const { t } = useI18n();
  if (!pest) return null;
  return (
    <span
      className={cn(
        "chip",
        pest.level === "low"
          ? "chip-lime"
          : pest.level === "moderate"
            ? "chip-warn"
            : "chip-danger",
      )}
    >
      <SprayCan className="h-3 w-3" />
      {t(pest.level === "low" ? "No pest alert" : "Pest risk: {level}", {
        level: t(pest.level),
      })}
    </span>
  );
}

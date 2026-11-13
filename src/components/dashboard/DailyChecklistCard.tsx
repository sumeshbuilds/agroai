"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Flame,
  RotateCcw,
  ShoppingBasket,
  Sparkles,
  Sun,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useSessionFarmer } from "@/components/auth/session";
import type { DailyPlan, DailyTask } from "@/lib/daily-tasks";
import {
  TASK_CATEGORY_META,
  TASK_PRIORITY_META,
  TASK_TIME_META,
} from "@/lib/daily-tasks";
import { useDailyTasks } from "@/lib/hooks/use-daily-tasks";
import { useOdiaText } from "@/lib/hooks/use-odia-text";
import { useI18n } from "@/lib/i18n";
import type { ShoppingSuggestion } from "@/lib/recommendations";

export function DailyChecklistCard({
  plan,
  loading = false,
  shopping = [],
  onShop,
}: {
  plan: DailyPlan | null;
  loading?: boolean;
  shopping?: ShoppingSuggestion[];
  onShop?: () => void;
}) {
  const { t } = useI18n();
  const farmer = useSessionFarmer();
  const state = useDailyTasks(plan, farmer?.id ?? null);
  const say = useOdiaText(
    (plan?.tasks ?? []).flatMap((task) => [task.title, task.detail, ...task.reasons]),
  );

  if (loading) {
    return (
      <section className="card p-5" aria-label={t("Today's checklist")}>
        <div className="h-5 w-40 animate-pulse-soft rounded bg-paper-deep" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse-soft rounded-xl bg-paper-deep" />
          ))}
        </div>
      </section>
    );
  }

  if (!plan || plan.tasks.length === 0) {
    return (
      <section className="card p-5" aria-label={t("Today's checklist")}>
        <header className="flex items-center gap-2">
          <span className="icon-tile">
            <Check className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold">{t("Today's checklist")}</h2>
        </header>
        <p className="muted mt-3 text-sm leading-relaxed">
          {t(
            "Add a crop to this field and the daily checklist will build itself from the crop stage and the forecast.",
          )}
        </p>
      </section>
    );
  }

  const progress = state.progress;
  const urgent = plan.tasks.filter(
    (task) => task.priority === "critical" || task.priority === "high",
  ).length;

  return (
    <section className="card p-5" aria-label={t("Today's checklist")}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="icon-tile shrink-0">
            <Sun className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {t("Today's checklist")}
            </h2>
            <p className="muted mt-1 text-xs leading-relaxed">
              {plan.cropName
                ? t("{crop} · {stage}", {
                    crop: t(plan.cropName),
                    stage: plan.stage ? t(plan.stage) : t("field work"),
                  })
                : t("Field work")}
              {plan.dayOfCycle !== null
                ? ` · ${t("day {day}", { day: plan.dayOfCycle })}`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="chip chip-warn" title={t("Consecutive fully-completed days")}>
            <Flame className="h-3.5 w-3.5" />
            {t("{count}-day streak", { count: state.streak })}
          </span>
          <span className="chip chip-brand">
            <Sparkles className="h-3.5 w-3.5" />
            {t("{xp} XP", { xp: state.xpToday })}
          </span>
        </div>
      </header>

      <div className="mt-4 flex items-center gap-3">
        <ProgressRing percent={progress.percent} done={progress.done} total={progress.total} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            {urgent > 0
              ? t("{count} task(s) need attention today", { count: urgent })
              : t("A light day in the field")}
          </p>
          <p className="muted mt-0.5 text-[0.72rem] leading-snug">{plan.summary}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--card-muted)]">
            <div
              className="progress-fill h-full rounded-full bg-leaf-500"
              style={{ transform: `scaleX(${progress.percent / 100})` }}
            />
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {plan.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            done={state.isDone(task.id)}
            onToggle={() => state.toggle(task.id)}
            say={say}
          />
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-3">
        <p className="muted text-[0.68rem] leading-snug">
          {t("Saved on this device. Completing a task twice never adds XP twice.")}
        </p>
        <button
          type="button"
          onClick={state.resetToday}
          disabled={progress.done === 0}
          className="btn btn-ghost min-h-9 px-2.5 text-[0.7rem] disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
          {t("Reset today")}
        </button>
      </div>

      {shopping.length > 0 ? (
        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              <ShoppingBasket className="h-3.5 w-3.5" />
              {t("Useful for these tasks")}
            </p>
            {onShop ? (
              <button
                type="button"
                onClick={onShop}
                className="text-[0.7rem] font-semibold text-accent-700 underline-offset-4 hover:underline"
              >
                {t("See all")}
              </button>
            ) : null}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {shopping.slice(0, 2).map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="group flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] p-2 transition-colors hover:border-accent-300 hover:bg-[var(--card-muted)]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <ShoppingBasket className="h-5 w-5 text-[var(--color-ink-soft)]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.76rem] font-semibold">
                    {t(item.title)}
                  </span>
                  <span className="muted mt-0.5 block line-clamp-2 text-[0.66rem] leading-snug">
                    {t(item.reason)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-ink-soft)]" />
              </a>
            ))}
          </div>
          <p className="muted mt-2 text-[0.62rem] leading-relaxed">
            {t(
              "Search links open Amazon.in. Confirm the label, approved dose and safety interval before buying or spraying.",
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ProgressRing({
  percent,
  done,
  total,
}: {
  percent: number;
  done: number;
  total: number;
}) {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative h-14 w-14 shrink-0" aria-hidden>
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="var(--card-muted)" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          stroke="var(--color-leaf-500, #4d9a58)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[0.68rem] font-bold tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}

function TaskRow({
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
  const priority = TASK_PRIORITY_META[task.priority];

  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-2.5 py-2.5 transition-colors",
        done
          ? "border-[var(--color-line)] bg-[var(--card-muted)]/60"
          : task.priority === "critical"
            ? "border-danger-500/40 bg-danger-100/50"
            : "border-[var(--color-line)]",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={done}
        aria-label={t("Mark {task} as done", { task: t(task.title) })}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
          done
            ? "border-leaf-600 bg-leaf-600 text-white"
            : "border-[var(--color-line-strong)] bg-[var(--card)] hover:border-leaf-500",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span aria-hidden className="text-sm leading-none">
            {task.emoji}
          </span>
          <p
            className={cn(
              "min-w-0 text-[0.82rem] font-semibold leading-snug",
              done && "line-through opacity-60",
            )}
          >
            {t(task.title)}
          </p>
          {task.priority === "critical" ? (
            <span className={cn("chip px-1.5 py-0.5 text-[0.58rem]", category.tone)}>
              {t(priority.label)}
            </span>
          ) : null}
        </div>
        <p className={cn("muted mt-1 text-[0.72rem] leading-snug", done && "opacity-60")}>
          {say(task.detail)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.64rem] font-medium text-[var(--color-ink-soft)]">
          <span>{t(TASK_TIME_META[task.when].label)}</span>
          <span aria-hidden>·</span>
          <span>{t(category.label)}</span>
          {task.reasons[0] ? (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{say(task.reasons[0])}</span>
            </>
          ) : null}
        </p>
      </div>

      {task.action ? (
        <Link
          href={task.action.href}
          className="mt-0.5 inline-flex min-h-8 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-[0.68rem] font-semibold text-accent-700 hover:bg-accent-50"
        >
          {t(task.action.label)}
          <ChevronRight className="h-3 w-3" />
        </Link>
      ) : null}
    </li>
  );
}

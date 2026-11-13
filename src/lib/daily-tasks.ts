import { getCropDayGuide } from "./crop-guide";
import type { AgroAssessment } from "./agro-advisory";
import type { PestRiskAssessment } from "./pest-risk";
import type { SoilAnalysis } from "./soil";

/**
 * Daily field checklist.
 *
 * The list is assembled from four real inputs — the crop's stage guide, the
 * live forecast, the rule-based pest risk and the saved soil test. It never
 * invents an observation. Every task carries the reason it appeared, so the
 * farmer can judge whether it applies to their field.
 */

export type TaskCategory =
  | "water"
  | "nutrition"
  | "pest"
  | "field"
  | "harvest"
  | "monitor"
  | "soil"
  | "safety";

export type TaskPriority = "critical" | "high" | "normal" | "low";

export type TaskTime =
  | "sunrise"
  | "morning"
  | "midday"
  | "evening"
  | "anytime"
  | "before-rain";

export type TaskActionKind = "scan" | "watch" | "crops" | "map" | "shop";

export interface TaskAction {
  kind: TaskActionKind;
  label: string;
  href: string;
}

export interface DailyTask {
  id: string;
  title: string;
  detail: string;
  category: TaskCategory;
  priority: TaskPriority;
  when: TaskTime;
  emoji: string;
  /** Why this task is on today's list. */
  reasons: string[];
  action?: TaskAction;
  source: "crop-stage" | "weather" | "soil" | "pest" | "harvest";
}

export interface DailyPlan {
  date: string;
  cropId: number | null;
  cropName: string | null;
  stage: string | null;
  dayOfCycle: number | null;
  tasks: DailyTask[];
  summary: string;
  /** XP available if every task is completed today. */
  xpAvailable: number;
}

export const TASK_CATEGORY_META: Record<
  TaskCategory,
  { label: string; emoji: string; tone: string }
> = {
  water: { label: "Water", emoji: "💧", tone: "chip-info" },
  nutrition: { label: "Nutrition", emoji: "🧪", tone: "chip-warn" },
  pest: { label: "Pest watch", emoji: "🐛", tone: "chip-danger" },
  field: { label: "Field work", emoji: "🌱", tone: "chip-lime" },
  harvest: { label: "Harvest", emoji: "🌾", tone: "chip-brand" },
  monitor: { label: "Monitor", emoji: "🔎", tone: "chip-info" },
  soil: { label: "Soil", emoji: "🪱", tone: "chip-warn" },
  safety: { label: "Safety", emoji: "⚠️", tone: "chip-danger" },
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; rank: number; xp: number }
> = {
  critical: { label: "Do today", rank: 0, xp: 30 },
  high: { label: "Important", rank: 1, xp: 25 },
  normal: { label: "Routine", rank: 2, xp: 15 },
  low: { label: "Optional", rank: 3, xp: 10 },
};

export const TASK_TIME_META: Record<TaskTime, { label: string; rank: number }> = {
  sunrise: { label: "At sunrise", rank: 0 },
  morning: { label: "Morning", rank: 1 },
  "before-rain": { label: "Before rain", rank: 2 },
  midday: { label: "Midday", rank: 3 },
  evening: { label: "Evening", rank: 4 },
  anytime: { label: "Any time", rank: 5 },
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function normaliseTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function categorise(title: string): TaskCategory {
  const text = title.toLowerCase();
  if (/irrigat|water|flood|moisture|drain/.test(text)) return "water";
  if (/fertil|nitrogen|nutrient|compost|manure|potash|dose/.test(text)) return "nutrition";
  if (/pest|insect|borer|aphid|thrip|whitefly|scout|trap|worm/.test(text)) return "pest";
  if (/harvest|dry|thresh|store|maturity|grain/.test(text)) return "harvest";
  if (/spray|label|protective|safety|wind/.test(text)) return "safety";
  if (/weed|hoe|earth|soil|mulch|land/.test(text)) return "field";
  return "monitor";
}

function timeForCategory(category: TaskCategory): TaskTime {
  switch (category) {
    case "water":
      return "sunrise";
    case "nutrition":
      return "morning";
    case "pest":
      return "morning";
    case "harvest":
      return "morning";
    case "safety":
      return "morning";
    default:
      return "anytime";
  }
}

function task(
  input: Omit<DailyTask, "emoji"> & { emoji?: string },
): DailyTask {
  return {
    ...input,
    emoji: input.emoji ?? TASK_CATEGORY_META[input.category].emoji,
  };
}

export interface DailyPlanInput {
  crop?: {
    id: number;
    cropName: string;
    ageDays: number;
    durationDays?: number | null;
  } | null;
  agro: AgroAssessment | null;
  pest: PestRiskAssessment | null;
  soil: SoilAnalysis | null;
  /** ISO date for the plan; defaults to today (local). */
  date?: string;
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildDailyPlan(input: DailyPlanInput): DailyPlan {
  const date = input.date ?? localDateKey();
  const guide = input.crop
    ? getCropDayGuide(
        input.crop.cropName,
        input.crop.ageDays,
        input.crop.durationDays,
      )
    : null;
  const tasks: DailyTask[] = [];
  const seen = new Set<string>();

  const add = (next: DailyTask) => {
    const key = normaliseTitle(next.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    tasks.push(next);
  };

  if (guide) {
    guide.stage.tasks.forEach((title, index) => {
      const category = categorise(title);
      add(
        task({
          id: `stage-${index}-${slug(title)}`,
          title,
          detail: guide.stage.focus,
          category,
          priority: index === 0 ? "high" : "normal",
          when: timeForCategory(category),
          reasons: [`${input.crop!.cropName} · day ${guide.ageDays} · ${guide.stage.name}`],
          source: "crop-stage",
        }),
      );
    });
  }

  const days = input.agro?.days ?? [];
  const next2 = days.slice(0, 2);
  const heavyRain = next2.find(
    (day) => day.rainChance >= 60 || day.rainMm >= 8,
  );
  const hottest = days[0];

  if (heavyRain) {
    add(
      task({
        id: "weather-drainage",
        title: "Open field drains before the rain",
        detail: "Check low patches and clear channels so water does not stand around the roots.",
        category: "water",
        priority: "critical",
        when: "before-rain",
        reasons: [`${heavyRain.rainChance}% rain chance on ${heavyRain.date}`],
        source: "weather",
      }),
    );
    add(
      task({
        id: "weather-no-spray",
        title: "Do not spray before the rain",
        detail: "Rain will wash the spray off and waste money. Re-plan for the calm window after it passes.",
        category: "safety",
        priority: "high",
        when: "before-rain",
        reasons: ["Rain forecast within 48 hours"],
        source: "weather",
      }),
    );
  }

  const deficit = input.agro?.irrigation.deficitMm ?? 0;
  const surfaceMoisture =
    days[0]?.soilMoisture ?? null;
  if (deficit >= 12 || (surfaceMoisture !== null && surfaceMoisture < 0.16)) {
    add(
      task({
        id: "weather-irrigate",
        title: "Irrigate the driest block early",
        detail: input.agro?.irrigation.nextWindow
          ? `The best window is ${input.agro.irrigation.nextWindow}. Water the lightest soil first.`
          : "Water before 9 am so less is lost to evaporation.",
        category: "water",
        priority: deficit >= 25 ? "critical" : "high",
        when: "sunrise",
        reasons: [
          `7-day moisture deficit ≈ ${deficit} mm`,
          surfaceMoisture !== null
            ? `Surface soil moisture ${Math.round(surfaceMoisture * 100)}%`
            : "Low surface moisture",
        ],
        source: "weather",
      }),
    );
  }

  if (hottest && hottest.tempMax >= 36) {
    add(
      task({
        id: "weather-heat",
        title: "Protect the crop from the afternoon heat",
        detail: "Mulch exposed soil, irrigate before 10 am and avoid moving plants at midday.",
        category: "water",
        priority: hottest.tempMax >= 40 ? "high" : "normal",
        when: "morning",
        reasons: [`High of ${Math.round(hottest.tempMax)}°C`],
        source: "weather",
      }),
    );
  }

  const pressure = input.agro?.diseasePressure.level ?? "low";
  if (pressure !== "low") {
    add(
      task({
        id: "weather-disease-scout",
        title: "Scout the lower leaves for spots",
        detail:
          pressure === "high"
            ? "Long leaf-wetness periods favour fungal disease. Check 10 plants and photograph any lesion."
            : "Some humid hours are forecast. Check leaf undersides and remove badly affected leaves.",
        category: "pest",
        priority: pressure === "high" ? "high" : "normal",
        when: "morning",
        reasons: input.agro?.diseasePressure.reasons.length
          ? input.agro.diseasePressure.reasons
          : ["Humid canopy conditions"],
        action: { kind: "scan", label: "Scan a leaf", href: "/detect" },
        source: "weather",
      }),
    );
  }

  if (input.pest && (input.pest.level === "high" || input.pest.level === "critical")) {
    add(
      task({
        id: "pest-hotspot",
        title: `Inspect ${input.pest.threats[0]?.name.toLowerCase() ?? "pest"} hotspots today`,
        detail:
          input.pest.actions[0] ??
          "Walk a diagonal path and check the underside of leaves on 10 plants.",
        category: "pest",
        priority: "critical",
        when: "morning",
        reasons: [input.pest.factors[0] ?? `Pest risk is ${input.pest.level}`],
        action: { kind: "scan", label: "Scan and confirm", href: "/detect" },
        source: "pest",
      }),
    );
  }

  const sprayDay = days.find((day) => day.operations.spraying.suitable);
  if (
    sprayDay &&
    (pressure === "high" ||
      input.pest?.level === "high" ||
      input.pest?.level === "critical")
  ) {
    add(
      task({
        id: "spray-window",
        title: "Use the calm spray window",
        detail: `Wind and rain allow spraying ${sprayDay.bestWindow?.label ?? "in the morning"}. Follow the label dose and wear protective clothing.`,
        category: "safety",
        priority: "normal",
        when: "morning",
        reasons: [`Calm window on ${sprayDay.date}`],
        source: "weather",
      }),
    );
  }

  if (input.agro?.harvestWindow) {
    add(
      task({
        id: "harvest-check",
        title: "Check maturity and plan the harvest",
        detail:
          "Test grain or fruit maturity, arrange labour and prepare a clean drying floor before the weather turns.",
        category: "harvest",
        priority: "high",
        when: "morning",
        reasons: ["The crop is in its harvest window"],
        source: "harvest",
      }),
    );
  }

  if (input.soil?.source === "soil-health-card") {
    input.soil.issues.slice(0, 2).forEach((issue, index) => {
      add(
        task({
          id: `soil-${slug(issue.key)}-${index}`,
          title: issue.title,
          detail: issue.detail,
          category: "soil",
          priority: issue.severity === "warning" ? "normal" : "low",
          when: "anytime",
          reasons: [issue.action],
          source: "soil",
        }),
      );
    });
  }

  const sorted = tasks.sort(
    (a, b) =>
      TASK_PRIORITY_META[a.priority].rank - TASK_PRIORITY_META[b.priority].rank ||
      TASK_TIME_META[a.when].rank - TASK_TIME_META[b.when].rank,
  );

  const limited = sorted.slice(0, 9);
  const critical = limited.filter((entry) => entry.priority === "critical").length;

  return {
    date,
    cropId: input.crop?.id ?? null,
    cropName: input.crop?.cropName ?? null,
    stage: guide?.stage.name ?? null,
    dayOfCycle: guide?.ageDays ?? null,
    tasks: limited,
    summary:
      limited.length === 0
        ? "Nothing urgent today. Keep the routine scouting walk."
        : critical > 0
          ? `${critical} urgent task${critical === 1 ? "" : "s"} plus ${limited.length - critical} routine check${limited.length - critical === 1 ? "" : "s"}.`
          : `${limited.length} useful task${limited.length === 1 ? "" : "s"} for today.`,
    xpAvailable: limited.reduce(
      (sum, entry) => sum + TASK_PRIORITY_META[entry.priority].xp,
      0,
    ),
  };
}

/** Stable key for persisting a completed task. */
export function completionId(
  date: string,
  cropId: number | null,
  taskId: string,
): string {
  return `${date}:${cropId ?? "field"}:${taskId}`;
}

export function planCompletionIds(plan: DailyPlan): string[] {
  return plan.tasks.map((entry) =>
    completionId(plan.date, plan.cropId, entry.id),
  );
}

export function planProgress(
  plan: DailyPlan,
  completed: ReadonlySet<string> | string[],
): {
  done: number;
  total: number;
  percent: number;
  xpEarned: number;
} {
  const set = completed instanceof Set ? completed : new Set(completed);
  let done = 0;
  let xpEarned = 0;
  for (const entry of plan.tasks) {
    if (set.has(completionId(plan.date, plan.cropId, entry.id))) {
      done += 1;
      xpEarned += TASK_PRIORITY_META[entry.priority].xp;
    }
  }
  return {
    done,
    total: plan.tasks.length,
    percent: plan.tasks.length === 0 ? 0 : Math.round((done / plan.tasks.length) * 100),
    xpEarned,
  };
}

/** Consecutive days ending today or yesterday, from `YYYY-MM-DD` keys. */
export function computeStreak(
  completedDates: Iterable<string>,
  today = localDateKey(),
): number {
  const dates = new Set(completedDates);
  const cursor = new Date(`${today}T12:00:00`);
  if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (streak < 400) {
    const key = localDateKey(cursor);
    if (!dates.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Keeps the local completion map small without losing the current streak. */
export function pruneCompletions(
  entries: Record<string, true>,
  keepDays = 75,
): Record<string, true> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffKey = localDateKey(cutoff);
  const pruned: Record<string, true> = {};
  for (const key of Object.keys(entries)) {
    const date = key.slice(0, 10);
    if (date >= cutoffKey) pruned[key] = true;
  }
  return pruned;
}

export function todayKey(): string {
  return localDateKey();
}

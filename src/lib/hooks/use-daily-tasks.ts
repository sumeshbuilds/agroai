"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  completionId,
  computeStreak,
  planProgress,
  pruneCompletions,
  TASK_PRIORITY_META,
  type DailyPlan,
} from "@/lib/daily-tasks";

/**
 * Local, idempotent completion store for the daily checklist.
 *
 * Completions are keyed by `date:crop:task`, so a reload, a retry or a second
 * tab can never award XP twice. The data stays on the farmer's device — the
 * checklist works offline and a future server sync can replay the same keys.
 */

interface DayRecord {
  done: number;
  total: number;
  xp: number;
}

interface TaskStore {
  entries: Record<string, true>;
  days: Record<string, DayRecord>;
}

const STORAGE_PREFIX = "agroai.tasks.v1";

const EMPTY: TaskStore = { entries: {}, days: {} };

function storageKey(farmerId?: number | null): string {
  return `${STORAGE_PREFIX}:${farmerId ?? "guest"}`;
}

function readStore(key: string): TaskStore {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TaskStore>;
    if (!parsed || typeof parsed !== "object") return EMPTY;
    return {
      entries: parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {},
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
    };
  } catch {
    return EMPTY;
  }
}

function writeStore(key: string, store: TaskStore): void {
  if (typeof window === "undefined") return;
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 75);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    const days: Record<string, DayRecord> = {};
    for (const [date, record] of Object.entries(store.days)) {
      if (date >= cutoffKey) days[date] = record;
    }
    window.localStorage.setItem(
      key,
      JSON.stringify({
        entries: pruneCompletions(store.entries),
        days,
      }),
    );
  } catch {
    // Storage can be full or blocked; the in-memory state still works.
  }
}

export interface DailyTasksState {
  hydrated: boolean;
  completed: ReadonlySet<string>;
  isDone: (taskId: string) => boolean;
  toggle: (taskId: string) => void;
  resetToday: () => void;
  progress: { done: number; total: number; percent: number; xpEarned: number };
  xpToday: number;
  streak: number;
  totalXp: number;
}

export function useDailyTasks(
  plan: DailyPlan | null,
  farmerId?: number | null,
): DailyTasksState {
  const [store, setStore] = useState<TaskStore>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);
  const key = storageKey(farmerId);

  useEffect(() => {
    // Queued so hydration renders the empty state first and the stored
    // completions arrive in a callback (never a cascading synchronous render).
    const timer = window.setTimeout(() => {
      setStore(readStore(key));
      loadedKeyRef.current = key;
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (hydrated && loadedKeyRef.current === key) writeStore(key, store);
  }, [store, hydrated, key]);

  const completedSet = useMemo(
    () => new Set(Object.keys(store.entries)),
    [store.entries],
  );

  const planIds = useMemo(() => {
    if (!plan) return new Set<string>();
    return new Set(
      plan.tasks.map((task) => completionId(plan.date, plan.cropId, task.id)),
    );
  }, [plan]);

  const isDone = useCallback(
    (taskId: string) => {
      if (!plan) return false;
      return completedSet.has(completionId(plan.date, plan.cropId, taskId));
    },
    [completedSet, plan],
  );

  const toggle = useCallback(
    (taskId: string) => {
      if (!plan) return;
      const id = completionId(plan.date, plan.cropId, taskId);

      setStore((current) => {
        const entries = { ...current.entries };
        if (entries[id]) delete entries[id];
        else entries[id] = true;

        const nextCompleted = new Set(Object.keys(entries));
        const progress = planProgress(plan, nextCompleted);
        const days = {
          ...current.days,
          [plan.date]: {
            done: progress.done,
            total: progress.total,
            xp: progress.xpEarned,
          },
        };
        return { entries, days };
      });
    },
    [plan],
  );

  const resetToday = useCallback(() => {
    if (!plan) return;
    setStore((current) => {
      const entries = { ...current.entries };
      for (const id of planIds) delete entries[id];
      const days = { ...current.days };
      delete days[plan.date];
      return { entries, days };
    });
  }, [plan, planIds]);

  const progress = useMemo(
    () => planProgress(plan ?? { ...emptyPlan }, completedSet),
    [plan, completedSet],
  );

  const xpToday = useMemo(() => {
    if (!plan) return 0;
    let total = 0;
    for (const task of plan.tasks) {
      if (completedSet.has(completionId(plan.date, plan.cropId, task.id))) {
        total += TASK_PRIORITY_META[task.priority].xp;
      }
    }
    return total;
  }, [completedSet, plan]);

  const streak = useMemo(() => {
    const fullyCompleted = Object.entries(store.days)
      .filter(([, record]) => record.total > 0 && record.done >= record.total)
      .map(([date]) => date);
    return computeStreak(fullyCompleted);
  }, [store.days]);

  const totalXp = useMemo(
    () =>
      Object.values(store.days).reduce(
        (sum, record) => sum + (Number.isFinite(record.xp) ? record.xp : 0),
        0,
      ),
    [store.days],
  );

  return {
    hydrated,
    completed: completedSet,
    isDone,
    toggle,
    resetToday,
    progress,
    xpToday,
    streak,
    totalXp,
  };
}

const emptyPlan: DailyPlan = {
  date: "1970-01-01",
  cropId: null,
  cropName: null,
  stage: null,
  dayOfCycle: null,
  tasks: [],
  summary: "",
  xpAvailable: 0,
};

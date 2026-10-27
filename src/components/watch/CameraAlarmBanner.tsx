"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BellOff,
  BellRing,
  Check,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { ApiError, api } from "@/lib/api-client";
import {
  playAlarmTone,
  primeAlarmAudio,
  requestNotificationPermission,
  showCameraNotification,
} from "@/lib/alarm";
import type { CameraAlertDTO } from "@/lib/camera";
import { formatRelative } from "@/lib/format";
import { useClientValue } from "@/lib/hooks/use-client-value";

const ARMED_KEY = "agroai.camera.alarm.armed";
const NOTIFY_WINDOW_MS = 2 * 60 * 1000;

export function CameraAlarmBanner({
  intervalMs = 5_000,
  className = "",
}: {
  intervalMs?: number;
  className?: string;
}) {
  const [alerts, setAlerts] = useState<CameraAlertDTO[]>([]);
  const storedArmed = useClientValue(() => {
    try {
      const stored = window.localStorage.getItem(ARMED_KEY);
      return stored === null ? true : stored === "1";
    } catch {
      return true;
    }
  }, true);
  const [armedOverride, setArmedOverride] = useState<boolean | null>(null);
  const armed = armedOverride ?? storedArmed;
  const [signedOut, setSignedOut] = useState(false);
  const [dismissing, setDismissing] = useState<number | null>(null);

  const armedRef = useRef(armed);
  const seenRef = useRef<Set<number>>(new Set());
  const bootedRef = useRef(false);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  // Unlock audio on the first interaction so a later alarm can play.
  useEffect(() => {
    const unlock = () => {
      void primeAlarmAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const notify = useCallback((items: CameraAlertDTO[]) => {
    if (!armedRef.current || items.length === 0) return;

    const fresh = items.filter(
      (alert) =>
        !seenRef.current.has(alert.id) &&
        alert.createdAt !== null &&
        Date.now() - new Date(alert.createdAt).getTime() < NOTIFY_WINDOW_MS,
    );
    fresh.forEach((alert) => seenRef.current.add(alert.id));
    if (fresh.length === 0) return;

    const newest = fresh[0];
    playAlarmTone(newest.category);
    showCameraNotification({
      title:
        newest.category === "person"
          ? "Human on your field"
          : "Animal on your field",
      body: `${newest.message}${newest.confidence ? ` · ${Math.round(newest.confidence * 100)}% confidence` : ""}`,
      tag: `camera-alert-${newest.id}`,
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.listCameraAlerts();
      setAlerts(data.alerts);
      setSignedOut(false);

      // Do not fire a siren for alarms that were already sitting in the
      // database before this page was opened.
      if (bootedRef.current) notify(data.alerts);
      else data.alerts.forEach((alert) => seenRef.current.add(alert.id));
      bootedRef.current = true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setSignedOut(true);
      }
    }
  }, [notify]);

  useEffect(() => {
    if (signedOut) return;
    const kickoff = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, intervalMs);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [intervalMs, load, signedOut]);

  const toggleArmed = async () => {
    const next = !armed;
    setArmedOverride(next);
    armedRef.current = next;
    try {
      window.localStorage.setItem(ARMED_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }

    if (next) {
      await primeAlarmAudio();
      await requestNotificationPermission();
      playAlarmTone("person");
    }
  };

  const dismiss = async (id: number) => {
    setDismissing(id);
    const snapshot = alerts;
    setAlerts((current) => current.filter((alert) => alert.id !== id));
    try {
      await api.acknowledgeCameraAlert(id);
    } catch {
      setAlerts(snapshot);
    } finally {
      setDismissing(null);
    }
  };

  const dismissAll = async () => {
    const snapshot = alerts;
    setAlerts([]);
    try {
      await api.acknowledgeAllCameraAlerts();
    } catch {
      setAlerts(snapshot);
    }
  };

  if (signedOut) return null;

  if (alerts.length === 0) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-500/25 bg-brand-500/5 px-3 py-2 text-xs ${className}`}
      >
        <span className="flex items-center gap-2 font-semibold text-brand-800 dark:text-brand-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Human &amp; animal alarm armed
          <span className="hidden font-normal text-[var(--muted)] sm:inline">
            · confirmed tracks only
          </span>
        </span>

        <div className="flex items-center gap-1.5">
          <Link
            href="/watch"
            className="rounded-md px-2 py-1 font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Live watch
          </Link>
          <button
            type="button"
            onClick={() => void toggleArmed()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 font-semibold hover:bg-[var(--card-muted)]"
          >
            {armed ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            {armed ? "Sound on" : "Muted"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`animate-rise overflow-hidden rounded-xl border border-danger-500/50 bg-danger-500/10 ${className}`}
      aria-live="assertive"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-danger-500/25 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.08em] text-danger-700 dark:text-red-300">
          <BellRing className="h-4 w-4 animate-pulse" />
          Field alarm
          <span className="rounded-full bg-danger-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
            {alerts.length}
          </span>
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleArmed()}
            className="inline-flex items-center gap-1 rounded-md border border-danger-500/30 bg-white/40 px-2 py-1 text-[11px] font-semibold text-danger-800 hover:bg-white/60 dark:bg-white/5 dark:text-red-200 dark:hover:bg-white/10"
            title={armed ? "Mute the alarm siren" : "Enable the alarm siren"}
          >
            {armed ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            {armed ? "Siren on" : "Siren off"}
          </button>
          {alerts.length > 1 ? (
            <button
              type="button"
              onClick={() => void dismissAll()}
              className="inline-flex items-center gap-1 rounded-md border border-danger-500/30 px-2 py-1 text-[11px] font-semibold text-danger-800 hover:bg-white/40 dark:text-red-200 dark:hover:bg-white/10"
            >
              <Check className="h-3.5 w-3.5" />
              Dismiss all
            </button>
          ) : null}
        </div>
      </header>

      <ul className="divide-y divide-danger-500/15">
        {alerts.slice(0, 3).map((alert) => (
          <li key={alert.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-500/15 text-lg">
              {alert.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-bold text-danger-800 dark:text-red-200">
                {alert.message}
                {alert.verified ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-brand-600/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-brand-800 dark:text-brand-300"
                    title="Confirmed by Groq vision"
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    AI verified
                  </span>
                ) : null}
              </p>
              <p className="muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                <span className="font-semibold text-[var(--foreground)]">
                  {alert.category === "person" ? "Human" : "Animal"}
                </span>
                {alert.confidence ? (
                  <span className="tabular-nums">
                    {Math.round(alert.confidence * 100)}% confidence
                  </span>
                ) : null}
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span>{formatRelative(alert.createdAt)}</span>
                {alert.source === "groq" ? (
                  <>
                    <span aria-hidden className="opacity-40">
                      ·
                    </span>
                    <span>Groq vision</span>
                  </>
                ) : null}
              </p>
            </div>
            <Link
              href="/watch"
              className="hidden rounded-md px-2 py-1 text-[11px] font-bold text-danger-800 hover:bg-white/40 sm:inline dark:text-red-200 dark:hover:bg-white/10"
            >
              Open
            </Link>
            <button
              type="button"
              onClick={() => void dismiss(alert.id)}
              disabled={dismissing === alert.id}
              aria-label="Dismiss alarm"
              className="rounded-md p-1.5 text-danger-800 hover:bg-white/40 disabled:opacity-40 dark:text-red-200 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <p className="flex items-center gap-1.5 border-t border-danger-500/20 px-3 py-1.5 text-[10px] font-medium text-danger-800/80 dark:text-red-300/80">
        <ShieldAlert className="h-3 w-3 shrink-0" />
        Raised only for confirmed humans and animals. Other objects are ignored.
        {alerts.length > 3 ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <TriangleAlert className="h-3 w-3" />+{alerts.length - 3} more
          </span>
        ) : null}
        {!armed ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <BellOff className="h-3 w-3" />
            Siren muted
          </span>
        ) : null}
      </p>
    </section>
  );
}

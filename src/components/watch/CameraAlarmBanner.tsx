"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BellOff,
  BellRing,
  Check,
  PawPrint,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  UserRound,
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
import { cn } from "@/lib/cn";
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
        className={cn("alarm-banner flex flex-wrap items-center justify-between gap-3 px-4 py-2", className)}
      >
        <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-leaf-700">
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", armed ? "bg-leaf-600" : "bg-ink-soft")} />
          {armed ? "Human & animal alarm armed" : "Human & animal alarm muted"}
          <span className="hidden font-normal text-[var(--muted)] sm:inline">
            · confirmed tracks only
          </span>
        </span>

        <div className="flex items-center gap-1.5">
          <Link
            href="/watch"
            className="btn btn-ghost px-3 text-xs text-leaf-700"
          >
            Live watch
          </Link>
          <button
            type="button"
            onClick={() => void toggleArmed()}
            aria-pressed={armed}
            aria-label={armed ? "Sound on: mute alarm sound" : "Muted: enable alarm sound"}
            className="btn btn-secondary px-3 text-xs"
          >
            {armed ? (
              <Volume2 aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <VolumeX aria-hidden className="h-3.5 w-3.5" />
            )}
            {armed ? "Sound on" : "Muted"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn("alarm-banner overflow-hidden", className)}
      data-alerting="true"
      aria-live="assertive"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-danger-500/20 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-danger-700">
          <BellRing aria-hidden className="h-4 w-4" />
          Field alarm
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-danger-500 px-1.5 text-xs font-semibold tabular-nums text-white">
            {alerts.length}
          </span>
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Link href="/watch" className="btn btn-ghost px-3 text-xs text-danger-700">
            Live watch
          </Link>
          <button
            type="button"
            onClick={() => void toggleArmed()}
            aria-pressed={armed}
            className="btn btn-secondary gap-1.5 border-danger-500/25 px-3 text-xs text-danger-700"
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
              className="btn btn-ghost gap-1.5 px-3 text-xs text-danger-700"
            >
              <Check className="h-3.5 w-3.5" />
              Dismiss all
            </button>
          ) : null}
        </div>
      </header>

      <ul className="divide-y divide-danger-500/15">
        {alerts.slice(0, 3).map((alert) => (
          <li key={alert.id} className="flex items-start gap-3 px-4 py-4">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-500/10 text-danger-700">
              {alert.category === "person" ? <UserRound className="h-5 w-5" /> : <PawPrint className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-relaxed text-danger-700">
                {alert.message}
                {alert.verified ? (
                  <span
                    className="chip gap-1 bg-accent-50 text-accent-700"
                    title="Confirmed by Groq vision"
                  >
                    <Sparkles aria-hidden className="h-3 w-3" />
                    AI verified
                  </span>
                ) : null}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs leading-relaxed text-danger-700">
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
            <button
              type="button"
              onClick={() => void dismiss(alert.id)}
              disabled={dismissing === alert.id}
              aria-label={`Dismiss alarm: ${alert.message}`}
              className="icon-btn border-transparent bg-transparent text-danger-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3 border-t border-danger-500/20 px-4 py-3 text-xs leading-relaxed text-danger-700">
        <p className="flex min-w-0 flex-1 items-start gap-2">
          <ShieldAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Raised only for confirmed humans and animals. Other objects are ignored.</span>
        </p>
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
      </div>
    </section>
  );
}

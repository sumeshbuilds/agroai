"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Check,
  PawPrint,
  Radar,
  Sparkles,
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
  startAlarmSiren,
  stopAlarmSiren,
} from "@/lib/alarm";
import type { CameraAlertDTO } from "@/lib/camera";
import { formatRelative } from "@/lib/format";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useI18n } from "@/lib/i18n";

const ARMED_KEY = "agroai.camera.alarm.armed";
const NOTIFY_WINDOW_MS = 2 * 60 * 1000;
const VISIBLE_ALERTS = 3;

/**
 * Field alarm as floating popups. Nothing is added to the page layout: new
 * confirmed human/animal detections slide in as dismissible toasts while a
 * continuous high-pitched siren wails until every alarm is dismissed or muted.
 */
export function CameraAlarmBanner({ intervalMs = 5_000 }: { intervalMs?: number }) {
  const { t } = useI18n();
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

  // Unlock audio on the first interaction so the siren can play.
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
    showCameraNotification({
      title:
        newest.category === "person"
          ? t("Human on your field")
          : t("Animal on your field"),
      body: newest.confidence
        ? t("{message} · {confidence}% confidence", {
            message: t(newest.message),
            confidence: Math.round(newest.confidence * 100),
          })
        : t(newest.message),
      tag: `camera-alert-${newest.id}`,
    });
  }, [t]);

  const load = useCallback(async () => {
    try {
      const data = await api.listCameraAlerts();
      setAlerts(data.alerts);
      setSignedOut(false);

      // Do not fire a native notification for alarms that were already
      // sitting in the database before this page was opened.
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

  const sirenCategory: "person" | "animal" = alerts.some(
    (alert) => alert.category === "person",
  )
    ? "person"
    : "animal";

  // The siren keeps looping while any armed alarm is on screen.
  useEffect(() => {
    if (armed && alerts.length > 0) startAlarmSiren(sirenCategory);
    else stopAlarmSiren();
  }, [armed, alerts, sirenCategory]);

  useEffect(() => () => stopAlarmSiren(), []);

  const toggleArmed = async () => {
    const next = !armed;
    setArmedOverride(next);
    armedRef.current = next;

    if (!next) {
      stopAlarmSiren();
    } else if (alerts.length === 0) {
      playAlarmTone(sirenCategory);
    }

    try {
      window.localStorage.setItem(ARMED_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }

    if (next) {
      await primeAlarmAudio();
      await requestNotificationPermission();
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

  if (signedOut || alerts.length === 0) return null;

  const visible = alerts.slice(0, VISIBLE_ALERTS);
  const hidden = alerts.length - visible.length;

  return createPortal(
    <div
      role="region"
      aria-label={t("Field alarms")}
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(7.25rem+env(safe-area-inset-bottom))] z-[1100] flex flex-col items-end gap-2 md:inset-x-auto md:bottom-6 md:right-6"
    >
      {visible.map((alert) => (
        <article
          key={alert.id}
          className="alarm-toast pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-danger-500/25 bg-[var(--card)] pl-3 pr-2 py-3 shadow-[var(--shadow-floating)]"
        >
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1 bg-danger-500"
          />
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="alarm-toast-ring mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-500/10 text-danger-700"
            >
              {alert.category === "person" ? (
                <UserRound className="h-4.5 w-4.5" />
              ) : (
                <PawPrint className="h-4.5 w-4.5" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-danger-700">
                {t(alert.message)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[0.7rem] leading-relaxed text-[var(--muted)]">
                <span className="font-semibold text-[var(--foreground)]">
                  {alert.category === "person" ? t("Human") : t("Animal")}
                </span>
                {alert.confidence ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {Math.round(alert.confidence * 100)}%
                    </span>
                  </>
                ) : null}
                <span aria-hidden>·</span>
                <span>{t(formatRelative(alert.createdAt))}</span>
                {alert.verified ? (
                  <span className="chip chip-brand gap-1 px-1.5 py-0 text-[0.65rem]">
                    <Sparkles aria-hidden className="h-2.5 w-2.5" />
                    AI
                  </span>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void dismiss(alert.id)}
              disabled={dismissing === alert.id}
              aria-label={t("Dismiss alarm: {message}", { message: t(alert.message) })}
              className="icon-btn h-8 w-8 min-h-0 rounded-full border-transparent bg-transparent text-[var(--muted)] hover:text-danger-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </article>
      ))}

      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--card)] px-1.5 py-1.5 shadow-[var(--shadow-floating)]">
        <button
          type="button"
          onClick={() => void toggleArmed()}
          aria-pressed={armed}
          title={armed ? t("Mute the alarm siren") : t("Enable the alarm siren")}
          className="btn btn-secondary min-h-0 gap-1.5 rounded-full px-2.5 py-1.5 text-[0.7rem]"
        >
          {armed ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
          {armed ? t("Siren on") : t("Siren off")}
        </button>

        <Link
          href="/watch"
          title={t("Open live watch")}
          aria-label={t("Open live watch")}
          className="icon-btn h-8 w-8 min-h-0 rounded-full border-transparent bg-transparent text-[var(--muted)]"
        >
          <Radar className="h-4 w-4" />
        </Link>

        {alerts.length > 1 ? (
          <button
            type="button"
            onClick={() => void dismissAll()}
            title={t("Dismiss all alarms")}
            aria-label={t("Dismiss all alarms")}
            className="icon-btn h-8 w-8 min-h-0 rounded-full border-transparent bg-transparent text-[var(--muted)]"
          >
            <Check className="h-4 w-4" />
          </button>
        ) : null}

        {hidden > 0 ? (
          <span className="pr-1.5 text-[0.7rem] font-semibold tabular-nums text-[var(--muted)]">
            +{hidden}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

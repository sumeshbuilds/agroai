"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Bug,
  CloudRain,
  RefreshCw,
  ShieldAlert,
  Siren,
  Thermometer,
  Volume2,
  VolumeX,
  Wind,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { useSiren } from "@/lib/hooks/use-siren";
import { PEST_LEVEL_META, type PestRiskAssessment, type PestRiskLevel } from "@/lib/pest-risk";

const LEVEL_STYLES: Record<
  PestRiskLevel,
  { badge: string; bar: string; icon: string }
> = {
  low: {
    badge: "chip-lime",
    bar: "bg-meadow-500",
    icon: "bg-meadow-100 text-meadow-700",
  },
  moderate: {
    badge: "chip-warn",
    bar: "bg-mustard-500",
    icon: "bg-mustard-100 text-mustard-600",
  },
  high: {
    badge: "chip-danger",
    bar: "bg-danger-500",
    icon: "bg-danger-100 text-danger-700",
  },
  critical: {
    badge: "chip-danger",
    bar: "bg-danger-600",
    icon: "bg-danger-100 text-danger-700",
  },
};

export function PestSirenCard({
  cropId,
  farmName,
}: {
  cropId: number | null;
  farmName?: string | null;
}) {
  const { play, stop, isPlaying } = useSiren();
  const { permission, requestPermission, notify } = useNotifications();

  const [assessment, setAssessment] = useState<PestRiskAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundArmed, setSoundArmed] = useState(false);
  const lastAlerted = useRef<string | null>(null);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (cropId === null) return;
      if (!options?.silent) setLoading(true);
      setError(null);

      try {
        const result = await api.getPestRisk(cropId);
        setAssessment(result.assessment);
      } catch (cause) {
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Could not analyse pest risk right now.",
        );
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [cropId],
  );

  useEffect(() => {
    lastAlerted.current = null;
    void (async () => {
      await Promise.resolve();
      await load();
    })();

    const timer = window.setInterval(() => void load({ silent: true }), 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!assessment || !soundArmed) return;
    if (assessment.level !== "high" && assessment.level !== "critical") return;

    const key = `${assessment.level}-${assessment.analysedAt}`;
    if (lastAlerted.current === key) return;
    lastAlerted.current = key;

    play(5000);
    notify(
      `Pest siren · ${PEST_LEVEL_META[assessment.level].label}`,
      {
        body: `${assessment.crop.name} day ${assessment.crop.ageDays}: ${assessment.threats[0]?.name ?? "pest pressure"} risk is ${assessment.level}. Open AgroAI for the scout plan.`,
        tag: "agroai-pest-siren",
      },
    );
  }, [assessment, soundArmed, play, notify]);

  const toggleSound = async () => {
    if (soundArmed) {
      setSoundArmed(false);
      stop();
      return;
    }

    setSoundArmed(true);
    play(1800);
    if (permission === "default") {
      await requestPermission();
    }
  };

  if (cropId === null) {
    return (
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold leading-snug">Pest siren</h2>
        <p className="muted mt-2 text-sm leading-relaxed">
          Add a crop to your farm so the siren can analyse crop stage and weather.
        </p>
      </section>
    );
  }

  if (loading && !assessment) {
    return (
      <section role="status" className="card space-y-4 p-5 sm:p-6">
        <span className="sr-only">Loading pest analysis…</span>
        <div aria-hidden className="h-5 w-32 animate-pulse-soft rounded bg-paper-deep" />
        <div aria-hidden className="h-24 animate-pulse-soft rounded-xl bg-paper-deep" />
        <div aria-hidden className="h-16 animate-pulse-soft rounded-xl bg-paper-deep" />
      </section>
    );
  }

  if (!assessment) {
    return (
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug">
          <Siren aria-hidden className="h-5 w-5" />
          Pest siren
        </h2>
        <Callout tone="warn">{error ?? "No pest analysis available yet."}</Callout>
        <Button variant="secondary" onClick={() => void load()} loading={loading}>
          <RefreshCw className="h-4 w-4" />
          Analyse again
        </Button>
      </section>
    );
  }

  const meta = PEST_LEVEL_META[assessment.level];
  const styles = LEVEL_STYLES[assessment.level];
  const alerting = assessment.level === "high" || assessment.level === "critical";
  const score = Math.min(100, Math.max(0, assessment.score));
  const analysedAt = new Date(assessment.analysedAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      className="card overflow-hidden"
      aria-live="polite"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] p-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              styles.icon,
            )}
          >
            <Siren aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">Pest siren</h2>
            <p className="muted mt-1 text-xs leading-relaxed">
              Crop stage + live weather
              {farmName ? ` · ${farmName}` : ""} · checked {analysedAt}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("chip", styles.badge)}>
            <ShieldAlert className="h-3.5 w-3.5" />
            {meta.label} · {assessment.score}/100
          </span>
          <Button variant="ghost" onClick={() => void load()} loading={loading} className="px-3">
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh pest analysis</span>
          </Button>
        </div>
      </header>

      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold">
              {assessment.crop.name} · day {assessment.crop.ageDays} · {assessment.crop.stage}
            </span>
            <span className="muted tabular-nums">{assessment.score}/100</span>
          </div>
          <div
            role="meter"
            aria-label="Pest risk score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={score}
            aria-valuetext={`${meta.label}, ${score} out of 100`}
            className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep"
          >
            <div
              className={cn("h-full w-full origin-left rounded-full", styles.bar)}
              style={{ transform: `scaleX(${score / 100})` }}
            />
          </div>
          <p className="muted mt-3 text-sm leading-relaxed">{assessment.summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={alerting && !soundArmed ? "danger" : "secondary"}
            onClick={() => void toggleSound()}
            aria-pressed={soundArmed}
          >
            {soundArmed ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {soundArmed
              ? isPlaying
                ? "Stop siren"
                : "Siren armed — tap to mute"
              : "Arm siren sound"}
          </Button>
          {permission === "default" ? (
            <Button variant="ghost" onClick={() => void requestPermission()}>
              Enable notifications
            </Button>
          ) : null}
        </div>

        <div className="grid gap-5 border-t border-[var(--border)] pt-5 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">
              Threats to scout
            </h3>
            <ul className="mt-3 space-y-3">
              {assessment.threats.map((threat) => (
                <li key={threat.name} className="text-sm">
                  <p className="font-semibold">
                    {threat.name}
                  </p>
                  <p className="muted mt-1 text-xs leading-relaxed">{threat.reason}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">
              Why this score
            </h3>
            {assessment.factors.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {assessment.factors.map((factor) => (
                  <li key={factor} className="flex items-start gap-1.5 text-xs">
                    <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-600" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted mt-3 text-xs leading-relaxed">No strong weather drivers right now.</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold">
            Scout plan
          </h3>
          <ul className="mt-3 space-y-2">
            {assessment.actions.map((action) => (
              <li key={action} className="flex items-start gap-2 text-sm">
                <Bug className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-1.5 border-t border-[var(--border)] pt-3 text-xs sm:grid-cols-4">
          <Stat
            icon={<CloudRain className="h-3.5 w-3.5" />}
            label="Rain 3d"
            value={`${assessment.weather.rainChance3d}%`}
          />
          <Stat
            icon={<CloudRain className="h-3.5 w-3.5" />}
            label="Rain total"
            value={`${assessment.weather.rainMm3d} mm`}
          />
          <Stat
            icon={<Thermometer className="h-3.5 w-3.5" />}
            label="Avg temp"
            value={`${assessment.weather.avgTempC}°C`}
          />
          <Stat
            icon={<Wind className="h-3.5 w-3.5" />}
            label="Max wind"
            value={`${assessment.weather.windKmh} km/h`}
          />
        </div>

        <p className="muted text-xs leading-relaxed">
          Rule-based analysis from your crop day and Open-Meteo. It is a scouting prompt, not a
          chemical prescription — confirm locally before spraying.
        </p>

        {error ? <Callout tone="warn">{error}</Callout> : null}
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="text-[var(--muted)]">{icon}</span>
      <span className="min-w-0">
        <span className="muted block font-medium">
          {label}
        </span>
        <span className="block font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Minus,
  RefreshCw,
  Satellite,
  ShieldCheck,
} from "lucide-react";

import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { SatelliteResponse } from "@/lib/farm-plan";
import { useI18n } from "@/lib/i18n";
import { TREND_META, type SatelliteObservation } from "@/lib/satellite";

export function SatelliteCard({ farmId }: { farmId: number | null }) {
  const { t } = useI18n();
  const [state, setState] = useState<SatelliteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!farmId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await api.getSatellite(farmId, { signal });
        setState(response);
      } catch {
        if (!signal?.aborted) {
          setError("Could not read the satellite check right now.");
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [farmId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const kickoff = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(kickoff);
      controller.abort();
    };
  }, [load]);

  const observation = state?.observation ?? null;
  const unavailable = state?.unavailable ?? null;
  const configured = state?.configured ?? true;

  return (
    <section className="card p-5" aria-label={t("Satellite field check")}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="icon-tile shrink-0">
            <Satellite className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {t("Satellite field check")}
            </h2>
            <p className="muted mt-1 text-xs leading-relaxed">
              {t("Sentinel-2 canopy greenness, cloud-masked.")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !farmId}
          aria-label={t("Refresh satellite check")}
          className="icon-btn h-9 w-9 border-[var(--color-line)]"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </header>

      {loading && !state ? (
        <div className="mt-4 space-y-2">
          <div className="h-16 animate-pulse-soft rounded-xl bg-paper-deep" />
          <div className="h-4 w-3/4 animate-pulse-soft rounded bg-paper-deep" />
          <div className="h-4 w-1/2 animate-pulse-soft rounded bg-paper-deep" />
        </div>
      ) : error ? (
        <p className="muted mt-3 text-sm leading-relaxed">{t(error)}</p>
      ) : observation ? (
        <ObservationView observation={observation} />
      ) : (
        <div className="mt-3">
          <div className="flex items-start gap-2 rounded-xl bg-info-100/60 px-3 py-2.5 text-info-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-[0.78rem] font-semibold">
                {configured
                  ? t("No usable recent observation")
                  : t("Sentinel-2 is not connected yet")}
              </p>
              <p className="mt-0.5 text-[0.72rem] leading-snug">
                {unavailable?.message
                  ? t(unavailable.message)
                  : t(
                      "The next cloud-free scene will appear here automatically. This is not a field-health score.",
                    )}
              </p>
            </div>
          </div>
          <ul className="muted mt-3 space-y-1 text-[0.68rem] leading-relaxed">
            <li>· {t("10 m pixels; a plot below 1 acre is too small for a reliable reading.")}</li>
            <li>· {t("Monsoon cloud cover can leave gaps of one to three weeks.")}</li>
            <li>· {t("NDVI reads canopy greenness, not pests, ownership or yield.")}</li>
          </ul>
        </div>
      )}
    </section>
  );
}

function ObservationView({
  observation,
}: {
  observation: SatelliteObservation;
}) {
  const { t } = useI18n();
  const meta = TREND_META[observation.trend];
  const ToneIcon =
    observation.trend === "rising"
      ? ArrowUpRight
      : observation.trend === "falling"
        ? ArrowDownRight
        : Minus;
  const tone =
    meta.tone === "leaf"
      ? "chip-lime"
      : meta.tone === "danger"
        ? "chip-danger"
        : "chip-info";

  return (
    <>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold leading-none tabular-nums">
              {observation.ndvi.toFixed(2)}
            </span>
            <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              NDVI
            </span>
          </p>
          <p className="muted mt-1 text-[0.7rem] tabular-nums">
            {t("Observed {date}", { date: observation.observedAt })} ·{" "}
            {t("{pct}% usable pixels", { pct: observation.validPixelPct })}
          </p>
        </div>
        <span className={cn("chip", tone)}>
          <ToneIcon className="h-3.5 w-3.5" />
          {t(meta.label)}
        </span>
      </div>

      <div className="mt-4">
        <div
          className="relative h-2.5 overflow-hidden rounded-full"
          style={{
            backgroundImage:
              "linear-gradient(90deg, #c98b5e 0%, #d8c96a 50%, #4f8a47 100%)",
          }}
        >
          <span
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--color-ink)] shadow"
            style={{
              left: `${Math.min(98, Math.max(2, observation.ndvi * 100))}%`,
            }}
          />
        </div>
        <div className="muted mt-1 flex justify-between text-[0.6rem] tabular-nums">
          <span>0 · {t("bare")}</span>
          <span>0.5</span>
          <span>1 · {t("dense")}</span>
        </div>
      </div>

      <p className="mt-3 text-[0.78rem] leading-relaxed">
        {t(observation.interpretation)}
      </p>

      {observation.previous ? (
        <p className="muted mt-1.5 text-[0.68rem] tabular-nums">
          {t("Previous usable scene {date}: NDVI {value}", {
            date: observation.previous.date,
            value: observation.previous.ndvi.toFixed(2),
          })}
        </p>
      ) : null}

      <details className="mt-3 rounded-xl bg-[var(--card-muted)]/60 px-3 py-2">
        <summary className="cursor-pointer text-[0.7rem] font-semibold text-[var(--color-ink-soft)]">
          {t("What this can and cannot tell you")}
        </summary>
        <ul className="mt-1.5 space-y-1 text-[0.66rem] leading-relaxed text-[var(--color-ink-soft)]">
          {observation.caveats.map((caveat) => (
            <li key={caveat}>· {t(caveat)}</li>
          ))}
        </ul>
      </details>

      <p className="muted mt-2 flex items-center gap-1.5 text-[0.64rem]">
        <ShieldCheck className="h-3 w-3" />
        {t("Sentinel-2 L2A · checks are cached for one hour")}
        {observation.areaAcres !== null
          ? ` · ${observation.areaAcres} ${t("acres")}`
          : ""}
      </p>
    </>
  );
}

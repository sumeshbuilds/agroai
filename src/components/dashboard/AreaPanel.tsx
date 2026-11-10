"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  Droplets,
  Sparkles,
  Sprout,
  Star,
  Video,
  Webcam,
  Wind,
  X,
} from "lucide-react";

import type { CameraSessionDTO } from "@/lib/camera";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
import type { CropDTO, FarmDTO, WeeklyReportDTO } from "@/lib/types";
import type { WeatherSnapshot } from "@/lib/weather";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type TFn = (text: string, vars?: Record<string, string | number>) => string;

/** "24 Aug 25" — compact stamp like the reference's field card. */
function dateStamp(iso: string | null, t: TFn): string {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return "—";
  const yy = String(date.getFullYear()).slice(-2);
  return `${date.getDate()} ${t(MONTHS[date.getMonth()])} ${yy}`;
}

/** Adds the crop's expected duration (days) to the sowing date. */
function harvestDateFrom(crop: CropDTO | null): string | null {
  if (!crop?.durationDays) return null;
  const start = new Date(`${crop.sowingDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  start.setDate(start.getDate() + crop.durationDays);
  return start.toISOString().slice(0, 10);
}

export function AreaPanel({
  index,
  farm,
  crops,
  weather,
  weatherLoading,
  cameras,
  report,
  generating,
  generationError,
  onGenerate,
  onClose,
  className,
}: {
  index: number;
  farm: FarmDTO;
  crops: CropDTO[];
  weather: WeatherSnapshot | null;
  weatherLoading: boolean;
  cameras: CameraSessionDTO[];
  report: WeeklyReportDTO | null;
  generating: boolean;
  generationError?: string | null;
  onGenerate: () => void;
  onClose: () => void;
  className?: string;
}) {
  const [sensorOpen, setSensorOpen] = useState(true);
  const [camerasOpen, setCamerasOpen] = useState(false);
  const { t } = useI18n();

  const crop = crops.find((item) => item.isActive) ?? crops[0] ?? null;
  const progress =
    crop?.durationDays && crop.durationDays > 0
      ? Math.max(0, Math.min(100, Math.round((crop.ageDays / crop.durationDays) * 100)))
      : null;

  const insight = report?.aiActionPlan
    ? report.aiActionPlan
        .replace(/(^|\n)#{1,6}\s+/g, "$1")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 240)
    : null;

  return (
    <section
      aria-label={t("Field details for {name}", { name: farm.name })}
      className={cn("map-panel flex min-h-0 w-full flex-col overflow-hidden", className)}
    >
      {/* Header */}
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold leading-snug">
            <span className="truncate">
              {t("Area {index} : {name}", {
                index: index + 1,
                name: crop ? t(crop.cropName) : farm.name,
              })}
            </span>
            {progress !== null && progress >= 70 ? (
              <Star className="h-3.5 w-3.5 shrink-0 fill-warn-500 text-warn-500" aria-label={t("Late growth stage")} />
            ) : null}
          </h2>
          <p className="muted mt-1 text-xs tabular-nums">
            #F-{String(farm.id).padStart(4, "0")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Hide field details")}
          className="icon-btn -mr-2 -mt-2 border-transparent bg-transparent text-ink-soft"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        {/* Dates + growth */}
        <div className="detail-section pb-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="muted text-xs font-medium">
                {t("Planting date")}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {crop ? dateStamp(crop.sowingDate, t) : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="muted text-xs font-medium">
                {t("Harvest date")}
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {dateStamp(harvestDateFrom(crop), t)}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="muted text-xs font-medium">{t("Growth stage")}</p>
              <p className="text-xs font-semibold">
                {crop?.growthStage ? t(crop.growthStage) : crop ? t("Seedling") : "—"}
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--card-muted)]"
              role="progressbar"
              aria-valuenow={progress ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("Crop growth progress")}
            >
              <div
                className="progress-fill h-full rounded-full bg-leaf-500"
                style={{ transform: `scaleX(${(progress ?? 0) / 100})` }}
                aria-hidden
              />
            </div>
            {crop ? (
              <p className="muted mt-2 text-[0.6875rem] tabular-nums">
                {crop.durationDays
                  ? t("Day {day} of {total} · from sowing date", {
                      day: crop.ageDays,
                      total: crop.durationDays,
                    })
                  : t("Day {day}", { day: crop.ageDays })}
              </p>
            ) : (
              <p className="muted mt-2 text-xs">{t("No crop recorded on this field")}</p>
            )}
          </div>
        </div>

        {/* Sensor read */}
        <div className="detail-section">
          <button
            type="button"
            onClick={() => setSensorOpen((open) => !open)}
            aria-expanded={sensorOpen}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-semibold">{t("Sensor read")}</span>
            {sensorOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
            )}
          </button>
          {sensorOpen ? (
            <div className="space-y-1 pb-1">
              {weather ? (
                <>
                  <SensorRow
                    icon={<Droplets className="h-3 w-3" />}
                    label={t("Humidity")}
                    value={
                      weather.current.humidity === null
                        ? "—"
                        : `${Math.round(weather.current.humidity)}%`
                    }
                  />
                  <SensorRow
                    icon={<Cloud className="h-3 w-3" />}
                    label={t("Temperature")}
                    value={
                      weather.current.temperature === null
                        ? "—"
                        : `${Math.round(weather.current.temperature)}°C`
                    }
                  />
                  <SensorRow
                    icon={<Droplets className="h-3 w-3" />}
                    label={t("Soil moisture")}
                    value={
                      weather.current.soilMoisture === null
                        ? "—"
                        : `${Math.round(weather.current.soilMoisture * 100)}%`
                    }
                    hint={t("model estimate")}
                  />
                  <SensorRow
                    icon={<Wind className="h-3 w-3" />}
                    label={t("Wind")}
                    value={
                      weather.current.windSpeed === null
                        ? "—"
                        : `${Math.round(weather.current.windSpeed)} ${t("km/h")}`
                    }
                  />
                </>
              ) : (
                <p className="muted pb-1.5 pt-1 text-xs leading-relaxed">
                  {weatherLoading
                    ? t("Reading the live sensor weather…")
                    : t("Live weather unavailable — checking the field's coordinates.")}
                </p>
              )}
              {weather ? (
                <p className="muted pb-1 pt-2 text-[0.6875rem] leading-relaxed">
                  {t("Open-Meteo nowcast at the field centre · soil value is a model estimate, not a probe reading")}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Cameras on this field */}
        <div className="detail-section">
          <button
            type="button"
            onClick={() => setCamerasOpen((open) => !open)}
            aria-expanded={camerasOpen}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-sm font-semibold">
              {t("Camera log {count}", { count: cameras.length })}
            </span>
            {camerasOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--color-ink-soft)]" />
            )}
          </button>
          {camerasOpen ? (
            <div className="pb-2">
              {cameras.length === 0 ? (
                <div className="px-1 pb-1">
                  <p className="muted flex items-start gap-1.5 text-xs leading-relaxed">
                    <Webcam aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                    {t("No camera linked to this field yet.")}
                  </p>
                  <Link href="/watch" className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-accent-700 underline-offset-4 hover:underline">
                    {t("Pair a phone")}
                  </Link>
                </div>
              ) : (
                <ul className="space-y-1">
                  {cameras.map((camera) => (
                    <li
                      key={camera.id}
                      className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          camera.isLive ? "bg-leaf-500 ping-slow" : "bg-[var(--card-muted)] ring-1 ring-[var(--color-line-strong)]",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate text-[0.78rem] font-medium">
                        {camera.name}
                      </span>
                      <span className="muted shrink-0 text-[0.66rem] tabular-nums">
                        {t("{count} tracks", { count: camera.totalDetections })}
                      </span>
                      <Link
                        href="/watch"
                        className="icon-btn shrink-0 border-transparent bg-transparent text-ink-soft"
                        aria-label={t("Open {name} in live watch", { name: camera.name })}
                      >
                        <Video className="h-3.5 w-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {/* AI insights */}
        <div className="insight-panel mt-4 rounded-xl bg-[var(--color-rail)] p-4 text-[var(--card)]">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-leaf-100">
              <span className="rounded bg-accent-500 px-1.5 py-0.5 text-white">
                AI
              </span>
              {t("Insights")}
            </span>
            {generating ? (
              <Sprout className="h-3.5 w-3.5 animate-pulse-soft text-accent-300" />
            ) : null}
          </div>
          {generationError ? (
            <p role="alert" className="mt-3 text-xs leading-relaxed text-danger-100">
              {t("{error} Try generating the advisory again.", { error: generationError })}
            </p>
          ) : null}
          {generating ? (
            <p className="mt-1.5 text-[0.72rem] text-[#f5f4ef]/60">
              {t("Reading the crop stage and forecast…")}
            </p>
          ) : insight ? (
            <>
              <p className="mt-3 text-[0.8125rem] leading-relaxed line-clamp-4">
                {insight}
              </p>
              <Link
                href="/crops"
                className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-accent-300 underline-offset-4 hover:text-accent-100 hover:underline"
              >
                {t("Open the full action plan")}
                <Sparkles className="h-3 w-3" />
              </Link>
            </>
          ) : (
            <>
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-leaf-100">
                {t("Add this week's advisory: the crop stage, the 7-day forecast and the soil estimate become a short action plan for the field.")}
              </p>
              <button
                type="button"
                onClick={onGenerate}
                disabled={generating || !crop}
                className="btn btn-secondary mt-4 w-full text-xs disabled:opacity-60"
              >
                <Sparkles className="h-3 w-3" />
                {crop ? t("Generate advisory") : t("Add a crop first")}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SensorRow({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.8125rem] text-ink-soft">
        <span className="text-[var(--color-ink-soft)]">{icon}</span>
        {label}
        {hint ? (
          <span className="rounded-full bg-[var(--card-muted)] px-1.5 py-0.5 text-[0.625rem] font-medium">
            {hint}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

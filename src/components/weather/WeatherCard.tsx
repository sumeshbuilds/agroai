"use client";

import type { ReactNode } from "react";
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
import type { DailyForecast, WeatherSnapshot, WeatherWarning } from "@/lib/weather";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function dateParts(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function weekdayLabel(iso: string, index: number) {
  if (index === 0) return "Today";
  const { year, month, day } = dateParts(iso);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function shortDate(iso: string, monthLabel: (month: string) => string) {
  const { month, day } = dateParts(iso);
  return `${day} ${monthLabel(MONTHS[month - 1])}`;
}

function weatherIconFor(day: DailyForecast) {
  if (day.tempMin <= 2) return Snowflake;
  if (day.precipitationProbability >= 60 || day.precipitationSum >= 8)
    return CloudLightning;
  if (day.precipitationProbability >= 30) return CloudRain;
  if (day.tempMax >= 36) return Sun;
  if (day.precipitationProbability >= 15) return CloudSun;
  return Cloud;
}

const warningTone: Record<WeatherWarning["level"], string> = {
  info: "chip-info",
  warning: "chip-warn",
  danger: "chip-danger",
};

/** Formats the nowcast fetch time (ISO, UTC) into a local clock label. */
function formatFetchedAt(iso: string): string | null {
  const fetched = new Date(iso);
  if (Number.isNaN(fetched.getTime())) return null;
  return fetched.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WeatherCard({
  weather,
  warnings,
  farmName,
  loading,
}: {
  weather: WeatherSnapshot | null;
  warnings: WeatherWarning[];
  farmName?: string | null;
  loading?: boolean;
}) {
  const { t } = useI18n();
  // Derived during render: `fetchedAt` only exists once the API responds (the
  // card renders client-side after the fetch resolves), so there is no SSR
  // hydration mismatch.
  const updatedAt = weather?.fetchedAt
    ? formatFetchedAt(weather.fetchedAt)
    : null;

  if (loading || !weather) {
    return <WeatherCardSkeleton />;
  }

  const days = weather.daily.slice(0, 7);
  const globalMin = days.length ? Math.min(...days.map((day) => day.tempMin)) : 0;
  const globalMax = days.length ? Math.max(...days.map((day) => day.tempMax)) : 0;
  const spread = Math.max(1, globalMax - globalMin);

  const currentTemp =
    weather.current.temperature ?? (days[0]?.tempMax ?? null);
  const rainNow = weather.current.precipitation;
  const windNow = weather.current.windSpeed;

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-5 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold">{t("Sky over your field")}</h2>
          <p className="muted mt-1 text-xs leading-relaxed">
            {farmName ? `${farmName} · ` : ""}
            <span className="tabular-nums">
              {weather.latitude.toFixed(3)}, {weather.longitude.toFixed(3)}
            </span>{" "}
            · {weather.timezone}
          </p>
        </div>
        <span
          className="chip chip-brand tabular-nums"
          title={t(
            "Open-Meteo nowcast — conditions refresh every 15 minutes; soil moisture is a model estimate.",
          )}
        >
          <Sun className="h-3.5 w-3.5" />
          {updatedAt
            ? t("Live · {time}", { time: updatedAt })
            : t("Live nowcast")}
        </span>
      </header>

      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl bg-leaf-100 p-4 sm:col-span-2 xl:col-span-1">
          <Thermometer aria-hidden className="h-7 w-7 shrink-0 text-leaf-700" strokeWidth={1.8} />
          <div>
            <p className="text-4xl font-semibold leading-none tabular-nums tracking-tight">
              {currentTemp === null ? "--" : `${Math.round(currentTemp)}°`}
            </p>
            <p className="muted mt-2 text-xs">
              {t("Now")} ·{" "}
              {days[0]?.date ? shortDate(days[0].date, (month) => t(month)) : ""}
            </p>
          </div>
        </div>

        <Stat
          icon={<Droplets className="h-5 w-5 text-sky-500" />}
          label={t("Rain now")}
          value={
            rainNow === null
              ? "--"
              : `${rainNow.toFixed(1)} ${t("mm")}`
          }
          hint={t("today {chance}% · {mm} mm", {
            chance: days[0]?.precipitationProbability ?? 0,
            mm: (days[0]?.precipitationSum ?? 0).toFixed(1),
          })}
        />
        <Stat
          icon={<Wind className="h-5 w-5 text-sky-600" />}
          label={t("Wind now")}
          value={
            windNow === null
              ? "--"
              : `${Math.round(windNow)} ${t("km/h")}`
          }
          hint={t("gusts up to {speed} km/h today", {
            speed: Math.round(days[0]?.windSpeedMax ?? 0),
          })}
        />
        <Stat
          icon={<Droplets className="h-5 w-5 text-soil-500" />}
          label={t("Soil moisture")}
          value={
            weather.current.soilMoisture === null
              ? "--"
              : `${Math.round(weather.current.soilMoisture * 100)}%`
          }
          hint={t("model estimate · top 0–1 cm")}
        />
      </div>

      {warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
          {warnings.map((warning) => (
            <span
              key={warning.title}
              className={cn("chip", warningTone[warning.level])}
              title={t(warning.detail)}
            >
              {t(warning.title)}
            </span>
          ))}
        </div>
      ) : (
        <div className="px-4 pb-4 sm:px-5">
          <span className="chip chip-brand">{t("No weather warnings")}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 border-t border-[var(--border)] bg-[var(--card-muted)]/40 p-5 sm:grid-cols-4 sm:px-6 2xl:grid-cols-7">
        {days.map((day, index) => {
          const Icon = weatherIconFor(day);
          const left = ((day.tempMin - globalMin) / spread) * 100;
          const width = Math.max(
            8,
            ((day.tempMax - day.tempMin) / spread) * 100,
          );

          return (
            <div
              key={day.date}
               className="flex flex-col items-center gap-2 p-2"
            >
              <p className="text-xs font-semibold">
                {t(weekdayLabel(day.date, index))}
              </p>
              <Icon
                className="h-6 w-6 text-sky-500"
                strokeWidth={1.9}
              />
              <p className="text-sm font-semibold tabular-nums">
                {Math.round(day.tempMax)}°
                <span className="muted font-semibold">
                  {" "}
                  / {Math.round(day.tempMin)}°
                </span>
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
                <div
                  className="h-full rounded-full bg-info-400"
                  style={{ marginLeft: `${left}%`, width: `${width}%` }}
                />
              </div>
              <p className="flex items-center gap-1 text-xs font-medium tabular-nums text-info-700">
                <Droplets className="h-3 w-3" />
                {day.precipitationProbability}%
              </p>
              <p className="muted text-xs tabular-nums">
                {Math.round(day.windSpeedMax)} {t("km/h")}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-1 py-3">
      {icon}
      <div className="min-w-0">
        <p className="muted text-sm font-medium">{label}</p>
        <p className="text-lg font-semibold leading-tight tabular-nums">
          {value}
        </p>
        {hint ? (
          <p className="muted mt-1 text-xs leading-relaxed">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WeatherCardSkeleton() {
  const { t } = useI18n();
  return (
    <section role="status" className="card overflow-hidden">
      <span className="sr-only">{t("Loading field weather…")}</span>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="h-5 w-28 animate-pulse-soft rounded bg-paper-deep" />
        <div className="h-6 w-24 animate-pulse-soft rounded-full bg-paper-deep" />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse-soft rounded-2xl bg-paper-deep"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] p-4 sm:grid-cols-4 sm:p-5 2xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse-soft rounded-2xl bg-paper-deep"
          />
        ))}
      </div>
    </section>
  );
}

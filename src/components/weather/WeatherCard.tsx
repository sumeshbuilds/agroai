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

function shortDate(iso: string) {
  const { month, day } = dateParts(iso);
  return `${day} ${MONTHS[month - 1]}`;
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
  if (loading || !weather) {
    return <WeatherCardSkeleton />;
  }

  const days = weather.daily.slice(0, 7);
  const globalMin = Math.min(...days.map((day) => day.tempMin));
  const globalMax = Math.max(...days.map((day) => day.tempMax));
  const spread = Math.max(1, globalMax - globalMin);

  const currentTemp =
    weather.current.temperature ?? (days[0]?.tempMax ?? null);

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div>
          <h2 className="text-base font-bold">Weather</h2>
          <p className="muted text-xs">
            {farmName ? `${farmName} · ` : ""}
            {weather.latitude.toFixed(3)}, {weather.longitude.toFixed(3)} ·{" "}
            {weather.timezone}
          </p>
        </div>
        <span className="chip chip-brand">
          <Sun className="h-3.5 w-3.5" />
          Next 7 days
        </span>
      </header>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl bg-brand-700 p-4 text-white sm:col-span-2 lg:col-span-1">
          <Thermometer className="h-8 w-8 opacity-90" />
          <div>
            <p className="text-3xl font-extrabold leading-none">
              {currentTemp === null ? "--" : `${Math.round(currentTemp)}°`}
            </p>
            <p className="text-xs font-medium opacity-90">
              Now · {shortDate(days[0]?.date ?? "")}
            </p>
          </div>
        </div>

        <Stat
          icon={<Droplets className="h-5 w-5 text-sky-500" />}
          label="Rain today"
          value={`${days[0]?.precipitationProbability ?? 0}%`}
          hint={`${(days[0]?.precipitationSum ?? 0).toFixed(1)} mm`}
        />
        <Stat
          icon={<Wind className="h-5 w-5 text-sky-600" />}
          label="Wind (max)"
          value={`${Math.round(days[0]?.windSpeedMax ?? 0)}`}
          hint="km/h"
        />
        <Stat
          icon={<Droplets className="h-5 w-5 text-soil-500" />}
          label="Soil moisture"
          value={
            weather.current.soilMoisture === null
              ? "--"
              : `${Math.round(weather.current.soilMoisture * 100)}%`
          }
          hint="top 0–1 cm"
        />
      </div>

      {warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
          {warnings.map((warning) => (
            <span
              key={warning.title}
              className={cn("chip", warningTone[warning.level])}
              title={warning.detail}
            >
              {warning.title}
            </span>
          ))}
        </div>
      ) : (
        <div className="px-4 pb-4 sm:px-5">
          <span className="chip chip-brand">No weather warnings 🎉</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] p-4 sm:grid-cols-4 sm:p-5 lg:grid-cols-7">
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
              className="card-muted flex flex-col items-center gap-1.5 p-3"
            >
              <p className="text-xs font-bold">
                {weekdayLabel(day.date, index)}
              </p>
              <Icon className="h-6 w-6 text-brand-700 dark:text-brand-400" />
              <p className="text-sm font-bold">
                {Math.round(day.tempMax)}°
                <span className="muted font-medium">
                  {" "}
                  / {Math.round(day.tempMin)}°
                </span>
              </p>
              <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-warn-500"
                  style={{ marginLeft: `${left}%`, width: `${width}%` }}
                />
              </div>
              <p className="text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                💧 {day.precipitationProbability}%
              </p>
              <p className="muted text-[11px]">
                {Math.round(day.windSpeedMax)} km/h
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
    <div className="card-muted flex items-center gap-3 p-4">
      {icon}
      <div>
        <p className="muted text-xs font-medium">{label}</p>
        <p className="text-xl font-bold leading-tight">
          {value}
          {hint ? (
            <span className="muted ml-1 text-xs font-medium">{hint}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function WeatherCardSkeleton() {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="h-5 w-28 animate-pulse-soft rounded bg-black/10 dark:bg-white/10" />
        <div className="h-6 w-24 animate-pulse-soft rounded-full bg-black/10 dark:bg-white/10" />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse-soft rounded-xl bg-black/5 dark:bg-white/5"
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] p-4 sm:grid-cols-4 sm:p-5 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            key={index}
            className="h-32 animate-pulse-soft rounded-xl bg-black/5 dark:bg-white/5"
          />
        ))}
      </div>
    </section>
  );
}

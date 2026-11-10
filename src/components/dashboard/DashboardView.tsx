"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Droplets,
  Gauge,
  LayoutGrid,
  MapPin,
  Sprout,
  Thermometer,
  TriangleAlert,
  Wind,
} from "lucide-react";

import { AreaPanel } from "@/components/dashboard/AreaPanel";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { CameraAlarmBanner } from "@/components/watch/CameraAlarmBanner";
import { FarmSwitcher, WorkbenchBar } from "@/components/layout/PageBar";
import { ApiError, api } from "@/lib/api-client";
import type { CameraSessionDTO } from "@/lib/camera";
import { acresToSquareMetres } from "@/lib/format";
import { useFarms } from "@/lib/hooks/use-farms";
import { useI18n } from "@/lib/i18n";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";
import type { DailyForecast, WeatherSnapshot, WeatherWarning } from "@/lib/weather";

const FarmMap = dynamic(
  () => import("@/components/map/FarmMap").then((mod) => mod.FarmMap),
  { ssr: false },
);

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekday(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : WEEKDAYS[date.getDay()];
}

/** Per-day suitability for field work (planting / spraying / moving soil). */
type DayWork = "good" | "fair" | "poor";
type TFn = (text: string, vars?: Record<string, string | number>) => string;

function dayWork(day: DailyForecast, t: TFn): { level: DayWork; reason: string } {
  if (day.precipitationProbability >= 60 || day.precipitationSum >= 6)
    return {
      level: "poor",
      reason: t("Rain likely — {chance}% chance", {
        chance: Math.round(day.precipitationProbability),
      }),
    };
  if (day.windSpeedMax >= 35)
    return {
      level: "poor",
      reason: t("Wind {speed} km/h — no spraying", {
        speed: Math.round(day.windSpeedMax),
      }),
    };
  if (day.precipitationProbability >= 30 || day.tempMax >= 40)
    return { level: "fair", reason: t("Isolated showers or heat — plan around it") };
  return { level: "good", reason: t("Dry and calm window") };
}

const DAY_TONES: Record<DayWork, { fill: string; text: string }> = {
  good: { fill: "bg-leaf-400", text: "text-leaf-700" },
  fair: { fill: "bg-warn-500", text: "text-warn-700" },
  poor: { fill: "bg-danger-500", text: "text-danger-700" },
};

function soilTone(value: number): string {
  if (value < 0.1) return "bg-danger-500";
  if (value < 0.18) return "bg-danger-500/70";
  if (value < 0.28) return "bg-warn-500";
  return "bg-leaf-500";
}

export function DashboardView() {
  const { t } = useI18n();
  const { farms, needsSetup, loading: farmsLoading } = useFarms();
  const [farmId, setFarmId] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const [crops, setCrops] = useState<CropDTO[]>([]);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [warnings, setWarnings] = useState<WeatherWarning[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [cameras, setCameras] = useState<CameraSessionDTO[]>([]);
  const [reports, setReports] = useState<WeeklyReportDTO[]>([]);
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const selectedFarm = useMemo(
    () => farms.find((farm) => farm.id === farmId) ?? farms[0] ?? null,
    [farms, farmId],
  );
  const selectedFarmIndex = selectedFarm
    ? farms.findIndex((farm) => farm.id === selectedFarm.id)
    : 0;

  const farmCrops = useMemo(() => {
    if (!selectedFarm) return [];
    return crops.filter(
      (crop) =>
        crop.farmlandId === selectedFarm.id ||
        crop.farmlandName === selectedFarm.name,
    );
  }, [crops, selectedFarm]);
  const farmCrop = farmCrops.find((crop) => crop.isActive) ?? farmCrops[0] ?? null;

  const farmCameras = useMemo(
    () => (selectedFarm ? cameras.filter((camera) => camera.farm?.id === selectedFarm.id) : []),
    [cameras, selectedFarm],
  );
  const latestReport = useMemo(
    () =>
      reports.find(
        (report) => farmCrop && report.cropId === farmCrop.id,
      ) ??
      reports.find((report) => report.cropId === null) ??
      null,
    [reports, farmCrop],
  );

  useEffect(() => {
    let active = true;
    void api
      .listCrops()
      .then(({ crops: list }) => {
        if (active) setCrops(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFarm) return;
    const farm = selectedFarm;
    let cancelled = false;

    const load = async () => {
      setWeatherLoading(true);
      try {
        const result = await api.getWeatherByFarm(farm.id);
        if (cancelled) return;
        setWeather(result.weather);
        setWarnings(result.warnings);
      } catch {
        if (!cancelled) setWeather(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedFarm]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api.listCameraSessions();
        if (active) setCameras(data.sessions);
      } catch {
        // Cameras are one source among several here.
      }
    };
    void load();
    const timer = window.setInterval(load, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const data = await api.listReports({ limit: 5 });
      setReports(data.reports);
    } catch {
      // Insights stay empty; the generate button offers a retry.
    }
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => void loadReports(), 0);
    return () => window.clearTimeout(kickoff);
  }, [loadReports]);

  const handleGenerate = async () => {
    setGenerating(true);
    setReportError(null);
    try {
      await api.generateReport(farmCrop?.id);
      await loadReports();
    } catch (cause) {
      setReportError(
        cause instanceof ApiError ? cause.message : "Could not generate the advisory.",
      );
    } finally {
      setGenerating(false);
    }
  };

  if (farmsLoading && farms.length === 0) {
    return <DashboardSkeleton />;
  }

  const hasFarms = farms.length > 0 && selectedFarm !== null;

  if (!hasFarms) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <h1 className="sr-only">{t("Field workstation")}</h1>
        <WorkbenchBar
          left={
            <span className="flex items-center gap-2 text-sm font-semibold">
              <LayoutGrid className="h-4 w-4 text-[var(--color-ink-soft)]" />
              {t("Field workstation")}
            </span>
          }
        />
        <SetupNotice showDatabase={needsSetup} />
        <section className="card mx-auto mt-8 flex max-w-xl flex-col items-center gap-5 px-6 py-12 text-center sm:px-10">
          <span className="title-icon">
            <MapPin className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-2xl font-semibold">{t("Map your first field")}</h2>
            <p className="muted mx-auto mt-3 max-w-sm text-sm leading-relaxed">
              {t("Trace the boundary on the satellite map. Its centre then powers live weather, growth guides and camera tracking for this workstation.")}
            </p>
          </div>
          <Link href="/map" className="btn btn-primary">
            {t("Open field map")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    );
  }

  const areaSqm = selectedFarm.areaAcres
    ? acresToSquareMetres(selectedFarm.areaAcres)
    : null;

  return (
    <div className="flex min-h-full flex-col px-4 py-5 sm:px-6 xl:h-full xl:min-h-0 xl:py-6">
      <h1 className="sr-only">{t("Field workstation")}</h1>
      <CameraAlarmBanner intervalMs={6_000} />

      <WorkbenchBar
        left={
          <FarmSwitcher
            farms={farms}
            selectedId={selectedFarm?.id ?? null}
            onSelect={(id) => {
              setFarmId(id);
              setPanelOpen(true);
              setReportError(null);
            }}
          />
        }
      />

      {/* The workstation split: analytics column + satellite operations map */}
      <div className="mt-5 flex flex-1 flex-col gap-6 xl:min-h-0 xl:flex-row xl:gap-5 xl:overflow-hidden">
        {/* Analytics column — scrolls on its own on desktop */}
        <section
          aria-label={t("Field analytics")}
          tabIndex={0}
          className="order-2 space-y-4 focus-visible:outline-offset-[-2px] xl:order-1 xl:min-h-0 xl:w-[24rem] xl:shrink-0 xl:overflow-y-auto xl:pr-1 xl:pb-2"
        >
          {/* Field summary */}
          <section className="card field-summary p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-1.5 text-xl font-semibold leading-tight">
                  <span className="truncate">{selectedFarm.name}</span>
                </h2>
                <p className="muted mt-2 text-xs tabular-nums">
                  {selectedFarm.centroidLat.toFixed(4)}°N,{" "}
                  {selectedFarm.centroidLng.toFixed(4)}°E
                </p>
              </div>
              <div className="text-right">
                <p className="text-[1.375rem] font-semibold leading-tight tabular-nums">
                  {areaSqm ? Math.round(areaSqm).toLocaleString() : "—"}
                  <span className="ml-1 text-[0.6875rem] font-medium uppercase text-[var(--color-ink-soft)]">
                    {t("sqm")}
                  </span>
                </p>
                {farmCameras.length > 0 ? (
                  <p className="mt-2 text-[0.6875rem] font-medium text-leaf-700">
                    {t(
                      farmCameras.length === 1
                        ? "{count} camera linked"
                        : "{count} cameras linked",
                      { count: farmCameras.filter((camera) => camera.isLive).length },
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <MetricsGrid weather={weather} loading={weatherLoading} />

          <OutlookCard days={weather?.daily.slice(0, 7) ?? []} loading={weatherLoading} />

          <SoilCard points={weather?.hourlySoilMoisture ?? []} loading={weatherLoading} />

          <ForecastCard weather={weather} warnings={warnings} loading={weatherLoading} />
        </section>

        {/* Map column */}
        <section
          aria-label={t("Satellite map")}
          className="order-1 flex flex-col gap-4 xl:order-2 xl:min-h-0 xl:flex-1"
        >
          <div className="relative overflow-hidden rounded-2xl xl:min-h-0 xl:flex-1">
            <div className="relative h-[24rem] sm:h-[28rem] xl:h-full">
              <FarmMap
                farms={farms}
                selectedFarm={selectedFarm}
                cameras={cameras}
                detailsOpen={panelOpen}
                onSelectFarm={(id) => {
                  setFarmId(id);
                  setPanelOpen(true);
                  setReportError(null);
                }}
              />
            </div>

            {panelOpen ? (
              <>
                {/* Desktop: floating panel over the map, like the reference */}
                <AreaPanel
                  key={selectedFarm.id}
                  index={selectedFarmIndex < 0 ? 0 : selectedFarmIndex}
                  farm={selectedFarm}
                  crops={farmCrops}
                  weather={weather}
                  weatherLoading={weatherLoading}
                  cameras={farmCameras}
                  report={latestReport}
                  generating={generating}
                  generationError={reportError}
                  onGenerate={() => void handleGenerate()}
                  onClose={() => setPanelOpen(false)}
                  className="hidden xl:absolute xl:inset-y-4 xl:right-4 xl:z-[600] xl:flex xl:w-[21.5rem]"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="toolbar-btn absolute right-3 top-3 z-[600] border-transparent text-xs"
              >
                <Sprout className="h-3.5 w-3.5" />
                {t("Field details")}
              </button>
            )}
          </div>
          {/* Mobile panels flow below the map instead of shrinking inside it. */}
          {panelOpen ? (
            <AreaPanel
              key={`mobile-${selectedFarm.id}`}
              index={selectedFarmIndex < 0 ? 0 : selectedFarmIndex}
              farm={selectedFarm}
              crops={farmCrops}
              weather={weather}
              weatherLoading={weatherLoading}
              cameras={farmCameras}
              report={latestReport}
              generating={generating}
              generationError={reportError}
              onGenerate={() => void handleGenerate()}
              onClose={() => setPanelOpen(false)}
              className="xl:hidden"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Left-column cards
------------------------------------------------------------------------- */

function MetricTile({
  icon,
  label,
  value,
  unit,
  rows,
  hint,
  loading,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  rows?: { label: string; value: string }[];
  hint?: string | null;
  loading: boolean;
  tone: "accent" | "info" | "leaf" | "soil";
}) {
  const iconTone = {
    accent: "bg-accent-50 text-accent-700",
    info: "bg-info-100 text-info-700",
    leaf: "bg-leaf-100 text-leaf-700",
    soil: "bg-soil-100 text-soil-700",
  }[tone];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">
          {label}
        </p>
        <span className={`metric-icon ${iconTone}`}>{icon}</span>
      </div>
      {loading ? (
        <div className="mt-1.5 h-8 w-20 animate-pulse-soft rounded-lg bg-paper-deep" />
      ) : (
        <p className="mt-2 flex items-baseline gap-1 text-[1.75rem] font-semibold leading-none tabular-nums">
          {value}
          <span className="text-sm font-medium text-ink-soft">
            {unit}
          </span>
        </p>
      )}
      <div className="mt-3 space-y-1 text-xs">
        {rows?.map((row) => (
          <p
            key={row.label}
            className="flex items-center justify-between gap-2 tabular-nums"
          >
            <span className="text-[var(--color-ink-soft)]">{row.label}</span>
            <span className="font-semibold">{row.value}</span>
          </p>
        ))}
        {hint ? (
          <p className="pt-0.5 text-[0.6875rem] leading-snug text-ink-soft">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MetricsGrid({
  weather,
  loading,
}: {
  weather: WeatherSnapshot | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  const today = weather?.daily[0];
  const current = weather?.current;

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricTile
        icon={<Thermometer className="h-4 w-4" />}
        label={t("Temperature")}
        tone="accent"
        unit={t("°C")}
        value={
          current?.temperature === null || current?.temperature === undefined
            ? "—"
            : Math.round(current.temperature).toString()
        }
        rows={
          today
            ? [
                { label: t("Max"), value: `${Math.round(today.tempMax)}°` },
                { label: t("Min"), value: `${Math.round(today.tempMin)}°` },
              ]
            : undefined
        }
        loading={loading}
      />
      <MetricTile
        icon={<Droplets className="h-4 w-4" />}
        label={t("Humidity")}
        tone="info"
        unit={t("%")}
        value={
          current?.humidity === null || current?.humidity === undefined
            ? "—"
            : Math.round(current.humidity).toString()
        }
        rows={
          today
            ? [
                {
                  label: t("Rain chance"),
                  value: `${today.precipitationProbability}%`,
                },
                {
                  label: t("Rain total"),
                  value: `${(today.precipitationSum ?? 0).toFixed(1)} ${t("mm")}`,
                },
              ]
            : undefined
        }
        loading={loading}
      />
      <MetricTile
        icon={<Droplets className="h-4 w-4" />}
        label={t("Soil moisture")}
        tone="leaf"
        unit={t("%")}
        value={
          current?.soilMoisture === null || current?.soilMoisture === undefined
            ? "—"
            : Math.round(current.soilMoisture * 100).toString()
        }
        rows={
          today
            ? [
                {
                  label: t("Rain chance"),
                  value: `${today.precipitationProbability}%`,
                },
              ]
            : undefined
        }
        hint={t("model · top 0–1 cm")}
        loading={loading}
      />
      <MetricTile
        icon={<Wind className="h-4 w-4" />}
        label={t("Wind")}
        tone="soil"
        unit={t("km/h")}
        value={
          current?.windSpeed === null || current?.windSpeed === undefined
            ? "—"
            : Math.round(current.windSpeed).toString()
        }
        rows={
          today
            ? [{ label: t("Gusts to"), value: `${Math.round(today.windSpeedMax ?? 0)}` }]
            : undefined
        }
        loading={loading}
      />
    </div>
  );
}

function OutlookCard({
  days,
  loading,
}: {
  days: DailyForecast[];
  loading: boolean;
}) {
  const { t } = useI18n();
  const works = days.map((day) => dayWork(day, t));
  const goodDays = works.filter((work) => work.level === "good").length;

  const verdict = days.length
    ? goodDays >= 5
      ? { label: t("Good for planting"), tone: "text-leaf-700" }
      : goodDays >= 3
        ? { label: t("Fair for field work"), tone: "text-warn-700" }
        : goodDays >= 1
          ? { label: t("Watch the rain"), tone: "text-warn-700" }
          : { label: t("Too wet — check drainage"), tone: "text-danger-700" }
    : {
        label: loading ? t("Awaiting forecast") : t("Forecast unavailable"),
        tone: "text-[var(--color-ink-soft)]",
      };

  return (
    <section className="card p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("Field-work outlook")}</h2>
        <span className={`text-xs font-medium ${verdict.tone}`}>
          {verdict.label}
        </span>
      </header>

      {loading ? (
        <div className="mt-3 h-10 animate-pulse-soft rounded-lg bg-paper-deep" />
      ) : days.length === 0 ? (
        <p className="muted mt-3 text-sm leading-relaxed">
          {t("No forecast is available for this field right now. Weather refreshes automatically — check back shortly.")}
        </p>
      ) : (
        <>
          <div
            className="mt-4 flex h-10 gap-1"
            role="img"
            aria-label={t("{good} of {days} forecast days look workable", {
              good: goodDays,
              days: days.length,
            })}
          >
            {works.map((work, index) => (
              <span
                key={days[index].date}
                title={`${t(weekday(days[index].date))} · ${work.reason}`}
                className={`w-full flex-1 rounded-md ${DAY_TONES[work.level].fill}`}
                aria-hidden
              />
            ))}
          </div>
          <div className="muted mt-2 flex justify-between text-[0.6875rem] tabular-nums">
            <span>{t("Today")}</span>
            <span>{t("+3d")}</span>
            <span>{t(weekday(days[days.length - 1].date))}</span>
          </div>
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--card-muted)] px-3 py-3">
            <p className="text-xs font-medium leading-snug">
              {t("{good} of {days} days look workable", {
                good: goodDays,
                days: days.length,
              })}
              <span className="muted mt-1 block text-[0.6875rem] font-normal leading-relaxed">
                {t("estimate from the 7-day forecast, not a guarantee")}
              </span>
            </p>
            <span className="chip shrink-0 bg-[var(--color-ink)] text-[#f5f4ef]">
              <svg viewBox="0 0 16 16" className="h-3 w-3 fill-accent-300" aria-hidden>
                <path d="M8 0l1.8 5.4L16 8l-6.2 2.6L8 16l-1.8-5.4L0 8l6.2-2.6L8 0z" />
              </svg>
              {t("AI Insights")}
            </span>
          </footer>
        </>
      )}
    </section>
  );
}

function SoilCard({
  points,
  loading,
}: {
  points: WeatherSnapshot["hourlySoilMoisture"];
  loading: boolean;
}) {
  const { t } = useI18n();
  const hourLabel = (iso: string) => iso.slice(11, 16);
  const slice = points.slice(0, 24).filter((point) => point.value !== null);
  const empty = !loading && slice.length === 0;

  return (
    <section className="card p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("Soil moisture")}</h2>
        <span className="chip bg-[var(--card-muted)] text-[var(--color-ink-soft)]">
          <Gauge className="h-3 w-3" />
          {t("24h · model")}
        </span>
      </header>

      {loading ? (
        <div className="mt-4 h-20 animate-pulse-soft rounded-lg bg-paper-deep" />
      ) : empty ? (
        <p className="muted mt-3 text-[0.78rem] leading-relaxed">
          {t("No soil estimate for this location. The value appears once Open-Meteo covers the field's coordinates.")}
        </p>
      ) : (
        <>
          <div
            className="mt-4 flex h-20 items-end gap-[2px]"
            role="img"
            aria-label={t("Surface soil moisture for the next 24 hours")}
          >
            {slice.map((point, index) => {
              const value = point.value ?? 0;
              const peak = slice.reduce(
                (max, candidate) => Math.max(max, (candidate.value ?? 0) as number),
                0,
              );
              const height = Math.max(8, Math.round((value / Math.max(0.001, peak)) * 100));
              return (
                <span
                  key={point.time + String(index)}
                  title={`${hourLabel(point.time)} · ${Math.round(value * 100)}% ${t("Soil moisture")}`}
                  className={`w-full flex-1 rounded-t-[3px] ${soilTone(value)}`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
          <div className="muted mt-2 flex justify-between text-[0.6875rem] tabular-nums">
            <span>{hourLabel(slice[0].time)}</span>
            <span>{hourLabel(slice[Math.floor(slice.length / 2)].time)}</span>
            <span>{hourLabel(slice[slice.length - 1].time)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function ForecastCard({
  weather,
  warnings,
  loading,
}: {
  weather: WeatherSnapshot | null;
  warnings: WeatherWarning[];
  loading: boolean;
}) {
  const { t } = useI18n();
  const fetchedAt = weather?.fetchedAt
    ? new Date(weather.fetchedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section className="card p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("Weather forecast")}</h2>
        {fetchedAt ? (
          <span className="muted text-[0.6875rem] tabular-nums">
            {t("live · {time}", { time: fetchedAt })}
          </span>
        ) : null}
      </header>

      {loading ? (
        <div className="mt-3 space-y-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-8 animate-pulse-soft rounded-lg bg-paper-deep"
            />
          ))}
        </div>
      ) : !weather ? (
        <p className="muted mt-3 text-[0.78rem] leading-relaxed">
          {t("Could not load live weather for this field right now. It refreshes on its own — check back shortly.")}
        </p>
      ) : (
        <>
          {warnings.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {warnings.slice(0, 3).map((warning) => (
                <li
                  key={warning.title}
                  title={t(warning.detail)}
                  className="flex items-start gap-1.5 rounded-lg bg-[var(--card-muted)] px-2.5 py-2 text-[0.74rem]"
                >
                  <TriangleAlert
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      warning.level === "danger"
                        ? "text-danger-600"
                        : "text-warn-600"
                    }`}
                  />
                  <span>
                    <span className="font-semibold">{t(warning.title)}</span>
                    <span className="muted block text-[0.68rem] leading-snug">
                      {t(warning.detail)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-2 flex items-center gap-1.5 text-[0.72rem]">
              <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" />
              {t("No rain, wind or heat warnings for the next 3 days")}
            </p>
          )}

          <ul className="mt-2.5 space-y-0.5">
            {weather.daily.slice(0, 7).map((day, index) => {
              const work = dayWork(day, t);
              return (
                <li
                  key={day.date}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[0.78rem] hover:bg-[var(--card-muted)]"
                >
                  <span className="w-9 shrink-0 font-semibold">
                    {index === 0 ? t("Today") : t(weekday(day.date))}
                  </span>
                  <span
                    className={`h-4 w-1 shrink-0 rounded-full ${DAY_TONES[work.level].fill}`}
                    title={work.reason}
                  />
                  <span className="flex-1 truncate tabular-nums">
                    <span className="font-semibold">
                      {Math.round(day.tempMax)}°
                    </span>
                    <span className="muted">
                      {" "}
                      / {Math.round(day.tempMin)}°
                    </span>
                  </span>
                  <span className="muted flex shrink-0 items-center gap-1 tabular-nums text-[0.7rem]">
                    <Droplets className="h-3 w-3" />
                    {day.precipitationProbability}%
                  </span>
                  <span className="muted hidden shrink-0 items-center gap-1 tabular-nums text-[0.7rem] sm:flex">
                    <Wind className="h-3 w-3" />
                    {Math.round(day.windSpeedMax)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="h-10 w-56 animate-pulse-soft rounded-full bg-paper-deep" />
        <div className="h-10 w-64 animate-pulse-soft rounded-full bg-paper-deep" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[23.5rem_1fr]">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="card h-28 animate-pulse-soft"
            />
          ))}
        </div>
        <div className="h-[60vh] animate-pulse-soft rounded-2xl bg-paper-deep" />
      </div>
    </div>
  );
}

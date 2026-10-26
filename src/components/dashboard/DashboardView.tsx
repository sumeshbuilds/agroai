"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Sparkles,
  Sprout,
  Video,
} from "lucide-react";

import { useSessionFarmer } from "@/components/auth/session";
import { CropDayGuide } from "@/components/dashboard/CropDayGuide";
import { PestSirenCard } from "@/components/dashboard/PestSirenCard";
import { ReportCard } from "@/components/crops/ReportCard";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { LiveWatchCard } from "@/components/watch/LiveWatchCard";
import { WeatherCard } from "@/components/weather/WeatherCard";
import { ApiError, api } from "@/lib/api-client";
import type { CameraSessionDTO } from "@/lib/camera";
import { useFarms } from "@/lib/hooks/use-farms";
import { formatAcres, formatRelative } from "@/lib/format";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";
import type { WeatherSnapshot, WeatherWarning } from "@/lib/weather";

// Leaflet must never render on the server (ARCHITECTURE.md rule #1).
const FarmMap = nextDynamic(
  () => import("@/components/map/FarmMap").then((mod) => mod.FarmMap),
  {
    ssr: false,
    loading: () => (
      <div className="card h-full min-h-[420px] animate-pulse-soft rounded-2xl" />
    ),
  },
);

export function DashboardView() {
  const farmer = useSessionFarmer();
  const { farms, loading: farmsLoading, needsSetup, refresh } = useFarms();
  const [farmId, setFarmId] = useState<number | null>(null);

  const [crops, setCrops] = useState<CropDTO[]>([]);
  const [cropsLoading, setCropsLoading] = useState(true);

  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [warnings, setWarnings] = useState<WeatherWarning[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [cameras, setCameras] = useState<CameraSessionDTO[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(true);
  const [reports, setReports] = useState<WeeklyReportDTO[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedFarm = useMemo(
    () => farms.find((farm) => farm.id === farmId) ?? farms[0] ?? null,
    [farms, farmId],
  );

  const activeCrop = useMemo(
    () => crops.find((crop) => crop.isActive) ?? crops[0] ?? null,
    [crops],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { crops: list } = await api.listCrops();
        if (active) setCrops(list);
      } catch {
        // The dashboard still works without the crop guide.
      } finally {
        if (active) setCropsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadReports = useCallback(async () => {
    try {
      const data = await api.listReports({ limit: 1 });
      setReports(data.reports);
    } catch {
      // Silent: the reports section simply stays empty.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadReports();
      if (active) setReportsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadReports]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await api.listCameraSessions();
        if (active) setCameras(data.sessions);
      } catch {
        // The rest of the dashboard works without live cameras.
      } finally {
        if (active) setCamerasLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(load, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!selectedFarm) return;
    const activeFarm = selectedFarm;

    let cancelled = false;

    const load = async () => {
      setWeatherLoading(true);
      try {
        const weatherRes = await api.getWeatherByFarm(activeFarm.id);
        if (cancelled) return;
        setWeather(weatherRes.weather);
        setWarnings(weatherRes.warnings);
      } catch (cause) {
        if (!cancelled) {
          setNotice(
            cause instanceof Error
              ? cause.message
              : "Could not load live weather.",
          );
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    void load();

    // Re-fetch every 10 minutes so the map markers and "Now" tiles track
    // Open-Meteo's 15-minute nowcast cadence without a manual reload.
    const refreshTimer = window.setInterval(load, 10 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [selectedFarm]);

  const handleGenerate = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const result = await api.generateReport();
      await loadReports();
      setNotice(
        result.message ??
          `Generated ${result.generated.length} weekly report${result.generated.length === 1 ? "" : "s"}.`,
      );
    } catch (cause) {
      setNotice(
        cause instanceof ApiError
          ? cause.message
          : "Could not generate the weekly report.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const hasFarms = farms.length > 0;
  const totalAcres = farms.reduce((sum, farm) => sum + (farm.areaAcres ?? 0), 0);
  const liveCamera =
    cameras.find((camera) => camera.isLive) ?? cameras[0] ?? null;
  const liveAt = weather?.fetchedAt
    ? new Date(weather.fetchedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="w-full px-4 pb-4 pt-4 sm:px-6 sm:pt-4">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {farmer ? `Welcome, ${farmer.name}` : "Farm dashboard"}
          </h1>
          <p className="muted mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
            {hasFarms ? (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--foreground)]">
                  <MapPin className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                  {selectedFarm?.name}
                </span>
                <span aria-hidden className="opacity-40">
                  ·
                </span>
                <span>
                  {farms.length} {farms.length === 1 ? "field" : "fields"} ·{" "}
                  {formatAcres(totalAcres)}
                </span>
                {liveCamera?.isLive ? (
                  <>
                    <span aria-hidden className="opacity-40">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-danger-700 dark:text-red-400">
                      <Camera className="h-3.5 w-3.5" />
                      {liveCamera.name} live
                    </span>
                  </>
                ) : null}
                {liveAt ? (
                  <>
                    <span aria-hidden className="opacity-40">
                      ·
                    </span>
                    <span className="tabular-nums">Updated {liveAt}</span>
                  </>
                ) : null}
              </>
            ) : (
              "Map your first field to unlock live weather and weekly advice."
            )}
          </p>
        </div>

        {hasFarms ? (
          <div className="flex flex-wrap items-center gap-2">
            {liveCamera?.isLive ? (
              <span className="chip chip-danger">
                <Camera className="h-3.5 w-3.5" />
                Camera live
              </span>
            ) : null}
            <Link href="/watch" className="btn btn-secondary">
              <Video className="h-4 w-4" />
              Live watch
            </Link>
            <Link href="/map" className="btn btn-secondary">
              <MapIcon className="h-4 w-4" />
              Manage fields
            </Link>
          </div>
        ) : null}
      </header>

      {needsSetup || notice ? (
        <div className="space-y-3 pb-4">
          {needsSetup ? <SetupNotice showDatabase /> : null}

          {notice ? <Callout tone="info">{notice}</Callout> : null}
        </div>
      ) : null}

      {farmsLoading && !hasFarms ? (
        <section
          aria-hidden
          className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]"
        >
          <div className="h-[60vh] min-h-[400px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5 lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]" />
          <div className="space-y-4">
            <div className="card h-[420px] animate-pulse-soft" />
            <div className="card h-56 animate-pulse-soft" />
          </div>
        </section>
      ) : !hasFarms ? (
        <div className="pb-4">
          <EmptyState
            className="mx-auto max-w-2xl"
            icon={<MapIcon className="h-7 w-7" />}
            title="Map your farmland first"
            description="Draw your field boundary on the satellite map. We use its centre for hyper-local weather and to warn you when wildlife is nearby."
            action={
              <Link href="/map" className="btn btn-primary">
                <MapIcon className="h-4 w-4" />
                Open farm map
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        </div>
      ) : (
        <section
          aria-label="Farm overview"
          className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]"
        >
          {/* Left panel — satellite view */}
          <div className="relative h-[60vh] min-h-[400px] lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
            <FarmMap
              farms={farms}
              selectedFarm={selectedFarm}
              cameras={cameras}
              onSelectFarm={setFarmId}
              onRefresh={() => void refresh()}
              refreshing={farmsLoading}
            />
          </div>

          {/* Right column — live camera, weather, then the farm guide */}
          <div className="flex flex-col gap-4">
            <LiveWatchCard session={liveCamera} loading={camerasLoading} />

            <WeatherCard
              weather={weather}
              warnings={warnings}
              farmName={selectedFarm?.name}
              loading={weatherLoading}
            />

            <PestSirenCard
              key={activeCrop?.id ?? "no-crop"}
              cropId={activeCrop?.id ?? null}
              farmName={selectedFarm?.name}
            />

            {cropsLoading ? (
              <div className="card h-48 animate-pulse-soft" />
            ) : activeCrop ? (
              <CropDayGuide crop={activeCrop} />
            ) : (
              <section className="card p-4 sm:p-5">
                <h2 className="text-base font-semibold">Crop day guide</h2>
                <p className="muted mt-1 text-sm">
                  Add a crop with its sowing date to see the day-by-day guide.
                </p>
                <Link href="/crops" className="btn btn-secondary mt-3">
                  <Sprout className="h-4 w-4" />
                  Add a crop
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </section>
            )}

            <section className="card flex flex-1 flex-col gap-4 p-4 sm:p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    <Sparkles className="h-[1.15rem] w-[1.15rem]" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold leading-tight">
                      Guide for our farm
                    </h2>
                    <p className="muted mt-0.5 text-xs">
                      AI advice built from your crop age and the 7-day forecast
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleGenerate}
                  loading={generating}
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate now
                </Button>
              </header>

              <div className="flex flex-1 flex-col gap-3">
                {reportsLoading ? (
                  <div className="card-muted h-32 animate-pulse-soft rounded-xl" />
                ) : reports.length > 0 ? (
                  <div className="flex flex-1 flex-col gap-5 border-t border-[var(--border)] pt-4">
                    {reports.map((report) => (
                      <ReportCard key={report.id} report={report} embedded />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-muted)]/60 px-5 py-8 text-center">
                    <Sparkles className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                    <p className="text-sm font-semibold">No advisory yet</p>
                    <p className="muted max-w-xs text-xs leading-relaxed">
                      Add a crop with its sowing date, then generate this
                      week&apos;s action plan.
                    </p>
                    <Link href="/crops" className="btn btn-primary mt-1">
                      <Sprout className="h-4 w-4" />
                      Add a crop
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>

              {reports[0] ? (
                <p className="muted text-xs">
                  Latest advisory generated {formatRelative(reports[0].createdAt)}
                </p>
              ) : null}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Map as MapIcon,
  RefreshCw,
  Siren,
  Sparkles,
  Sprout,
} from "lucide-react";

import { AlertBanner, type ActiveAlert } from "@/components/alerts/AlertBanner";
import { ReportCard } from "@/components/crops/ReportCard";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { WeatherCard } from "@/components/weather/WeatherCard";
import { ApiError, api } from "@/lib/api-client";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useFarms } from "@/lib/hooks/use-farms";
import { DANGER_RADIUS_KM, animalKind } from "@/lib/map";
import { formatRelative } from "@/lib/format";
import type { AlertDTO, WeeklyReportDTO } from "@/lib/types";
import type { WeatherSnapshot, WeatherWarning } from "@/lib/weather";

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function DashboardView() {
  const { farms, loading: farmsLoading, needsSetup, refresh } = useFarms();
  const [farmId, setFarmId] = useState<number | null>(null);

  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [warnings, setWarnings] = useState<WeatherWarning[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [alerts, setAlerts] = useState<AlertDTO[]>([]);
  const [reports, setReports] = useState<WeeklyReportDTO[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // Client-only value: renders empty during SSR/prerender.
  const headerLabel = useClientValue(todayLabel, "");

  const selectedFarm = farms.find((farm) => farm.id === farmId) ?? farms[0] ?? null;

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
    if (!selectedFarm) return;
    const activeFarmId = selectedFarm.id;

    let cancelled = false;

    const load = async () => {
      setWeatherLoading(true);
      try {
        const [weatherRes, alertsRes] = await Promise.all([
          api.getWeatherByFarm(activeFarmId),
          api.listAlerts({
            lat: selectedFarm.centroidLat,
            lng: selectedFarm.centroidLng,
            radiusKm: DANGER_RADIUS_KM,
            limit: 5,
          }),
        ]);
        if (cancelled) return;
        setWeather(weatherRes.weather);
        setWarnings(weatherRes.warnings);
        setAlerts(alertsRes.alerts);
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

    return () => {
      cancelled = true;
    };
  }, [selectedFarm]);

  const activeAlert = useMemo<ActiveAlert | null>(() => {
    const nearest = alerts[0];
    if (!nearest || dismissed.has(nearest.id)) return null;

    const kind = animalKind(nearest.animalType);

    return {
      animalType: kind.label,
      emoji: kind.emoji,
      farmName: selectedFarm?.name ?? "your farm",
      distanceKm: nearest.distanceKm ?? 0,
      direction: nearest.direction ?? "nearby",
      severity: nearest.severity,
      createdAt: nearest.createdAt,
    };
  }, [alerts, dismissed, selectedFarm]);

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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="muted text-sm font-medium">{headerLabel || "Welcome"}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Namaste 🙏
          </h1>
        </div>

        {farms.length > 1 ? (
          <label className="text-sm">
            <span className="muted text-xs font-semibold">Active farm</span>
            <select
              className="select mt-1"
              value={selectedFarm?.id ?? ""}
              onChange={(event) => setFarmId(Number(event.target.value))}
            >
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone="info">{notice}</Callout> : null}

      {activeAlert ? (
        <AlertBanner
          alert={activeAlert}
          onDismiss={() => {
            if (alerts[0]) {
              setDismissed((current) => new Set(current).add(alerts[0].id));
            }
          }}
        />
      ) : null}

      {farmsLoading ? (
        <WeatherCard weather={null} warnings={[]} loading />
      ) : farms.length === 0 ? (
        <EmptyState
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
      ) : (
        <WeatherCard
          weather={weather}
          warnings={warnings}
          farmName={selectedFarm?.name}
          loading={weatherLoading}
        />
      )}

      {selectedFarm ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickTile href="/map" icon={<MapIcon className="h-5 w-5" />} label="Farm map" />
          <QuickTile href="/crops" icon={<Sprout className="h-5 w-5" />} label="My crops" />
          <QuickTile href="/simulate" icon={<Siren className="h-5 w-5" />} label="Intrusion sim" />
          <QualityTile area={selectedFarm.areaAcres} />
        </div>
      ) : null}

      <section className="space-y-3">
        <SectionHeading
          title="This week's advisory"
          subtitle="AI guidance built from your crop age and the 7-day forecast"
          icon={<Sparkles className="h-5 w-5" />}
          action={
            <Button
              variant="secondary"
              onClick={handleGenerate}
              loading={generating}
              disabled={farms.length === 0}
            >
              <RefreshCw className="h-4 w-4" />
              Generate now
            </Button>
          }
        />

        {reportsLoading ? (
          <div className="card h-40 animate-pulse-soft" />
        ) : reports.length > 0 ? (
          reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))
        ) : (
          <EmptyState
            icon={<Sparkles className="h-7 w-7" />}
            title="No advisory yet"
            description="Add a crop with its sowing date, then generate this week's action plan."
            action={
              <Link href="/crops" className="btn btn-primary">
                <Sprout className="h-4 w-4" />
                Add a crop
              </Link>
            }
          />
        )}
      </section>

      <footer className="pb-4 pt-2">
        <button
          type="button"
          onClick={() => void refresh()}
          className="muted inline-flex items-center gap-1.5 text-xs font-semibold hover:text-[var(--foreground)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh farms
        </button>
        {reports[0] ? (
          <span className="muted ml-3 text-xs">
            Last advisory {formatRelative(reports[0].createdAt)}
          </span>
        ) : null}
      </footer>
    </div>
  );
}

function QuickTile({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-3 p-3.5 transition-colors hover:border-brand-500"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        {icon}
      </span>
      <span className="text-sm font-bold">{label}</span>
    </Link>
  );
}

function QualityTile({ area }: { area: number | null }) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-soil-100 text-soil-700 dark:bg-soil-700/30 dark:text-soil-300">
        <MapIcon className="h-5 w-5" />
      </span>
      <div>
        <p className="muted text-[11px] font-semibold uppercase">Mapped area</p>
        <p className="text-sm font-bold">
          {area === null || area === undefined ? "—" : `${area.toFixed(2)} acres`}
        </p>
      </div>
    </div>
  );
}

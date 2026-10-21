"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Map as MapIcon, RefreshCw, Sprout } from "lucide-react";

import { ReportCard } from "@/components/crops/ReportCard";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ApiError, api } from "@/lib/api-client";
import { todayIso } from "@/lib/format";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useFarms } from "@/lib/hooks/use-farms";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";

const CROP_OPTIONS = [
  "Paddy (Rice)",
  "Wheat",
  "Maize",
  "Mustard",
  "Potato",
  "Cotton",
  "Tomato",
  "Onion",
  "Sugarcane",
  "Groundnut",
  "Soybean",
  "Millet (Bajra)",
  "Pulses (Dal)",
  "Vegetables",
];

export function CropsView() {
  const { farms, needsSetup } = useFarms();

  const [crops, setCrops] = useState<CropDTO[]>([]);
  const [reports, setReports] = useState<WeeklyReportDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [cropName, setCropName] = useState(CROP_OPTIONS[0]);
  const [sowingDate, setSowingDate] = useState("");
  const [farmlandId, setFarmlandId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Client-only values, read during render (SSR falls back to "").
  const today = useClientValue(todayIso, "");
  const effectiveSowingDate = sowingDate || today;
  const effectiveFarmlandId =
    farmlandId || (farms[0] ? String(farms[0].id) : "");

  const loadAll = useCallback(async () => {
    try {
      const [cropsRes, reportsRes] = await Promise.all([
        api.listCrops(),
        api.listReports({ limit: 20 }),
      ]);
      setCrops(cropsRes.crops);
      setReports(reportsRes.reports);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DB_NOT_CONFIGURED") {
        // handled by SetupNotice
      } else {
        setNotice(
          cause instanceof Error ? cause.message : "Could not load crops.",
        );
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadAll();
    } finally {
      setLoading(false);
    }
  }, [loadAll]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await loadAll();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadAll]);

  const handleAddCrop = async () => {
    if (!effectiveSowingDate) {
      setNotice("Please pick the sowing date.");
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      await api.createCrop({
        cropName,
        sowingDate: effectiveSowingDate,
        farmlandId: effectiveFarmlandId ? Number(effectiveFarmlandId) : null,
      });
      setNotice(`Added ${cropName}. You can now generate its weekly advisory.`);
      await refresh();
    } catch (cause) {
      setNotice(
        cause instanceof ApiError ? cause.message : "Could not add the crop.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async (cropId?: number) => {
    if (cropId === undefined) setGeneratingAll(true);
    else setGeneratingId(cropId);
    setNotice(null);

    try {
      const result = await api.generateReport(cropId);
      await refresh();
      setNotice(
        result.message ??
          `Generated ${result.generated.length} report${result.generated.length === 1 ? "" : "s"}.`,
      );
    } catch (cause) {
      setNotice(
        cause instanceof ApiError
          ? cause.message
          : "Could not generate the advisory.",
      );
    } finally {
      setGeneratingAll(false);
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Crops & weekly advisory"
        subtitle="Tell us what you planted and when. We combine crop age with the local forecast."
        icon={<Sprout className="h-5 w-5" />}
      />

      <SetupNotice showDatabase={needsSetup} showGemini />

      {notice ? <Callout tone="info">{notice}</Callout> : null}

      <section className="card space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-bold">Add a crop</h2>

        {farms.length === 0 ? (
          <Callout tone="warn" title="No farmland yet">
            <p>
              Draw your field boundary first so we can fetch weather for its
              exact centre.
            </p>
            <p className="mt-2">
              <Link href="/map" className="font-bold underline">
                Go to the farm map →
              </Link>
            </p>
          </Callout>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="muted text-xs font-semibold">Crop</span>
            <select
              className="select mt-1"
              value={cropName}
              onChange={(event) => setCropName(event.target.value)}
            >
              {CROP_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="muted text-xs font-semibold">Sowing date</span>
            <input
              type="date"
              className="input mt-1"
              value={effectiveSowingDate}
              max={today || undefined}
              onChange={(event) => setSowingDate(event.target.value)}
            />
          </label>

          <label>
            <span className="muted text-xs font-semibold">Farm</span>
            <select
              className="select mt-1"
              value={effectiveFarmlandId}
              onChange={(event) => setFarmlandId(event.target.value)}
              disabled={farms.length === 0}
            >
              {farms.length === 0 ? <option value="">No farm</option> : null}
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleAddCrop}
            loading={saving}
            disabled={needsSetup || farms.length === 0 || !effectiveSowingDate}
          >
            <Sprout className="h-4 w-4" />
            Add crop
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleGenerate()}
            loading={generatingAll}
            disabled={needsSetup || crops.length === 0}
          >
            <RefreshCw className="h-4 w-4" />
            Generate this week&apos;s report now
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide muted">
          Active crops ({crops.length})
        </h2>

        {loading ? (
          <div className="card h-24 animate-pulse-soft" />
        ) : crops.length === 0 ? (
          <EmptyState
            icon={<Sprout className="h-7 w-7" />}
            title="No crops added yet"
            description="Add your first crop above to unlock the weekly advisory."
          />
        ) : (
          <div className="space-y-2">
            {crops.map((crop) => (
              <div
                key={crop.id}
                className="card flex flex-wrap items-center justify-between gap-3 p-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-lg dark:bg-brand-900/40">
                    🌱
                  </span>
                  <div>
                    <p className="font-bold">{crop.cropName}</p>
                    <p className="muted flex items-center gap-2 text-xs">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Day {crop.ageDays} · {crop.growthStage ?? "Seedling"}
                      {crop.farmlandName ? ` · ${crop.farmlandName}` : ""}
                    </p>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => handleGenerate(crop.id)}
                  loading={generatingId === crop.id}
                >
                  <RefreshCw className="h-4 w-4" />
                  Generate
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide muted">
          Weekly reports ({reports.length})
        </h2>

        {reports.length === 0 ? (
          <EmptyState
            icon={<MapIcon className="h-7 w-7" />}
            title="No reports yet"
            description="Generate a report to see a 4-point action plan for the coming week."
          />
        ) : (
          reports.map((report) => <ReportCard key={report.id} report={report} />)
        )}
      </section>
    </div>
  );
}

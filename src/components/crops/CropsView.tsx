"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, Map as MapIcon, Plus, RefreshCw, Sparkles, Sprout, X } from "lucide-react";

import { TodayBoard } from "@/components/crops/TodayBoard";
import { WeeklyPlanCard } from "@/components/crops/WeeklyPlanCard";
import { SoilCropFitCard } from "@/components/dashboard/SoilCropFitCard";
import { WorkWindowsCard } from "@/components/dashboard/WorkWindowsCard";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ApiError, api } from "@/lib/api-client";
import {
  CROP_OPTIONS,
  defaultDurationDays,
  getCropDayGuide,
  getCropPreset,
} from "@/lib/crop-guide";
import type { FarmPlanResponse } from "@/lib/farm-plan";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useFarms } from "@/lib/hooks/use-farms";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";
import { todayIso } from "@/lib/format";

/* ------------------------------------------------------------------------- */
/* Current soil estimate and pest-risk score; readings update without motion. */
/* ------------------------------------------------------------------------- */

/* Selectable crop tile                                                      */
/* ------------------------------------------------------------------------- */

function CropGlyphTile({
  crop,
  selected,
  onSelect,
}: {
  crop: CropDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="crop-tile"
      title={t(crop.cropName)}
    >
      <span aria-hidden className="text-[2.1rem] leading-none select-none">
        {getCropPreset(crop.cropName).emoji}
      </span>
      <span className="max-w-full truncate px-2 text-xs font-semibold">
        {t(crop.cropName)}
      </span>

      {selected ? (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-leaf-700 text-white">
          <Check aria-hidden className="h-3 w-3" strokeWidth={2.5} />
        </span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------------- */
/* Main view                                                                  */
/* ------------------------------------------------------------------------- */

export function CropsView() {
  const { t } = useI18n();
  const { farms, needsSetup } = useFarms();

  const [crops, setCrops] = useState<CropDTO[]>([]);
  const [reportResult, setReportResult] = useState<{
    cropId: number;
    report: WeeklyReportDTO | null;
  } | null>(null);
  // Bumped after a generation so the selected crop's plan is re-read.
  const [reportVersion, setReportVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "danger" | "success">("info");

  const [selectedCropId, setSelectedCropId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // New-crop form
  const [cropName, setCropName] = useState(CROP_OPTIONS[0]);
  const [sowingDate, setSowingDate] = useState("");
  const [durationDays, setDurationDays] = useState(
    String(defaultDurationDays(CROP_OPTIONS[0])),
  );
  const [durationTouched, setDurationTouched] = useState(false);
  const [farmlandId, setFarmlandId] = useState("");
  const [saving, setSaving] = useState(false);

  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);

  // Field intelligence for the selected crop: weather, work windows, pest
  // risk, soil fit and the daily checklist arrive in one request.
  const [plan, setPlan] = useState<FarmPlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const today = useClientValue(() => todayIso(), "");
  const effectiveSowingDate = sowingDate || today || "";
  const effectiveFarmlandId =
    farmlandId || (farms[0]?.id !== undefined ? String(farms[0].id) : "");

  const loadAll = useCallback(async () => {
    try {
      const { crops: cropList } = await api.listCrops();
      setCrops(cropList);
      setNotice(null);
    } catch (cause) {
      setNoticeTone("danger");
      setNotice(
        cause instanceof Error ? cause.message : "Could not load crops.",
      );
    }
  }, []);

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

  const activeCrop = useMemo(
    () => crops.find((crop) => crop.isActive) ?? null,
    [crops],
  );
  const selectedCrop = useMemo(
    () =>
      crops.find((crop) => crop.id === selectedCropId) ??
      activeCrop ??
      crops[0] ??
      null,
    [crops, selectedCropId, activeCrop],
  );

  const selectedFarm = useMemo(
    () =>
      selectedCrop?.farmlandId
        ? (farms.find((farm) => farm.id === selectedCrop.farmlandId) ?? null)
        : null,
    [farms, selectedCrop],
  );
  const selectedFarmId = selectedFarm?.id ?? null;
  const currentCropId = selectedCrop?.id ?? null;
  const planMatches =
    plan !== null &&
    Boolean(plan.farm) &&
    plan.farm.id === selectedFarmId &&
    (currentCropId === null || plan.crop?.id === currentCropId);
  const weather = planMatches ? plan.weather : null;
  const pest = planMatches ? plan.pest : null;
  const agro = planMatches ? plan.agro : null;
  const dailyPlan = planMatches ? plan.dailyPlan : null;
  const soil = planMatches ? plan.soil : null;
  const climate = planMatches ? plan.climate : null;
  const cropFit = planMatches ? plan.cropFit : [];
  const currentReport =
    reportResult?.cropId === currentCropId ? reportResult.report : null;
  const currentReportLoading =
    currentCropId !== null && reportResult?.cropId !== currentCropId;

  // One request replaces the separate weather + pest calls.
  useEffect(() => {
    if (selectedFarmId === null) return;
    const farmId = selectedFarmId;
    const cropId = currentCropId;
    const controller = new AbortController();
    const kickoff = window.setTimeout(() => {
      setPlanLoading(true);
      void api
        .getFarmPlan(farmId, cropId, { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setPlan(result);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPlan(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPlanLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(kickoff);
      controller.abort();
    };
  }, [selectedFarmId, currentCropId, reportVersion]);

  // Weekly plan: always the newest report for the crop currently selected, so
  // switching crops switches the advice instead of stacking old plans.
  useEffect(() => {
    if (currentCropId === null) return;
    const cropId = currentCropId;
    let cancelled = false;
    void api
      .listReports({ cropId, limit: 1 })
      .then((result) => {
        if (!cancelled) {
          setReportResult({ cropId, report: result.reports[0] ?? null });
        }
      })
      .catch(() => {
        if (!cancelled) setReportResult({ cropId, report: null });
      });
    return () => {
      cancelled = true;
    };
  }, [currentCropId, reportVersion]);

  const handleCropChoice = (value: string) => {
    setCropName(value);
    if (!durationTouched) setDurationDays(String(defaultDurationDays(value)));
  };

  const handleAddCrop = async () => {
    if (!effectiveSowingDate) {
      setNoticeTone("danger");
      setNotice("Please pick the sowing date.");
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const { crop } = await api.createCrop({
        cropName,
        sowingDate: effectiveSowingDate,
        farmlandId: effectiveFarmlandId ? Number(effectiveFarmlandId) : null,
        durationDays: Number(durationDays) || undefined,
      });
      setNoticeTone("success");
      setNotice(t("Added {crop}. Tap its tile to open today's guide.", { crop: t(crop.cropName) }));
      setSelectedCropId(crop.id);
      setShowAdd(false);
      await loadAll();
    } catch (cause) {
      setNoticeTone("danger");
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
      await loadAll();
      setReportVersion((version) => version + 1);
      setNoticeTone("success");
      setNotice(
        result.message ??
          t(
            result.generated.length === 1
              ? "Generated {count} report."
              : "Generated {count} reports.",
            { count: result.generated.length },
          ),
      );
    } catch (cause) {
      setNoticeTone("danger");
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

  const guide = selectedCrop
    ? getCropDayGuide(
        selectedCrop.cropName,
        selectedCrop.ageDays,
        selectedCrop.durationDays,
      )
    : null;

  /* Watering ring: soil moisture share + today's rain from the real fetch. */
  const soilPct =
    weather?.current.soilMoisture === null ||
    weather?.current.soilMoisture === undefined
      ? null
      : Math.round(weather.current.soilMoisture * 100);
  const rainToday = weather?.daily[0]?.precipitationProbability ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <SectionHeading
        title={t("Crops")}
        subtitle={t("Tap a crop to open its day guide — watering and pest watch update from the field’s live weather.")}
        icon={<CalendarDays aria-hidden className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            onClick={() => handleGenerate()}
            loading={generatingAll}
            disabled={needsSetup || crops.length === 0}
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            {t("Generate weekly advisory")}
          </Button>
        }
      />

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone={noticeTone}>{notice}</Callout> : null}

      {/* Crop selection stays horizontally scrollable on small screens. */}
      <section aria-label={t("Your crops")}>
        <div className="-m-1 flex items-center gap-3 overflow-x-auto p-1 pb-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-[6.75rem] w-[6.5rem] shrink-0 animate-pulse-soft rounded-2xl bg-[var(--card-muted)]"
              />
            ))
          ) : (
            <>
              {crops.map((crop) => (
                <CropGlyphTile
                  key={crop.id}
                  crop={crop}
                  selected={selectedCrop?.id === crop.id}
                  onSelect={() => setSelectedCropId(crop.id)}
                />
              ))}
              <button
                type="button"
                onClick={() => setShowAdd((current) => !current)}
                aria-expanded={showAdd}
                aria-controls="add-crop-form"
                className={cn(
                  "crop-tile w-[5rem] gap-2 border-dashed",
                  showAdd
                    ? "border-accent-500 bg-accent-50 text-accent-700"
                    : "border-[var(--color-line-strong)] text-[var(--color-ink-soft)] hover:border-accent-300 hover:text-accent-600",
                )}
              >
                {showAdd ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" strokeWidth={2.4} />
                )}
                <span className="text-xs font-semibold">
                  {showAdd ? t("Close") : t("Add")}
                </span>
              </button>
            </>
          )}
        </div>
        {!loading && crops.length > 0 ? (
          <p className="muted mt-2 text-xs">
            {t(
              crops.length === 1 ? "{count} crop on the farm" : "{count} crops on the farm",
              { count: crops.length },
            )}
            {activeCrop ? t(" · active one is used by the dashboard") : ""}
          </p>
        ) : null}
      </section>

      {/* Add-a-crop: compact graphical form */}
      {showAdd ? (
        <section id="add-crop-form" className="card animate-rise space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("Add a crop")}</h2>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              aria-label={t("Close add crop form")}
              className="icon-btn -mr-2 -mt-2 border-transparent bg-transparent text-ink-soft"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {farms.length === 0 ? (
            <Callout tone="warn" title={t("No farmland yet")}>
              <p>
                {t("Draw your field boundary first so the guides and trackers use its exact weather.")}
              </p>
              <p className="mt-2">
                <Link href="/map" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  {t("Go to the field map →")}
                </Link>
              </p>
            </Callout>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {CROP_OPTIONS.map((option) => {
              const selected = cropName === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleCropChoice(option)}
                  aria-pressed={selected}
                  className={cn(
                    "btn border px-3 text-sm",
                    selected
                      ? "border-leaf-600 bg-leaf-100 text-leaf-700"
                      : "btn-secondary",
                  )}
                >
                  <span aria-hidden className="text-[1.05rem]">
                    {getCropPreset(option).emoji}
                  </span>
                  {t(option)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium">
                {t("Sowing date")}
              </span>
              <input
                type="date"
                className="input mt-2"
                value={effectiveSowingDate}
                max={today || undefined}
                onChange={(event) => setSowingDate(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">
                {t("Duration (days)")}
              </span>
              <input
                type="number"
                className="input mt-2"
                min={1}
                max={400}
                inputMode="numeric"
                value={durationDays}
                onChange={(event) => {
                  setDurationTouched(true);
                  setDurationDays(event.target.value);
                }}
              />
            </label>
            {farms.length > 1 ? (
              <label className="block">
                <span className="text-sm font-medium">{t("Field")}</span>
                <select
                  className="select mt-2"
                  value={effectiveFarmlandId}
                  onChange={(event) => setFarmlandId(event.target.value)}
                >
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>
                      {farm.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <Button
            onClick={handleAddCrop}
            loading={saving}
            disabled={needsSetup || farms.length === 0 || !effectiveSowingDate}
          >
            <Plus className="h-4 w-4" />
            {t("Add {crop}", { crop: t(cropName) })}
          </Button>
        </section>
      ) : null}

      {/* Today board — one verdict, picture tiles and the tap-to-tick checklist */}
      {selectedCrop && guide ? (
        <TodayBoard
          crop={selectedCrop}
          guide={guide}
          dailyPlan={dailyPlan}
          agro={agro}
          pest={pest}
          soilPercent={soilPct}
          rainToday={rainToday}
          planLoading={planLoading}
          generating={generatingId === selectedCrop.id}
          onWeekly={() => handleGenerate(selectedCrop.id)}
        />
      ) : !loading ? (
        <EmptyState
          icon={<Sprout aria-hidden className="h-6 w-6" />}
          title={t("No crops added yet")}
          description={t(
            "Tap the dashed Add tile above to plant your first crop — today's jobs and the week ahead appear right away.",
          )}
          action={
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              {t("Add your first crop")}
            </Button>
          }
        />
      ) : null}

      {/* Week detail folds away so the page stays short on a phone. */}
      {selectedCrop ? (
        <details className="card group overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2.5">
              <span className="icon-tile">
                <CalendarDays className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-semibold leading-tight">
                  {t("Best days and windows this week")}
                </span>
                <span className="muted block text-xs">
                  {t("Rain, wind and the calm spraying window")}
                </span>
              </span>
            </span>
            <span className="muted text-xs font-semibold group-open:hidden">
              {t("Open")}
            </span>
            <span className="muted hidden text-xs font-semibold group-open:inline">
              {t("Close")}
            </span>
          </summary>
          <div className="border-t border-[var(--color-line)] p-2 sm:p-3">
            <WorkWindowsCard agro={agro} loading={planLoading && !plan} />
          </div>
        </details>
      ) : null}

      {selectedFarmId !== null && soil ? (
        <SoilCropFitCard
          farmId={selectedFarmId}
          soil={soil}
          climate={climate}
          cropFit={cropFit}
          onSaved={() => {
            if (selectedFarmId === null) return;
            void api
              .getFarmPlan(selectedFarmId, currentCropId)
              .then((result) => setPlan(result))
              .catch(() => undefined);
          }}
          compact
        />
      ) : null}

      {/* One weekly plan for the crop currently selected */}
      <section className="space-y-4 pt-2" aria-label={t("Weekly action plan")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("Weekly action plan")}</h2>
            <p className="muted mt-1 text-xs">
              {selectedCrop
                ? t("One plan for {crop}, built from its crop stage and this week's forecast.", {
                    crop: t(selectedCrop.cropName),
                  })
                : t("Add a crop to get its weekly plan.")}
            </p>
          </div>
          {selectedCrop ? (
            <Button
              variant="secondary"
              onClick={() => handleGenerate(selectedCrop.id)}
              loading={generatingId === selectedCrop.id}
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              {t("Refresh this plan")}
            </Button>
          ) : null}
        </div>

        {currentReportLoading ? (
          <div className="card h-40 animate-pulse-soft" aria-label={t("Loading weekly plan")} />
        ) : currentReport ? (
          <WeeklyPlanCard
            report={currentReport}
            crop={selectedCrop}
            pestLevel={pest?.level ?? null}
            generating={generatingId === selectedCrop.id}
            onRefresh={
              selectedCrop ? () => handleGenerate(selectedCrop.id) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={<MapIcon className="h-7 w-7" />}
            title={
              selectedCrop
                ? t("No plan for {crop} yet", { crop: t(selectedCrop.cropName) })
                : t("No weekly plan yet")
            }
            description={
              selectedCrop
                ? t("Generate one to get a 4-point action plan and a short list of inputs this crop may need.")
                : t("Generate one to see a 4-point action plan for the coming week.")
            }
            action={
              selectedCrop ? (
                <Button
                  onClick={() => handleGenerate(selectedCrop.id)}
                  loading={generatingId === selectedCrop.id}
                >
                  <Sparkles aria-hidden className="h-4 w-4" />
                  {t("Generate for {crop}", { crop: t(selectedCrop.cropName) })}
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  Droplets,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Sparkles,
  SprayCan,
  Sprout,
  X,
} from "lucide-react";

import { ReportCard } from "@/components/crops/ReportCard";
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
import { PEST_LEVEL_META, type PestRiskAssessment } from "@/lib/pest-risk";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useFarms } from "@/lib/hooks/use-farms";
import { cn } from "@/lib/cn";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";
import type { WeatherSnapshot } from "@/lib/weather";
import { todayIso } from "@/lib/format";

/* ------------------------------------------------------------------------- */
/* Current soil estimate and pest-risk score; readings update without motion. */
/* ------------------------------------------------------------------------- */

function GaugeRing({
  percent,
  tone,
  icon,
  label,
  caption,
  credit,
}: {
  percent: number | null;
  tone: "info" | "leaf" | "warn" | "danger";
  icon: React.ReactNode;
  label: string;
  caption: string;
  credit: string;
}) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const shown =
    percent === null
      ? 0
      : Math.max(0, Math.min(100, Math.round(percent)));
  const dash = (shown / 100) * circumference;

  const ringTone = {
    info: "text-info-500",
    leaf: "text-leaf-500",
    warn: "text-warn-500",
    danger: "text-danger-500",
  }[tone];

  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div className="relative aspect-square w-[7.375rem] max-w-full">
        <svg
          viewBox="0 0 118 118"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${label}: ${percent === null ? "no data" : `${shown}%`}`}
        >
          <circle
            cx="59"
            cy="59"
            r={radius}
            fill="none"
            strokeWidth="9"
            className="stroke-[var(--card-muted)]"
          />
          {shown > 0 ? (
            <circle
              cx="59"
              cy="59"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
              className={ringTone}
            />
          ) : null}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          {icon}
          {percent !== null ? (
            <span className="text-xs font-semibold tabular-nums text-ink-soft">
              {shown}%
            </span>
          ) : null}
        </span>
      </div>
      <div className="max-w-[11rem] text-center">
        <p className="text-sm font-semibold">{label}</p>
        <p className="muted mt-1.5 text-xs leading-relaxed">{caption}</p>
        <p className="muted mt-2 text-[0.6875rem] leading-relaxed">
          {credit}
        </p>
      </div>
    </div>
  );
}

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
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="crop-tile"
      title={crop.cropName}
    >
      <span aria-hidden className="text-[2.1rem] leading-none select-none">
        {getCropPreset(crop.cropName).emoji}
      </span>
      <span className="max-w-full truncate px-2 text-xs font-semibold">
        {crop.cropName}
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

  // Trackers data for the selected crop
  const [weatherResult, setWeatherResult] = useState<{
    farmId: number;
    weather: WeatherSnapshot | null;
  } | null>(null);
  const [pestResult, setPestResult] = useState<{
    cropId: number;
    assessment: PestRiskAssessment | null;
  } | null>(null);

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
  const weather = weatherResult?.farmId === selectedFarmId ? weatherResult.weather : null;
  const weatherLoading = selectedFarmId !== null && weatherResult?.farmId !== selectedFarmId;
  const pest = pestResult?.cropId === currentCropId ? pestResult.assessment : null;
  const pestLoading = currentCropId !== null && pestResult?.cropId !== currentCropId;
  const currentReport =
    reportResult?.cropId === currentCropId ? reportResult.report : null;
  const currentReportLoading =
    currentCropId !== null && reportResult?.cropId !== currentCropId;

  // Watering tracker input: live weather at the selected crop's field centre.
  useEffect(() => {
    if (selectedFarmId === null) return;
    const farmId = selectedFarmId;
    let cancelled = false;
    void api
      .getWeatherByFarm(farmId)
      .then((result) => {
        if (!cancelled) setWeatherResult({ farmId, weather: result.weather });
      })
      .catch(() => {
        if (!cancelled) setWeatherResult({ farmId, weather: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFarmId]);

  // Pesticide tracker input: the rule-based pest engine for this crop.
  useEffect(() => {
    if (currentCropId === null) return;
    const cropId = currentCropId;
    let cancelled = false;
    void api
      .getPestRisk(cropId)
      .then((result) => {
        if (!cancelled) setPestResult({ cropId, assessment: result.assessment });
      })
      .catch(() => {
        if (!cancelled) setPestResult({ cropId, assessment: null });
      });
    return () => {
      cancelled = true;
    };
  }, [currentCropId]);

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
      setNotice(`Added ${crop.cropName}. Tap its tile to open today's guide.`);
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
          `Generated ${result.generated.length} report${result.generated.length === 1 ? "" : "s"}.`,
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

  const waterCaption = weatherLoading
    ? "Reading live weather…"
    : soilPct === null
      ? selectedFarm
        ? "No soil estimate for this field yet."
        : "Link the crop to a mapped field to enable this."
      : (rainToday ?? 0) >= 50
        ? `${rainToday}% rain today — it may cover you.`
        : soilPct < 18
          ? "Topsoil is drying — irrigate soon."
          : soilPct < 28
            ? "Moisture OK — recheck tomorrow."
            : "Plenty of moisture — no watering needed.";

  /* Pesticide ring: real rule-based risk score mapped onto the ring. */
  const pestTone =
    pest === null
      ? ("leaf" as const)
      : pest.level === "low"
        ? ("leaf" as const)
        : pest.level === "moderate"
          ? ("warn" as const)
          : ("danger" as const);

  const pestCaption = pestLoading
    ? "Analysing the forecast…"
    : pest
      ? `${PEST_LEVEL_META[pest.level].label} — ${pest.threats[0]?.name ?? "scout routinely"}`
      : selectedCrop
        ? "Could not analyse — generate a report to retry."
        : "Select a crop.";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <SectionHeading
        title="Crops"
        subtitle="Tap a crop to open its day guide — watering and pest watch update from the field’s live weather."
        icon={<CalendarDays aria-hidden className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            onClick={() => handleGenerate()}
            loading={generatingAll}
            disabled={needsSetup || crops.length === 0}
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            Generate weekly advisory
          </Button>
        }
      />

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone={noticeTone}>{notice}</Callout> : null}

      {/* Crop selection stays horizontally scrollable on small screens. */}
      <section aria-label="Your crops">
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
                  {showAdd ? "Close" : "Add"}
                </span>
              </button>
            </>
          )}
        </div>
        {!loading && crops.length > 0 ? (
          <p className="muted mt-2 text-xs">
            {crops.length} crop{crops.length === 1 ? "" : "s"} on the farm
            {activeCrop ? " · active one is used by the dashboard" : ""}
          </p>
        ) : null}
      </section>

      {/* Add-a-crop: compact graphical form */}
      {showAdd ? (
        <section id="add-crop-form" className="card animate-rise space-y-5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Add a crop</h2>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              aria-label="Close add crop form"
              className="icon-btn -mr-2 -mt-2 border-transparent bg-transparent text-ink-soft"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {farms.length === 0 ? (
            <Callout tone="warn" title="No farmland yet">
              <p>
                Draw your field boundary first so the guides and trackers use
                its exact weather.
              </p>
              <p className="mt-2">
                <Link href="/map" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  Go to the field map →
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
                  {option}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium">
                Sowing date
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
                Duration (days)
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
                <span className="text-sm font-medium">Field</span>
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
            Add {cropName}
          </Button>
        </section>
      ) : null}

      {/* Today panel — day number + guide beside the two tracker rings */}
      {selectedCrop && guide ? (
        <section
          className="card p-5 sm:p-6"
          aria-label={`Today for ${selectedCrop.cropName}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-[1_1_22rem] items-start gap-3.5">
              <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-leaf-100 text-[2rem]">
                {guide.emoji}
              </span>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold leading-tight">
                  {guide.cropName}
                  <span className="chip chip-brand">Day {guide.ageDays}</span>
                </h2>
                <p className="muted mt-1.5 break-words text-sm">
                  {selectedCrop.farmlandName ?? "No field linked"}
                </p>
                <p className="muted mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs tabular-nums">
                  <span>{guide.stage.name}</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    sown {selectedCrop.sowingDate}
                  </span>
                  {guide.isHarvestWindow ? (
                    <span className="chip chip-lime">Harvest window</span>
                  ) : (
                    <span>
                      {guide.daysToHarvest} days to harvest
                    </span>
                  )}
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              onClick={() => handleGenerate(selectedCrop.id)}
              loading={generatingId === selectedCrop.id}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Weekly advisory
            </Button>
          </div>

          <div className="mt-6 grid gap-7 border-t border-[var(--color-line)] pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
            {/* Left: what today is about (real stage guide text) */}
            <div className="max-w-xl min-w-0 flex-1">
              <p className="text-base leading-relaxed">
                {guide.stage.focus}
              </p>
              <ul className="mt-4 space-y-2.5">
                {guide.stage.tasks.slice(0, 3).map((task) => (
                  <li
                    key={task}
                    className="flex items-start gap-2.5 text-sm leading-relaxed"
                  >
                    <span
                      aria-hidden
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-500"
                    />
                    {task}
                  </li>
                ))}
              </ul>
              <div className="mt-5 max-w-sm">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="muted">Season progress</span>
                  <span className="tabular-nums">{guide.progress}%</span>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--card-muted)]"
                  role="progressbar"
                  aria-label="Season progress"
                  aria-valuenow={guide.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="progress-fill h-full rounded-full bg-leaf-500"
                    style={{ transform: `scaleX(${guide.progress / 100})` }}
                    aria-hidden
                  />
                </div>
              </div>
            </div>

            {/* Right: the two tracker rings */}
            <div className="grid grid-cols-2 items-start gap-4 border-t border-[var(--color-line)] pt-6 sm:gap-6 lg:border-0 lg:pt-0">
              <GaugeRing
                percent={soilPct}
                tone="info"
                icon={<Droplets aria-hidden className="h-8 w-8 text-info-500" strokeWidth={2} />}
                label="Watering"
                caption={waterCaption}
                credit="Open-Meteo soil estimate · top 0–1 cm"
              />
              <GaugeRing
                percent={pest ? pest.score : null}
                tone={pestTone}
                icon={<SprayCan aria-hidden className={cn(
                  "h-8 w-8",
                  pestTone === "leaf" && "text-leaf-600",
                  pestTone === "warn" && "text-warn-600",
                  pestTone === "danger" && "text-danger-600",
                )} strokeWidth={2} />}
                label="Pesticide watch"
                caption={pestCaption}
                credit="Rule engine on live weather · not a spray order"
              />
            </div>
          </div>
        </section>
      ) : !loading ? (
        <EmptyState
           icon={<Sprout aria-hidden className="h-6 w-6" />}
          title="No crops added yet"
          description="Tap the dashed Add tile above to plant your first crop — the day guide and trackers unlock immediately."
          action={
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" />
              Add your first crop
            </Button>
          }
        />
      ) : null}

      {/* One weekly plan for the crop currently selected */}
      <section className="space-y-4 pt-2" aria-label="Weekly action plan">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Weekly action plan</h2>
            <p className="muted mt-1 text-xs">
              {selectedCrop
                ? `One plan for ${selectedCrop.cropName}, built from its crop stage and this week's forecast.`
                : "Add a crop to get its weekly plan."}
            </p>
          </div>
          {selectedCrop ? (
            <Button
              variant="secondary"
              onClick={() => handleGenerate(selectedCrop.id)}
              loading={generatingId === selectedCrop.id}
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              Refresh this plan
            </Button>
          ) : null}
        </div>

        {currentReportLoading ? (
          <div className="card h-40 animate-pulse-soft" aria-label="Loading weekly plan" />
        ) : currentReport ? (
          <ReportCard
            report={currentReport}
            crop={selectedCrop}
            pestLevel={pest?.level ?? null}
          />
        ) : (
          <EmptyState
            icon={<MapIcon className="h-7 w-7" />}
            title={
              selectedCrop
                ? `No plan for ${selectedCrop.cropName} yet`
                : "No weekly plan yet"
            }
            description={
              selectedCrop
                ? "Generate one to get a 4-point action plan and a short list of inputs this crop may need."
                : "Generate one to see a 4-point action plan for the coming week."
            }
            action={
              selectedCrop ? (
                <Button
                  onClick={() => handleGenerate(selectedCrop.id)}
                  loading={generatingId === selectedCrop.id}
                >
                  <Sparkles aria-hidden className="h-4 w-4" />
                  Generate for {selectedCrop.cropName}
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
    </div>
  );
}

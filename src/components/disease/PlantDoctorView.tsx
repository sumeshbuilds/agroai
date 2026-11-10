"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  Camera,
  ImagePlus,
  RefreshCw,
  ScanLine,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { DiseaseHistory } from "@/components/disease/DiseaseHistory";
import { DiseaseResultCard } from "@/components/disease/DiseaseResultCard";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { CROP_OPTIONS, getCropPreset } from "@/lib/crop-guide";
import {
  isPlantPart,
  PLANT_PARTS,
  type DiseaseScanDTO,
  type PlantPart,
} from "@/lib/disease";
import { useFarms } from "@/lib/hooks/use-farms";
import { useI18n } from "@/lib/i18n";
import { prepareScanImage } from "@/lib/image";
import type { CropDTO } from "@/lib/types";

interface PhotoState {
  blob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

const TIP_KEYS = [
  "Fill the frame with the affected part.",
  "Use daylight, not flash. Avoid hard shadows.",
  "Hold still and focus before you shoot.",
  "Show some healthy tissue next to the damage.",
  "For leaves, photograph the top and the underside.",
] as const;

export function PlantDoctorView({
  initialCropId = null,
}: {
  initialCropId?: number | null;
}) {
  const { t } = useI18n();
  const { needsSetup } = useFarms();

  const [crops, setCrops] = useState<CropDTO[]>([]);
  const [history, setHistory] = useState<DiseaseScanDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<DiseaseScanDTO | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);

  const [cropValue, setCropValue] = useState<string | null>(null);
  const [part, setPart] = useState<PlantPart>("leaf");
  const [note, setNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const analyzingRef = useRef(false);

  const busy = preparing || analyzing;

  /* ---------------------------------------------------------------------- */
  /* Data                                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let active = true;
    void api
      .listCrops()
      .then(({ crops: list }) => {
        if (active) setCrops(list);
      })
      .catch(() => {
        // Crops are optional context; scanning still works without them.
      });
    return () => {
      active = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { scans } = await api.listDiseaseScans({ limit: 18 });
      setHistory(scans);
      setHistoryError(null);
    } catch (cause) {
      setHistoryError(
        cause instanceof ApiError
          ? cause.message
          : t("Could not load your scans."),
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => void loadHistory(), 0);
    return () => window.clearTimeout(kickoff);
  }, [loadHistory]);

  const defaultCropValue = useMemo(() => {
    if (crops.length === 0) return "unknown";
    const preferred =
      (initialCropId
        ? crops.find((crop) => crop.id === initialCropId)
        : undefined) ??
      crops.find((crop) => crop.isActive) ??
      crops[0];
    return preferred ? `id:${preferred.id}` : "unknown";
  }, [crops, initialCropId]);

  const effectiveCropValue = cropValue ?? defaultCropValue;

  // Revoke the previous preview URL when the photo changes or the view closes.
  useEffect(() => {
    if (!photo) return;
    const url = photo.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  /* ---------------------------------------------------------------------- */
  /* Derived values                                                         */
  /* ---------------------------------------------------------------------- */

  const selectedCrop = useMemo(() => {
    if (!effectiveCropValue.startsWith("id:")) return null;
    const id = Number(effectiveCropValue.slice(3));
    return crops.find((crop) => crop.id === id) ?? null;
  }, [crops, effectiveCropValue]);

  const selectedCropName = selectedCrop
    ? selectedCrop.cropName
    : effectiveCropValue.startsWith("name:")
      ? effectiveCropValue.slice(5)
      : null;

  const cropOptions = useMemo(() => {
    const userNames = new Set(crops.map((crop) => crop.cropName));
    return CROP_OPTIONS.filter((name) => !userNames.has(name));
  }, [crops]);

  const shownImage = result ? resultImage ?? result.imageUrl : null;

  /* ---------------------------------------------------------------------- */
  /* Photo handling                                                         */
  /* ---------------------------------------------------------------------- */

  const handleFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;

      setError(null);
      setNotice(null);

      if (!file.type.startsWith("image/")) {
        setError(t("Please choose a photo file."));
        return;
      }

      setPreparing(true);
      try {
        const prepared = await prepareScanImage(file);
        setPhoto({
          ...prepared,
          previewUrl: URL.createObjectURL(prepared.blob),
        });
        setResult(null);
        setResultImage(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("Could not read that photo."),
        );
      } finally {
        setPreparing(false);
      }
    },
    [t],
  );

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    void handleFile(file);
  };

  const clearPhoto = () => {
    if (busy) return;
    setPhoto(null);
    setResult(null);
    setResultImage(null);
    setError(null);
    setNotice(null);
  };

  const openCamera = () => {
    if (busy) return;
    cameraInputRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (busy) return;
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const handleDropzoneKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openCamera();
  };

  /* ---------------------------------------------------------------------- */
  /* Analyse                                                                */
  /* ---------------------------------------------------------------------- */

  const scrollToResultOnMobile = () => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleAnalyze = async () => {
    if (!photo || busy || needsSetup || analyzingRef.current) return;

    analyzingRef.current = true;
    setAnalyzing(true);
    setError(null);
    setNotice(null);

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 75_000);

    try {
      const { scan } = await api.detectDisease(
        {
          image: photo.blob,
          cropId: selectedCrop?.id ?? null,
          cropName: selectedCropName,
          plantPart: part,
          note: note.trim() || null,
        },
        { signal: controller.signal },
      );

      setResult(scan);
      setResultImage(scan.imageUrl);
      setHistory((current) => [
        scan,
        ...current.filter((item) => item.id !== scan.id),
      ].slice(0, 18));
      setNotice(t("This scan was saved to your history."));
      window.setTimeout(scrollToResultOnMobile, 60);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setError(
          t("The scan took too long. Please try again with a smaller photo."),
        );
      } else if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError(
          cause instanceof Error ? cause.message : t("Could not analyse the photo."),
        );
      }
    } finally {
      window.clearTimeout(timer);
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* History                                                                */
  /* ---------------------------------------------------------------------- */

  const handleSelectScan = (scan: DiseaseScanDTO) => {
    setResult(scan);
    setResultImage(scan.imageUrl);
    setError(null);
    setNotice(null);

    if (scan.cropId && crops.some((crop) => crop.id === scan.cropId)) {
      setCropValue(`id:${scan.cropId}`);
    } else if (scan.cropName && CROP_OPTIONS.includes(scan.cropName)) {
      setCropValue(`name:${scan.cropName}`);
    } else {
      setCropValue("unknown");
    }
    setPart(isPlantPart(scan.plantPart) ? scan.plantPart : "leaf");
    window.setTimeout(scrollToResultOnMobile, 60);
  };

  const handleDeleteScan = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteDiseaseScan(id);
      setHistory((current) => current.filter((scan) => scan.id !== id));
      if (result?.id === id) {
        setResult(null);
        setResultImage(null);
      }
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : t("Could not delete that scan."),
      );
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <SectionHeading
        title={t("Plant doctor")}
        subtitle={t(
          "Snap a leaf, stem or fruit. AI reads the photo and tells you what is likely wrong — with a short, practical action plan.",
        )}
        icon={<ScanLine aria-hidden className="h-5 w-5" />}
        action={
          <Button
            variant="secondary"
            onClick={() => void loadHistory()}
            loading={historyLoading}
          >
            <RefreshCw aria-hidden className="h-4 w-4" />
            {t("Refresh")}
          </Button>
        }
      />

      <SetupNotice showDatabase={needsSetup} />

      {error ? (
        <Callout
          tone="danger"
          icon={<TriangleAlert aria-hidden className="h-5 w-5" />}
        >
          {error}
        </Callout>
      ) : null}

      {notice ? <Callout tone="success">{notice}</Callout> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- */}
        {/* Capture                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section className="card space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("Scan a plant part")}</h2>
              <p className="muted mt-1 max-w-md text-sm leading-relaxed">
                {t(
                  "One clear photo is enough. The diagnosis and action plan appear on the right.",
                )}
              </p>
            </div>
            <span className="chip chip-brand">
              <Sparkles aria-hidden className="h-3 w-3" />
              {t("AI vision")}
            </span>
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleInputChange}
            tabIndex={-1}
            aria-hidden
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="sr-only"
            onChange={handleInputChange}
            tabIndex={-1}
            aria-hidden
          />

          <div
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label={t("Tap to take a photo")}
            aria-disabled={busy || needsSetup}
            onClick={openCamera}
            onKeyDown={handleDropzoneKey}
            onDragOver={(event) => {
              event.preventDefault();
              if (!busy) setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={cn(
              "relative flex aspect-[4/3] min-h-[15.5rem] w-full items-center justify-center overflow-hidden rounded-2xl bg-[var(--color-rail)] text-center outline-none transition-shadow",
              !busy && "cursor-pointer",
              dragActive
                ? "ring-4 ring-accent-500/50"
                : "ring-1 ring-inset ring-white/10",
            )}
          >
            {photo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl}
                  alt={t("Selected plant photo")}
                  className="h-full w-full object-contain"
                />
                <span className="absolute bottom-3 left-3 rounded-full bg-[var(--color-rail)]/75 px-2.5 py-1 text-[0.65rem] font-medium text-white/80 tabular-nums backdrop-blur">
                  {photo.width} × {photo.height}
                </span>
                {!busy ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearPhoto();
                    }}
                    aria-label={t("Clear photo")}
                    className="icon-btn absolute right-3 top-3 border-transparent bg-white/90 text-ink shadow"
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                ) : null}
              </>
            ) : (
              <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-[var(--color-leaf-100)]">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <Camera aria-hidden className="h-7 w-7" strokeWidth={1.7} />
                </span>
                <p className="text-base font-semibold text-white">
                  {t("Tap to take a photo")}
                </p>
                <p className="text-xs text-white/70">{t("or drop an image here")}</p>
                <p className="text-[0.7rem] leading-relaxed text-white/50">
                  {t("Use daylight and fill the frame with the affected part.")}
                </p>
              </div>
            )}

            {busy ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[var(--color-rail)]/75 px-6 text-center text-white backdrop-blur-[2px]">
                <span aria-hidden className="scan-line" />
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/20 animate-pulse-soft">
                  <ScanLine aria-hidden className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold">
                  {preparing
                    ? t("Preparing photo…")
                    : t("Reading the plant… this can take up to 30 seconds.")}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={openCamera}
              disabled={busy || needsSetup}
            >
              <Camera aria-hidden className="h-4 w-4" />
              {t("Take photo")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => uploadInputRef.current?.click()}
              disabled={busy || needsSetup}
            >
              <Upload aria-hidden className="h-4 w-4" />
              {t("Upload")}
            </Button>
            {photo ? (
              <Button
                variant="ghost"
                onClick={clearPhoto}
                disabled={busy}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                {t("Clear photo")}
              </Button>
            ) : (
              <span className="muted inline-flex items-center gap-1.5 px-1 text-[0.7rem]">
                <ImagePlus aria-hidden className="h-3.5 w-3.5" />
                {t("JPEG, PNG or WebP")}
              </span>
            )}
          </div>

          <div className="space-y-4 border-t border-[var(--color-line)] pt-5">
            <label className="block">
              <span className="text-sm font-medium">{t("Crop (optional)")}</span>
              <select
                className="select mt-2"
                value={effectiveCropValue}
                disabled={busy}
                onChange={(event) => setCropValue(event.target.value)}
              >
                <option value="unknown">{t("Not sure / other")}</option>
                {crops.length > 0 ? (
                  <optgroup label={t("Your crops")}>
                    {crops.map((crop) => (
                      <option key={crop.id} value={`id:${crop.id}`}>
                        {getCropPreset(crop.cropName).emoji} {t(crop.cropName)}
                        {crop.farmlandName ? ` · ${crop.farmlandName}` : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {cropOptions.length > 0 ? (
                  <optgroup label={t("Common crops")}>
                    {cropOptions.map((name) => (
                      <option key={name} value={`name:${name}`}>
                        {getCropPreset(name).emoji} {t(name)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <fieldset disabled={busy}>
              <legend className="text-sm font-medium">
                {t("Which part is affected?")}
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                {PLANT_PARTS.map((option) => {
                  const selected = part === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPart(option.value)}
                      aria-pressed={selected}
                      className={cn(
                        "selection-card flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-xs font-semibold sm:min-w-[5.5rem] sm:flex-row sm:gap-1.5",
                        selected && "text-leaf-700",
                      )}
                    >
                      <span aria-hidden className="text-base leading-none">
                        {option.emoji}
                      </span>
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="block">
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                {t("What do you notice? (optional)")}
                <span className="text-[0.65rem] font-normal text-[var(--color-ink-soft)] tabular-nums">
                  {note.length}/400
                </span>
              </span>
              <textarea
                className="textarea mt-2 min-h-[4.5rem] resize-y"
                rows={2}
                maxLength={400}
                value={note}
                disabled={busy}
                placeholder={t(
                  "For example: brown spots started 3 days ago after rain.",
                )}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>

            <Button
              onClick={() => void handleAnalyze()}
              loading={analyzing}
              disabled={!photo || busy || needsSetup}
              className="w-full"
            >
              <Sparkles aria-hidden className="h-4 w-4" />
              {t("Ask the plant doctor")}
            </Button>
            <p className="muted text-center text-[0.68rem] leading-relaxed">
              {t("This photo is private to your account.")}{" "}
              {t(
                "The photo and result are stored in your scan history. Use a close, well-lit photo for the best result.",
              )}
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Result / tips                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div ref={resultRef} className="scroll-mt-6 space-y-4">
          {result && shownImage ? (
            <DiseaseResultCard scan={result} imageUrl={shownImage} />
          ) : (
            <section className="card p-5 sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="icon-tile">
                  <Camera aria-hidden className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">{t("Photo tips")}</h2>
                  <p className="muted text-xs">
                    {t(
                      "The AI looks for colour, spots, edges and pests, then writes a short action plan.",
                    )}
                  </p>
                </div>
              </div>
              <ol className="mt-5 space-y-3">
                {TIP_KEYS.map((tip, index) => (
                  <li key={tip} className="flex items-start gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-[0.7rem] font-semibold text-leaf-700 tabular-nums">
                      {index + 1}
                    </span>
                    <span>{t(tip)}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--color-panel)] p-3 text-xs leading-relaxed text-[var(--color-ink-soft)] ring-1 ring-inset ring-[var(--color-line)]">
                <Sun aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn-600" />
                <p>
                  {t(
                    "A clear photo in daylight gives the most reliable answer. If the app is unsure, it will say so instead of guessing.",
                  )}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>

      <DiseaseHistory
        scans={history}
        loading={historyLoading}
        error={historyError}
        selectedId={result?.id ?? null}
        deletingId={deletingId}
        onSelect={handleSelectScan}
        onDelete={(id) => void handleDeleteScan(id)}
      />
    </div>
  );
}

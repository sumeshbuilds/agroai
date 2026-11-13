"use client";

import {
  Bug,
  CalendarClock,
  Camera,
  CheckCircle2,
  FlaskConical,
  Leaf,
  Microscope,
  ShieldCheck,
  Sprout,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/cn";
import {
  confidencePercent,
  DISEASE_DISCLAIMER,
  HEALTH_STATUS_META,
  IMAGE_QUALITY_META,
  PATHOGEN_META,
  plantPartLabel,
  SEVERITY_META,
  SPREAD_RISK_META,
  URGENCY_META,
  type DiseaseScanDTO,
} from "@/lib/disease";
import { formatDateTime } from "@/lib/format";
import { useOdiaText } from "@/lib/hooks/use-odia-text";
import { useI18n } from "@/lib/i18n";

const STATUS_STYLE = {
  healthy: {
    banner: "bg-leaf-100 text-leaf-700",
    icon: "bg-leaf-600 text-white",
    bar: "bg-leaf-500",
  },
  diseased: {
    banner: "bg-danger-100 text-danger-700",
    icon: "bg-danger-500 text-white",
    bar: "bg-danger-500",
  },
  uncertain: {
    banner: "bg-warn-100 text-warn-700",
    icon: "bg-warn-500 text-white",
    bar: "bg-warn-500",
  },
} as const;

const TONE_CHIP = {
  leaf: "chip-brand",
  warn: "chip-warn",
  danger: "chip-danger",
  muted: "bg-[var(--card-muted)] text-[var(--color-ink-soft)]",
} as const;

export function DiseaseResultCard({
  scan,
  imageUrl,
  onRetake,
}: {
  scan: DiseaseScanDTO;
  imageUrl: string;
  onRetake?: () => void;
}) {
  const { t } = useI18n();
  const meta = HEALTH_STATUS_META[scan.healthStatus];
  const style = STATUS_STYLE[scan.healthStatus];
  const percent = confidencePercent(scan.confidence);
  const severity = SEVERITY_META[scan.severity];
  const pathogen = PATHOGEN_META[scan.pathogenType];
  const urgency = URGENCY_META[scan.urgency];
  const spread = SPREAD_RISK_META[scan.spreadRisk];
  const imageQuality = IMAGE_QUALITY_META[scan.imageQuality];
  const notPlant = scan.subject === "not_plant";
  const say = useOdiaText([
    scan.summary,
    scan.retakeAdvice,
    scan.monitoring,
    scan.diseaseName,
    ...scan.symptoms,
    ...scan.immediateActions,
    ...scan.organicTreatment,
    ...scan.chemicalTreatment,
    ...scan.prevention,
    ...scan.lookAlikes,
    ...scan.differentials.flatMap((item) => [item.name, item.note]),
  ]);

  const title = notPlant
    ? t("This does not look like a plant")
    : scan.healthStatus === "healthy"
      ? t("No disease seen in this photo")
      : scan.healthStatus === "uncertain"
        ? scan.diseaseName ??
          t("The photo is not clear enough to name the problem")
        : scan.diseaseName ?? t("Possible plant health problem");

  const StatusIcon = notPlant
    ? TriangleAlert
    : scan.healthStatus === "healthy"
      ? CheckCircle2
      : scan.healthStatus === "diseased"
        ? TriangleAlert
        : Microscope;

  const sourceLabel =
    scan.source.includes("gemini") && scan.source.includes("groq")
      ? t("Gemini + Groq cross-check")
      : scan.source.includes("classifier") && scan.source.includes("gemini")
        ? t("Gemini + image classifier")
        : scan.source.includes("classifier") && scan.source.includes("groq")
          ? t("Groq + image classifier")
          : scan.source === "groq"
            ? t("Groq vision")
            : scan.source === "classifier"
              ? t("Image classifier")
              : t("Gemini vision");

  return (
    <article
      className="card animate-rise overflow-hidden"
      aria-live="polite"
      aria-label={t("Scan result")}
    >
      <header className={cn("flex items-start gap-3 p-5", style.banner)}>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            style.icon,
          )}
        >
          <StatusIcon aria-hidden className="h-5 w-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] opacity-80">
            {notPlant ? t("Not a plant photo") : t(meta.label)}
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight">{title}</h2>
          <p className="mt-1 text-xs opacity-80">
            {scan.cropName ? t(scan.cropName) : t("Plant")} ·{" "}
            {t(plantPartLabel(scan.plantPart))}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold leading-none tabular-nums">
            {percent}%
          </p>
          <p className="mt-1 text-[0.62rem] font-medium uppercase tracking-wide opacity-75">
            {t("Confidence")}
          </p>
        </div>
      </header>

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap gap-2">
          {scan.healthStatus !== "healthy" && !notPlant ? (
            <span className="chip chip-violet">
              <span aria-hidden>{pathogen.emoji}</span>
              {t(pathogen.label)}
            </span>
          ) : null}
          {!notPlant ? (
            <span className={cn("chip", TONE_CHIP[severity.tone])}>
              {t(severity.label)}
            </span>
          ) : null}
          {scan.healthStatus !== "healthy" && !notPlant ? (
            <span className={cn("chip", TONE_CHIP[urgency.tone])}>
              {t(urgency.label)}
            </span>
          ) : null}
          {scan.spreadRisk !== "unknown" && scan.healthStatus !== "healthy" ? (
            <span className={cn("chip", TONE_CHIP[spread.tone])}>
              {t(spread.label)}
            </span>
          ) : null}
          {scan.imageQuality !== "unknown" ? (
            <span className={cn("chip", TONE_CHIP[imageQuality.tone])}>
              {t(imageQuality.label)}
            </span>
          ) : null}
          <span className="chip chip-info">{t(plantPartLabel(scan.plantPart))}</span>
          <span className="chip bg-[var(--card-muted)] text-[var(--color-ink-soft)]">
            {sourceLabel}
          </span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* The image is auth-scoped by the API route. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={t("Scanned {part}", { part: t(plantPartLabel(scan.plantPart)) })}
            className="h-32 w-full shrink-0 rounded-xl object-cover ring-1 ring-[var(--color-line)] sm:h-28 sm:w-36"
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="text-sm leading-relaxed">{say(scan.summary)}</p>
            <p className="muted mt-2 text-[0.7rem] tabular-nums">
              {formatDateTime(scan.createdAt)}
            </p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 text-xs font-medium">
            <span className="text-[var(--color-ink-soft)]">
              {t("Scan confidence")}
            </span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--card-muted)]"
            role="progressbar"
            aria-label={t("Scan confidence")}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("progress-fill h-full rounded-full", style.bar)}
              style={{ transform: `scaleX(${percent / 100})` }}
              aria-hidden
            />
          </div>
          {percent < 45 && !notPlant ? (
            <p className="mt-2 flex items-start gap-1.5 text-[0.7rem] leading-relaxed text-warn-700">
              <TriangleAlert aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              {t(
                "Low confidence — take a closer photo in good light for a better answer.",
              )}
            </p>
          ) : null}
        </div>

        {scan.retakeAdvice ? (
          <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-panel)] p-3.5 text-xs leading-relaxed text-[var(--color-ink-soft)] ring-1 ring-inset ring-[var(--color-line)]">
            <Camera
              aria-hidden
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-ink-soft)]"
            />
            <div className="min-w-0">
              <p className="font-semibold text-[var(--color-ink)]">
                {t("How to get a clearer photo")}
              </p>
              <p className="mt-1">{say(scan.retakeAdvice)}</p>
              {onRetake ? (
                <button
                  type="button"
                  onClick={onRetake}
                  className="btn btn-secondary mt-2.5 min-h-9 px-3 text-xs"
                >
                  <Camera aria-hidden className="h-3.5 w-3.5" />
                  {t("Take a better photo")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {scan.symptoms.length > 0 ? (
          <ResultSection
            icon={<Leaf aria-hidden className="h-3.5 w-3.5" />}
            title={t("What the scan shows")}
            items={scan.symptoms.map(say)}
          />
        ) : null}

        {scan.immediateActions.length > 0 ? (
          <ResultSection
            icon={<Sprout aria-hidden className="h-3.5 w-3.5" />}
            title={t("Do this now")}
            items={scan.immediateActions.map(say)}
            ordered
          />
        ) : null}

        {scan.differentials.length > 0 ? (
          <section>
            <div className="flex items-center gap-2 text-[var(--color-ink-soft)]">
              <Microscope aria-hidden className="h-3.5 w-3.5" />
              <h3 className="text-xs font-semibold">{t("Other likely causes")}</h3>
            </div>
            <ul className="mt-2 space-y-2.5">
              {scan.differentials.map((item) => {
                const itemPercent = confidencePercent(item.confidence);
                return (
                  <li key={item.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">{say(item.name)}</span>
                      <span className="text-[0.68rem] tabular-nums text-[var(--color-ink-soft)]">
                        {itemPercent}%
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--card-muted)]"
                      role="progressbar"
                      aria-label={item.name}
                      aria-valuenow={itemPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="progress-fill h-full rounded-full bg-[var(--color-ink-soft)]/40"
                        style={{ transform: `scaleX(${itemPercent / 100})` }}
                        aria-hidden
                      />
                    </div>
                    {item.note ? (
                      <p className="mt-1 text-[0.7rem] leading-relaxed text-[var(--color-ink-soft)]">
                        {say(item.note)}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {scan.organicTreatment.length > 0 ? (
            <ResultSection
              icon={<Leaf aria-hidden className="h-3.5 w-3.5" />}
              title={t("Low-cost / organic options")}
              items={scan.organicTreatment.map(say)}
              compact
            />
          ) : null}
          {scan.chemicalTreatment.length > 0 ? (
            <div className="rounded-xl bg-warn-100/60 p-3.5">
              <div className="flex items-center gap-2 text-warn-700">
                <FlaskConical aria-hidden className="h-3.5 w-3.5" />
                <h3 className="text-xs font-semibold">
                  {t("Chemical option")}
                </h3>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-warn-700">
                {scan.chemicalTreatment.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Bug
                      aria-hidden
                      className="mt-0.5 h-3 w-3 shrink-0 opacity-70"
                    />
                    {say(item)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-warn-500/20 pt-2 text-[0.66rem] leading-relaxed text-warn-700/80">
                {t(
                  "Use only as a last resort. Follow the product label, wear protective clothing and respect the pre-harvest interval.",
                )}
              </p>
            </div>
          ) : null}
        </div>

        {scan.monitoring ? (
          <div className="flex items-start gap-2.5 rounded-xl bg-leaf-100/60 p-3.5 text-xs leading-relaxed text-leaf-700 ring-1 ring-inset ring-leaf-500/20">
            <CalendarClock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">{t("Check the same plant again")}</p>
              <p className="mt-0.5">{say(scan.monitoring)}</p>
            </div>
          </div>
        ) : null}

        {scan.prevention.length > 0 ? (
          <ResultSection
            icon={<ShieldCheck aria-hidden className="h-3.5 w-3.5" />}
            title={t("Prevent it next time")}
            items={scan.prevention.map(say)}
          />
        ) : null}

        {scan.lookAlikes.length > 0 ? (
          <div>
            <h3 className="text-xs font-semibold text-[var(--color-ink-soft)]">
              {t("Could also be")}
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {scan.lookAlikes.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-[var(--card-muted)] px-2.5 py-1 text-[0.7rem]"
                >
                  {say(item)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="border-t border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3.5">
        <div className="flex items-start gap-2 text-[0.68rem] leading-relaxed text-[var(--color-ink-soft)]">
          <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{t(DISEASE_DISCLAIMER)}</p>
        </div>
        {onRetake ? (
          <button
            type="button"
            onClick={onRetake}
            className="btn btn-secondary mt-3 min-h-9 px-3 text-xs"
          >
            <Camera aria-hidden className="h-3.5 w-3.5" />
            {t("Scan another plant part")}
          </button>
        ) : null}
      </footer>
    </article>
  );
}

function ResultSection({
  icon,
  title,
  items,
  ordered = false,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  ordered?: boolean;
  compact?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 text-[var(--color-ink-soft)]">
        {icon}
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>
      <ul className={cn("mt-2 space-y-2 text-sm leading-relaxed", compact && "text-xs")}>
        {items.map((item, index) =>
          ordered ? (
            <li key={item} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-[0.65rem] font-semibold text-leaf-700 tabular-nums">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ) : (
            <li key={item} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-500"
              />
              <span>{item}</span>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

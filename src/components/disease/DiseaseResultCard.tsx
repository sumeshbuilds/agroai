"use client";

import {
  Bug,
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
  PATHOGEN_META,
  plantPartLabel,
  SEVERITY_META,
  type DiseaseScanDTO,
} from "@/lib/disease";
import { formatDateTime } from "@/lib/format";
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

const SEVERITY_CHIP = {
  leaf: "chip-brand",
  warn: "chip-warn",
  danger: "chip-danger",
  muted: "bg-[var(--card-muted)] text-[var(--color-ink-soft)]",
} as const;

export function DiseaseResultCard({
  scan,
  imageUrl,
}: {
  scan: DiseaseScanDTO;
  imageUrl: string;
}) {
  const { t } = useI18n();
  const meta = HEALTH_STATUS_META[scan.healthStatus];
  const style = STATUS_STYLE[scan.healthStatus];
  const percent = confidencePercent(scan.confidence);
  const severity = SEVERITY_META[scan.severity];
  const pathogen = PATHOGEN_META[scan.pathogenType];

  const title =
    scan.healthStatus === "healthy"
      ? t("No disease seen in this photo")
      : scan.healthStatus === "uncertain"
        ? scan.diseaseName ??
          t("The photo is not clear enough to name the problem")
        : scan.diseaseName ?? t("Possible plant health problem");

  const StatusIcon =
    scan.healthStatus === "healthy"
      ? CheckCircle2
      : scan.healthStatus === "diseased"
        ? TriangleAlert
        : Microscope;

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
            {t(meta.label)}
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
          {scan.healthStatus !== "healthy" ? (
            <span className="chip chip-violet">
              <span aria-hidden>{pathogen.emoji}</span>
              {t(pathogen.label)}
            </span>
          ) : null}
          <span className={cn("chip", SEVERITY_CHIP[severity.tone])}>
            {t(severity.label)}
          </span>
          <span className="chip chip-info">{t(plantPartLabel(scan.plantPart))}</span>
          <span className="chip bg-[var(--card-muted)] text-[var(--color-ink-soft)]">
            {scan.source === "groq" ? t("Groq vision") : t("Gemini vision")}
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
            <p className="text-sm leading-relaxed">{scan.summary}</p>
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
          {percent < 45 ? (
            <p className="mt-2 flex items-start gap-1.5 text-[0.7rem] leading-relaxed text-warn-700">
              <TriangleAlert aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              {t(
                "Low confidence — take a closer photo in good light for a better answer.",
              )}
            </p>
          ) : null}
        </div>

        {scan.symptoms.length > 0 ? (
          <ResultSection
            icon={<Leaf aria-hidden className="h-3.5 w-3.5" />}
            title={t("What the scan shows")}
            items={scan.symptoms}
          />
        ) : null}

        {scan.immediateActions.length > 0 ? (
          <ResultSection
            icon={<Sprout aria-hidden className="h-3.5 w-3.5" />}
            title={t("Do this now")}
            items={scan.immediateActions}
            ordered
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {scan.organicTreatment.length > 0 ? (
            <ResultSection
              icon={<Leaf aria-hidden className="h-3.5 w-3.5" />}
              title={t("Low-cost / organic options")}
              items={scan.organicTreatment}
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
                    {item}
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

        {scan.prevention.length > 0 ? (
          <ResultSection
            icon={<ShieldCheck aria-hidden className="h-3.5 w-3.5" />}
            title={t("Prevent it next time")}
            items={scan.prevention}
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
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <footer className="flex items-start gap-2 border-t border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3.5 text-[0.68rem] leading-relaxed text-[var(--color-ink-soft)]">
        <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>{t(DISEASE_DISCLAIMER)}</p>
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

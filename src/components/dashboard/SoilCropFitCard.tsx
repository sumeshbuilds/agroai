"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  CloudRain,
  Droplets,
  FlaskConical,
  Loader2,
  Sprout,
  Thermometer,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
import {
  FIT_RATING_META,
  SOIL_TEXTURE_META,
  type ClimateSummary,
  type CropSuitability,
  type SoilAnalysis,
  type SoilTestInput,
  type SoilTexture,
} from "@/lib/soil";

const FIELD_CLASS =
  "input min-h-10 w-full rounded-lg border border-[var(--color-line-strong)] bg-[var(--card)] px-2.5 text-sm tabular-nums";

const EMPTY_FORM = {
  ph: "",
  ec: "",
  organicCarbon: "",
  nitrogen: "",
  phosphorus: "",
  potassium: "",
  texture: "",
};

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function SoilCropFitCard({
  farmId,
  soil,
  climate,
  cropFit,
  onSaved,
  compact = false,
}: {
  farmId: number;
  soil: SoilAnalysis;
  climate: ClimateSummary | null;
  cropFit: CropSuitability[];
  onSaved?: () => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFormOpen(false);
      setSaved(false);
      setError(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [farmId]);

  const startEditing = () => {
    setForm({
      ph: soil.ph === null ? "" : String(soil.ph),
      ec: soil.ec === null ? "" : String(soil.ec),
      organicCarbon:
        soil.organicCarbon === null ? "" : String(soil.organicCarbon),
      nitrogen: soil.nitrogen === null ? "" : String(soil.nitrogen),
      phosphorus: soil.phosphorus === null ? "" : String(soil.phosphorus),
      potassium: soil.potassium === null ? "" : String(soil.potassium),
      texture: soil.texture ?? "",
    });
    setError(null);
    setSaved(false);
    setFormOpen(true);
  };

  const submit = async () => {
    const payload: SoilTestInput = {
      ph: toNumber(form.ph),
      ec: toNumber(form.ec),
      organicCarbon: toNumber(form.organicCarbon),
      nitrogen: toNumber(form.nitrogen),
      phosphorus: toNumber(form.phosphorus),
      potassium: toNumber(form.potassium),
      texture: (form.texture || null) as SoilTexture | null,
      testedAt: new Date().toISOString().slice(0, 10),
    };

    if (
      payload.ph === null &&
      payload.ec === null &&
      payload.organicCarbon === null &&
      payload.nitrogen === null &&
      payload.phosphorus === null &&
      payload.potassium === null &&
      payload.texture === null
    ) {
      setError("Enter at least one value from the soil card.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.saveFarmSoil(farmId, payload);
      setSaved(true);
      setFormOpen(false);
      onSaved?.();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not save the soil values. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const best = cropFit.slice(0, compact ? 3 : 4);

  return (
    <section className="card p-5" aria-label={t("Soil and crop fit")}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="icon-tile shrink-0">
            <FlaskConical className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {t("Soil & what to grow")}
            </h2>
            <p className="muted mt-1 text-xs leading-relaxed">
              {t("Ranked for your soil test, rainfall and temperature.")}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "chip",
            soil.source === "soil-health-card" ? "chip-lime" : "chip-warn",
          )}
        >
          {soil.source === "soil-health-card"
            ? t("Soil card values")
            : t("Estimate only")}
        </span>
      </header>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-leaf-100">
          <span className="text-xl font-bold leading-none tabular-nums text-leaf-700">
            {soil.score}
          </span>
          <span className="mt-0.5 text-[0.55rem] font-semibold uppercase tracking-wide text-leaf-700/70">
            {t("Soil score")}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            {soil.textureLabel ? (
              <span className="chip chip-brand">{t(soil.textureLabel)}</span>
            ) : null}
            <span
              className={cn(
                "chip",
                soil.phStatus === "neutral"
                  ? "chip-lime"
                  : soil.phStatus === "unknown"
                    ? "chip-info"
                    : "chip-warn",
              )}
            >
              {soil.ph !== null
                ? `pH ${soil.ph.toFixed(1)}`
                : t("pH not entered")}
            </span>
            {soil.organicCarbon !== null ? (
              <span className="chip chip-info">
                OC {soil.organicCarbon.toFixed(2)}%
              </span>
            ) : null}
          </div>
          <p className="muted mt-2 text-[0.74rem] leading-snug">
            {t(soil.summary)}
          </p>
        </div>
      </div>

      {soil.issues.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {soil.issues.slice(0, compact ? 1 : 2).map((issue) => (
            <li
              key={issue.key}
              className={cn(
                "rounded-lg px-2.5 py-2 text-[0.72rem] leading-snug",
                issue.severity === "warning"
                  ? "bg-warn-100/70 text-warn-700"
                  : "bg-info-100 text-info-700",
              )}
            >
              <span className="font-semibold">{t(issue.title)}</span>
              <span className="mt-0.5 block opacity-90">{t(issue.action)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {climate ? (
        <div className="muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] tabular-nums">
          {climate.annualRainfallMm !== null ? (
            <span className="inline-flex items-center gap-1">
              <CloudRain className="h-3 w-3" />
              {t("{mm} mm / year", { mm: climate.annualRainfallMm })}
            </span>
          ) : null}
          {climate.meanTempC !== null ? (
            <span className="inline-flex items-center gap-1">
              <Thermometer className="h-3 w-3" />
              {t("{temp}°C mean", { temp: climate.meanTempC })}
            </span>
          ) : null}
          <span>{t("12-month reanalysis")}</span>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          {t("Best crops for this field")}
        </p>
        {best.map((entry) => (
          <CropFitRow key={entry.crop.name} entry={entry} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] pt-3">
        <Button
          variant="secondary"
          onClick={startEditing}
          className="min-h-10 text-xs"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          {soil.source === "soil-health-card"
            ? t("Update soil card")
            : t("Add soil card values")}
        </Button>
        <a
          href="https://soilhealth.dac.gov.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.7rem] font-medium text-accent-700 underline-offset-4 hover:underline"
        >
          {t("What is a Soil Health Card?")}
        </a>
        {saved ? (
          <span className="chip chip-lime ml-auto">{t("Saved")}</span>
        ) : null}
      </div>

      {formOpen ? (
        <div className="mt-4 rounded-xl border border-[var(--color-line)] bg-[var(--card-muted)]/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("Soil Health Card values")}</p>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              aria-label={t("Close soil form")}
              className="icon-btn h-8 w-8 border-transparent bg-transparent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="muted mt-1 text-[0.7rem] leading-snug">
            {t(
              "Copy the values printed on your card. Leave anything you cannot find blank.",
            )}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <SoilField label={t("pH")} hint="0–14">
              <input
                className={FIELD_CLASS}
                inputMode="decimal"
                value={form.ph}
                onChange={(event) => setForm({ ...form, ph: event.target.value })}
                placeholder="6.8"
              />
            </SoilField>
            <SoilField label={t("EC (dS/m)")} hint="0–20">
              <input
                className={FIELD_CLASS}
                inputMode="decimal"
                value={form.ec}
                onChange={(event) => setForm({ ...form, ec: event.target.value })}
                placeholder="0.4"
              />
            </SoilField>
            <SoilField label={t("Organic carbon (%)")} hint="0–10">
              <input
                className={FIELD_CLASS}
                inputMode="decimal"
                value={form.organicCarbon}
                onChange={(event) =>
                  setForm({ ...form, organicCarbon: event.target.value })
                }
                placeholder="0.62"
              />
            </SoilField>
            <SoilField label={t("Nitrogen (kg/ha)")} hint="N">
              <input
                className={FIELD_CLASS}
                inputMode="numeric"
                value={form.nitrogen}
                onChange={(event) =>
                  setForm({ ...form, nitrogen: event.target.value })
                }
                placeholder="280"
              />
            </SoilField>
            <SoilField label={t("Phosphorus (kg/ha)")} hint="P₂O₅">
              <input
                className={FIELD_CLASS}
                inputMode="numeric"
                value={form.phosphorus}
                onChange={(event) =>
                  setForm({ ...form, phosphorus: event.target.value })
                }
                placeholder="18"
              />
            </SoilField>
            <SoilField label={t("Potassium (kg/ha)")} hint="K₂O">
              <input
                className={FIELD_CLASS}
                inputMode="numeric"
                value={form.potassium}
                onChange={(event) =>
                  setForm({ ...form, potassium: event.target.value })
                }
                placeholder="160"
              />
            </SoilField>
            <SoilField label={t("Texture")} hint={t("if known")}>
              <select
                className="select min-h-10 w-full text-sm"
                value={form.texture}
                onChange={(event) =>
                  setForm({ ...form, texture: event.target.value })
                }
              >
                <option value="">{t("Not sure")}</option>
                {(Object.keys(SOIL_TEXTURE_META) as SoilTexture[]).map((key) => (
                  <option key={key} value={key}>
                    {t(SOIL_TEXTURE_META[key].label)}
                  </option>
                ))}
              </select>
            </SoilField>
          </div>

          {error ? (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
              {t(error)}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} disabled={saving} className="min-h-10 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5" />}
              {saving ? t("Saving...") : t("Save soil values")}
            </Button>
            <p className="muted text-[0.65rem] leading-snug">
              {t(
                "No dose is invented here. The crop plan adds a general direction; confirm the exact dose with your KVK.",
              )}
            </p>
          </div>
        </div>
      ) : null}

      <p className="muted mt-3 flex items-start gap-1.5 text-[0.66rem] leading-relaxed">
        <Droplets className="mt-0.5 h-3 w-3 shrink-0" />
        {t(
          "Crop fit is a rule-based guide, not a guarantee. Local variety choice, market price and water availability still matter.",
        )}
      </p>
    </section>
  );
}

function SoilField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-baseline justify-between gap-1 text-[0.68rem] font-medium text-[var(--color-ink-soft)]">
        <span className="truncate">{label}</span>
        {hint ? <span className="shrink-0 opacity-70">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function CropFitRow({ entry }: { entry: CropSuitability }) {
  const { t } = useI18n();
  const meta = FIT_RATING_META[entry.rating];
  const tone =
    meta.tone === "leaf"
      ? "chip-lime"
      : meta.tone === "warn"
        ? "chip-warn"
        : meta.tone === "danger"
          ? "chip-danger"
          : "chip-info";

  return (
    <div className="rounded-xl border border-[var(--color-line)] p-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-lg leading-none">
          {entry.crop.emoji}
        </span>
        <p className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold">
          {t(entry.crop.name)}
        </p>
        <span className={cn("chip px-1.5 py-0.5 text-[0.6rem]", tone)}>
          {t(meta.label)}
        </span>
        <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums">
          {entry.score}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--card-muted)]">
        <div
          className={cn(
            "h-full rounded-full",
            entry.score >= 76
              ? "bg-leaf-500"
              : entry.score >= 62
                ? "bg-leaf-400"
                : entry.score >= 46
                  ? "bg-warn-500"
                  : "bg-danger-500",
          )}
          style={{ width: `${entry.score}%` }}
        />
      </div>
      <p className="muted mt-1.5 text-[0.68rem] leading-snug">
        {entry.reasons[0] ? t(entry.reasons[0]) : t(entry.crop.note)}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[0.62rem] font-medium text-[var(--color-ink-soft)]">
        <span>{t("Sow {months}", { months: entry.sowingWindow })}</span>
        <span aria-hidden>·</span>
        <span>{t("{days} days", { days: entry.durationDays })}</span>
        <span aria-hidden>·</span>
        <span>{t("{need} water", { need: entry.waterNeed })}</span>
        {entry.cautions[0] ? (
          <>
            <span aria-hidden>·</span>
            <span className="text-warn-700">{t(entry.cautions[0])}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function SoilCropFitTeaser({ onOpen }: { onOpen?: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--card-muted)]/50"
    >
      <span className="icon-tile">
        <Sprout className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {t("Which crop suits this soil?")}
        </span>
        <span className="muted mt-0.5 block text-[0.72rem] leading-snug">
          {t("Add your Soil Health Card values for a ranked answer.")}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-ink-soft)]" />
    </button>
  );
}

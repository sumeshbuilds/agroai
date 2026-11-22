"use client";

import { BadgeCheck, Flower2, Leaf, Layers, ScanSearch } from "lucide-react";

import { cn } from "@/lib/cn";
import { confidencePercent, type PlantIdentification } from "@/lib/disease";
import { useI18n } from "@/lib/i18n";

const ORGAN_LABELS: Record<string, string> = {
  leaf: "Leaf",
  flower: "Flower",
  fruit: "Fruit",
  bark: "Bark",
  habit: "Whole plant",
  auto: "Auto-detected",
};

function organLabel(organ: string | null): string | null {
  if (!organ) return null;
  return ORGAN_LABELS[organ.toLowerCase()] ?? organ;
}

/**
 * The botanical identification block: what Pl@ntNet thinks the plant is
 * (species, family, common names, match score) and the disease signatures it
 * matched. Shown above the AI diagnosis so "what is this plant?" is answered
 * even when the disease model finds nothing.
 */
export function PlantIdCard({
  identification,
  translate,
}: {
  identification: PlantIdentification;
  /** Runtime translator for model/Pl@ntNet text (Odia); identity by default. */
  translate?: (text: string) => string;
}) {
  const { t } = useI18n();
  const say = translate ?? ((text: string) => text);
  const percent = confidencePercent(identification.score);
  const organ = organLabel(identification.organ);
  const rejected = identification.rejected;
  const confident = identification.score >= 0.5;
  const diseases = identification.diseases;
  const alternatives = identification.alternatives;

  if (rejected) {
    return (
      <section className="rounded-2xl bg-warn-100/70 p-4 ring-1 ring-inset ring-warn-500/20">
        <div className="flex items-center gap-2.5 text-warn-700">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-warn-100">
            <ScanSearch aria-hidden className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {t("Pl@ntNet could not find a plant")}
            </p>
            <p className="text-xs opacity-90">
              {t(
                "Fill the frame with a leaf, flower or fruit and use daylight.",
              )}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl ring-1 ring-inset ring-[var(--color-line)]">
      <div className="flex flex-wrap items-start gap-3 border-b border-[var(--color-line)] bg-[var(--color-leaf-100)]/70 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-leaf-600)] text-white">
          <Flower2 aria-hidden className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-leaf-700/80">
            {t("Plant identified")}
          </p>
          <h3 className="mt-0.5 truncate text-lg font-semibold italic leading-tight text-leaf-700">
            {identification.scientificName ?? t("Unnamed plant")}
          </h3>
          {identification.commonNames.length > 0 ? (
            <p className="mt-0.5 text-sm text-leaf-700/90">
              {identification.commonNames
                .slice(0, 3)
                .map((name) => say(name))
                .join(" · ")}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {identification.family ? (
              <span className="chip chip-brand">
                <Layers aria-hidden className="h-3 w-3" />
                {identification.family}
              </span>
            ) : null}
            {identification.genus ? (
              <span className="chip bg-[var(--card-muted)] text-[var(--color-ink-soft)]">
                {identification.genus}
              </span>
            ) : null}
            {organ ? (
              <span className="chip bg-[var(--card-muted)] text-[var(--color-ink-soft)]">
                <Leaf aria-hidden className="h-3 w-3" />
                {t(organ)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-2xl font-semibold leading-none tabular-nums",
              confident ? "text-leaf-700" : "text-warn-700",
            )}
          >
            {percent}%
          </p>
          <p className="mt-1 text-[0.62rem] font-medium uppercase tracking-wide text-leaf-700/70">
            {t("Species match")}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--card-muted)]"
            role="progressbar"
            aria-label={t("Species match")}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                "progress-fill h-full rounded-full",
                confident ? "bg-leaf-500" : "bg-warn-500",
              )}
              style={{ transform: `scaleX(${percent / 100})` }}
              aria-hidden
            />
          </div>
          {!confident ? (
            <p className="muted mt-2 text-[0.7rem] leading-relaxed">
              {t(
                "The match is not conclusive. A closer photo of a flower or fruit usually helps.",
              )}
            </p>
          ) : null}
        </div>

        {diseases.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 text-[var(--color-ink-soft)]">
              <ScanSearch aria-hidden className="h-3.5 w-3.5" />
              <h4 className="text-xs font-semibold">
                {t("Pl@ntNet disease match")}
              </h4>
            </div>
            <ul className="mt-2 space-y-1.5">
              {diseases.slice(0, 3).map((disease) => (
                <li
                  key={`${disease.code ?? disease.label}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-panel)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {say(disease.label)}
                    </span>
                    {disease.code ? (
                      <span className="muted text-[0.65rem] uppercase tracking-wide">
                        EPPO {disease.code}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--color-ink-soft)]">
                    {confidencePercent(disease.score)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-[var(--color-panel)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
            <BadgeCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf-600" />
            {t(
              "No disease signature matched in the Pl@ntNet database. That is not proof the plant is healthy — check the AI diagnosis below.",
            )}
          </p>
        )}

        {alternatives.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-[var(--color-ink-soft)]">
              {t("Other possible species")}
            </h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {alternatives.map((match) => (
                <span
                  key={match.scientificName}
                  className="chip bg-[var(--card-muted)] text-[var(--color-ink-soft)]"
                  title={`${confidencePercent(match.score)}%`}
                >
                  <span className="italic">{match.scientificName}</span>
                  <span className="tabular-nums opacity-70">
                    {confidencePercent(match.score)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className="border-t border-[var(--color-line)] pt-2.5 text-[0.66rem] leading-relaxed text-[var(--color-ink-soft)]">
          {t("Identification by Pl@ntNet")}
          {identification.engineVersion
            ? ` · ${identification.engineVersion}`
            : ""}
          {identification.project && identification.project !== "all"
            ? ` · ${identification.project}`
            : ""}
        </p>
      </div>
    </section>
  );
}

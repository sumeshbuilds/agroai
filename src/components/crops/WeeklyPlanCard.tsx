"use client";

import { ExternalLink, Languages, RefreshCw, ShoppingBasket, Sparkles } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { PestRiskLevel } from "@/lib/pest-risk";
import {
  SHOPPING_CATEGORY_META,
  getWeeklyShoppingList,
} from "@/lib/recommendations";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";

/**
 * Section metadata, matched on the English heading that the prompt fixes.
 * Odia headings are kept in English by the translator so this mapping is
 * language-independent.
 */
const SECTIONS: Array<{
  match: string;
  emoji: string;
  label: string;
  tone: string;
}> = [
  { match: "irrigation", emoji: "💧", label: "Irrigation", tone: "bg-info-100" },
  {
    match: "fertil",
    emoji: "🧪",
    label: "Fertilizer & Spraying",
    tone: "bg-warn-100",
  },
  {
    match: "pest",
    emoji: "🐛",
    label: "Pest & Disease Watch",
    tone: "bg-danger-100",
  },
  {
    match: "field",
    emoji: "🚜",
    label: "Best Field-Work Days",
    tone: "bg-leaf-100",
  },
  { match: "next", emoji: "👉", label: "Next Step", tone: "bg-accent-50" },
];

interface Section {
  heading: string;
  body: string;
}

/** Splits "## Heading" markdown into cards; falls back to one text block. */
function parseSections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;
  const preamble: string[] = [];

  for (const raw of lines) {
    const heading = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1].trim(), body: "" };
      continue;
    }
    if (current) current.body += `${raw}\n`;
    else preamble.push(raw);
  }
  if (current) sections.push(current);

  if (sections.length === 0) {
    const text = preamble.join("\n").trim();
    return text ? [{ heading: "Plan", body: text }] : [];
  }

  const lead = preamble.join("\n").trim();
  if (lead) sections[0].body = `${lead}\n${sections[0].body}`;
  return sections.map((section) => ({
    heading: section.heading,
    body: section.body.trim(),
  }));
}

function metaFor(heading: string) {
  const lower = heading.toLowerCase();
  return (
    SECTIONS.find((entry) => lower.includes(entry.match)) ?? {
      match: "",
      emoji: "🌱",
      label: heading,
      tone: "bg-[var(--card-muted)]",
    }
  );
}

export function WeeklyPlanCard({
  report,
  crop,
  pestLevel,
  generating,
  onRefresh,
}: {
  report: WeeklyReportDTO;
  crop?: CropDTO | null;
  pestLevel?: PestRiskLevel | null;
  generating?: boolean;
  onRefresh?: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const odia = report.aiActionPlanOr?.trim() || null;
  // Follow the app language, but never show an empty card: fall back to English.
  const showOdia = lang === "or" && Boolean(odia);
  const text = showOdia ? odia! : report.aiActionPlan;

  const cropName = report.cropName ?? crop?.cropName ?? null;
  const sections = parseSections(text);
  const shopping = getWeeklyShoppingList({
    cropName: cropName ?? "your crop",
    advisory: report.aiActionPlan,
    pestLevel,
  });
  const showInputs = shopping.some(
    (item) => item.category === "pesticide" || item.category === "fertilizer",
  );

  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-snug">
              {cropName
                ? t("{crop} — weekly action plan", { crop: t(cropName) })
                : t("Weekly action plan")}
            </h3>
            <p className="muted mt-1 text-xs">
              {t("Generated {time}", { time: t(formatRelative(report.createdAt)) })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(showOdia ? "en" : "or")}
            className={cn(
              "chip gap-1 transition-colors",
              showOdia ? "chip-brand" : "chip-lime",
            )}
            title={
              odia
                ? t("Switch language")
                : t("The Odia version is not ready for this plan yet.")
            }
          >
            <Languages className="h-3.5 w-3.5" />
            {showOdia ? t("Read in English") : t("Say it in Odia")}
          </button>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={generating}
              className="btn btn-ghost min-h-8 px-2 text-[0.7rem]"
            >
              <RefreshCw className={cn("h-3 w-3", generating && "animate-spin")} />
              {t("Refresh")}
            </button>
          ) : null}
        </div>
      </header>

      {report.note ? <Callout tone="info">{report.note}</Callout> : null}

      {lang === "or" && !odia ? (
        <Callout tone="warn">
          {t(
            "This plan was written before Odia support. Refresh it to get an Odia version too.",
          )}
        </Callout>
      ) : null}

      <ol className="grid gap-2.5 lg:grid-cols-2">
        {sections.map((section, index) => {
          const meta = metaFor(section.heading);
          return (
            <li
              key={`${section.heading}-${index}`}
              className={cn(
                "flex gap-3 rounded-2xl border border-[var(--color-line)] p-3.5",
                index === sections.length - 1 && sections.length % 2 === 1
                  ? "lg:col-span-2"
                  : "",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[1.4rem] leading-none",
                  meta.tone,
                )}
              >
                {meta.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold leading-snug">
                  {t(meta.label)}
                </h4>
                <RichText text={section.body} />
              </div>
            </li>
          );
        })}
      </ol>

      {shopping.length > 0 ? (
        <section aria-label={t("Suggested inputs and equipment")} className="space-y-3">
          <header className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingBasket aria-hidden className="h-4 w-4 text-leaf-600" />
                {showInputs
                  ? t("Suggested for this plan")
                  : t("Equipment for the next step")}
              </h4>
              <p className="muted mt-1 text-xs">
                {t("Our advisory for each item. Price, seller and delivery are shown on Amazon.in.")}
              </p>
            </div>
            <span className="chip chip-brand">Amazon.in</span>
          </header>

          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {shopping.map((item) => {
              const meta = SHOPPING_CATEGORY_META[item.category];
              return (
                <article
                  key={item.id}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--card)] transition-shadow hover:shadow-[0_12px_24px_-20px_rgba(34,54,42,0.55)]"
                >
                  <div className="relative h-32 shrink-0 bg-white p-2">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-3xl">
                        🛒
                      </span>
                    )}
                    <span
                      className={cn(
                        "chip absolute left-1.5 top-1.5 px-1.5 py-0.5 text-[0.625rem] shadow-sm",
                        meta.tone,
                      )}
                    >
                      {t(meta.label)}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                    <h5 className="line-clamp-2 text-[0.8125rem] font-semibold leading-snug">
                      {t(item.title)}
                    </h5>
                    <p className="muted line-clamp-3 text-[0.7rem] leading-snug">
                      {t(item.detail)}
                    </p>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="btn mt-auto min-h-9 w-full gap-1.5 border-[#f0c14b] bg-[#ffd814] px-2 text-[0.75rem] text-[#111] hover:bg-[#f7ca00]"
                    >
                      {t("Buy now")}
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="muted text-[0.6875rem] leading-relaxed">
            {t("Buy now opens the Amazon.in product page. Price, seller and availability come from Amazon. Confirm the label, approved dose and safety interval before spraying.")}
          </p>
        </section>
      ) : null}
    </article>
  );
}

/** Bold and bullet text inside one section card. */
function RichText({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div className="mt-1 space-y-1">
      {lines.map((line, index) => {
        const bullet = /^[-*•]\s+(.*)$/.exec(line);
        const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
        if (bullet || numbered) {
          const content = bullet ? bullet[1] : numbered![2];
          return (
            <p key={index} className="flex gap-1.5 text-[0.8125rem] leading-relaxed">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-500" />
              <span className="min-w-0">{inline(content)}</span>
            </p>
          );
        }
        return (
          <p key={index} className="text-[0.8125rem] leading-relaxed">
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

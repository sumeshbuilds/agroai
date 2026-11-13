"use client";

import { ExternalLink, ShoppingBasket, Sparkles } from "lucide-react";

import { Callout } from "@/components/ui/Callout";
import { MarkdownLite } from "@/components/ui/MarkdownLite";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { CropDTO, WeeklyReportDTO } from "@/lib/types";
import type { PestRiskLevel } from "@/lib/pest-risk";
import {
  SHOPPING_CATEGORY_META,
  getWeeklyShoppingList,
} from "@/lib/recommendations";

export function ReportCard({
  report,
  crop,
  pestLevel,
  embedded = false,
}: {
  report: WeeklyReportDTO;
  /** Crop context, used to tailor the shopping suggestions. */
  crop?: CropDTO | null;
  pestLevel?: PestRiskLevel | null;
  /** Drops the outer card chrome when the report sits inside another panel. */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const cropName = report.cropName ?? crop?.cropName ?? null;
  const shopping = getWeeklyShoppingList({
    cropName: cropName ?? "your crop",
    advisory: report.aiActionPlan,
    pestLevel,
  });
  const showInputs = shopping.some(
    (item) => item.category === "pesticide" || item.category === "fertilizer",
  );

  return (
    <article
      className={cn(
        "space-y-5",
        embedded ? "" : "card p-5 sm:p-6",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {embedded ? null : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
              <Sparkles className="h-4.5 w-4.5" />
            </span>
          )}
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

        {report.source === "gemini" ? (
          <span className="chip chip-violet max-w-full whitespace-normal break-words">
            {t("Gemini · {model}", { model: report.model ?? "" })}
          </span>
        ) : report.source === "fallback" ? (
          <span className="chip chip-warn">{t("Rule-based fallback")}</span>
        ) : null}
      </header>

      {report.note ? <Callout tone="info">{report.note}</Callout> : null}

      <MarkdownLite text={report.aiActionPlan} />

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
                    {/* Local copy of the Amazon listing photo — cannot rot. */}
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
                      <span className="sr-only">
                        {" "}
                        {t("for {title} on Amazon.in (opens in a new tab)", {
                          title: t(item.title),
                        })}
                      </span>
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

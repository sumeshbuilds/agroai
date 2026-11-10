"use client";

import { useState } from "react";
import { Camera, ScanLine, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import {
  confidencePercent,
  HEALTH_STATUS_META,
  plantPartLabel,
  type DiseaseScanDTO,
} from "@/lib/disease";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const DOT = {
  healthy: "bg-leaf-500",
  diseased: "bg-danger-500",
  uncertain: "bg-warn-500",
} as const;

export function DiseaseHistory({
  scans,
  loading,
  error,
  selectedId,
  deletingId,
  onSelect,
  onDelete,
}: {
  scans: DiseaseScanDTO[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  deletingId: number | null;
  onSelect: (scan: DiseaseScanDTO) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useI18n();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  return (
    <section aria-label={t("Scan history")} className="space-y-4 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Recent scans")}</h2>
          <p className="muted mt-1 text-xs">
            {t("Your last plant-health checks, newest first.")}
          </p>
        </div>
        {scans.length > 0 ? (
          <span className="chip chip-brand">
            <Camera aria-hidden className="h-3 w-3" />
            {scans.length}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-danger-500/20 bg-danger-100 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      ) : null}

      {loading && scans.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse-soft rounded-2xl bg-[var(--card-muted)]"
            />
          ))}
        </div>
      ) : scans.length === 0 ? (
        <EmptyState
          icon={<ScanLine aria-hidden className="h-6 w-6" />}
          title={t("No scans yet")}
          description={t(
            "Your first plant photo will appear here with its diagnosis and action plan.",
          )}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {scans.map((scan) => {
            const meta = HEALTH_STATUS_META[scan.healthStatus];
            const title =
              scan.healthStatus === "healthy"
                ? t("Looks healthy")
                : scan.diseaseName ?? t(meta.label);
            const deleting = deletingId === scan.id;
            const confirming = pendingDeleteId === scan.id;

            return (
              <article
                key={scan.id}
                className={cn(
                  "card overflow-hidden transition-shadow",
                  selectedId === scan.id && "ring-2 ring-accent-500/40",
                )}
              >
                <div className="flex items-stretch gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => onSelect(scan)}
                    aria-label={t("Open scan")}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left"
                  >
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--card-muted)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={scan.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                          DOT[scan.healthStatus],
                        )}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {title}
                      </span>
                      <span className="muted mt-0.5 block truncate text-xs">
                        {scan.cropName ? t(scan.cropName) : t("Plant")} ·{" "}
                        {t(plantPartLabel(scan.plantPart))}
                      </span>
                      <span className="muted mt-1 flex items-center gap-1.5 text-[0.65rem] tabular-nums">
                        <span>{confidencePercent(scan.confidence)}%</span>
                        <span aria-hidden>·</span>
                        <span>{formatDateTime(scan.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingDeleteId(confirming ? null : scan.id)
                    }
                    aria-label={t("Delete scan")}
                    aria-expanded={confirming}
                    className="icon-btn mr-0.5 self-start border-transparent bg-transparent text-[var(--color-ink-soft)]"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </div>

                {confirming ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2">
                    <span className="text-xs font-medium">
                      {t("Delete this scan?")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onDelete(scan.id)}
                        disabled={deleting}
                        className="btn btn-danger min-h-9 px-2.5 text-xs"
                      >
                        {deleting ? t("Deleting…") : t("Delete")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="btn btn-secondary min-h-9 px-2.5 text-xs"
                      >
                        {t("Keep")}
                      </button>
                    </span>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

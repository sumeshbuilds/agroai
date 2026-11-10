"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Download,
  MapPin,
  Plus,
  Search,
  Sprout,
  X,
} from "lucide-react";

import { api, ApiError } from "@/lib/api-client";
import { formatLandArea } from "@/lib/format";
import type { CropDTO, FarmDTO } from "@/lib/types";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";

/* -------------------------------------------------------------------------
   WorkbenchBar — the reference-style top strip: contextual slot on the left,
   search / actions on the right. Pages compose it:
   <WorkbenchBar left={<FarmSwitcher …/>} />
------------------------------------------------------------------------- */

export function WorkbenchBar({
  left,
  className,
}: {
  left?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">{left}</div>
      <WorkbenchActions />
    </header>
  );
}

function WorkbenchActions() {
  const router = useRouter();
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellCount, setBellCount] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Unread camera alerts (bell badge) — quiet 45s poll.
  const loadAlerts = useCallback(async () => {
    try {
      const { unread } = await api.listCameraAlerts();
      setBellCount(unread ?? 0);
    } catch {
      setBellCount(0);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const kickoff = window.setTimeout(() => void loadAlerts(), 0);
    const timer = window.setInterval(() => {
      if (active) void loadAlerts();
    }, 45_000);
    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [loadAlerts]);

  // "/" opens the field search (the reference's "Type '/' to search").
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (typing) return;
      if (event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const exportData = async () => {
    setExporting(true);
    try {
      const [farmsRes, cropsRes] = await Promise.all([
        api.listFarms(),
        api.listCrops(),
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        source: "AgroAI field workstation",
        farms: farmsRes.farms,
        crops: cropsRes.crops,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `agroai-fields-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      router.push(
        `/crops?notice=${encodeURIComponent(
          cause instanceof ApiError ? cause.message : "Export failed.",
        )}`,
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="search-trigger hidden sm:inline-flex"
        title={t("Search fields and crops (press /)")}
      >
        <Search className="h-4 w-4" />
        <span>
          {t("Type")}{" "}
           <kbd className="rounded border border-[var(--color-line)] bg-[var(--card-muted)] px-1.5 py-0.5 text-xs">
            /
          </kbd>{" "}
          {t("to search")}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label={t("Search fields and crops")}
        className="icon-btn sm:hidden"
      >
        <Search className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => void exportData()}
        disabled={exporting}
        title={t("Export fields and crops as JSON")}
        className="toolbar-btn hidden disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex"
      >
        <Download className="h-4 w-4" />
        {exporting ? t("Exporting…") : t("Export")}
      </button>

      <Link
        href="/watch"
        className="icon-btn relative"
        title={`${t("Camera alerts")}${bellCount ? ` · ${bellCount} ${t("unread")}` : ""}`}
      >
        <Bell className="h-4 w-4" />
        {bellCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-danger-500 px-1 text-[0.6rem] font-bold text-white">
            {bellCount > 9 ? "9+" : bellCount}
          </span>
        ) : null}
      </Link>

      <Link
        href="/crops"
        className="btn btn-primary"
        aria-label={t("Add a new crop")}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t("New Crop")}</span>
      </Link>

      {searchOpen ? <SearchOverlay onClose={() => setSearchOpen(false)} /> : null}
    </div>
  );
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [farms, setFarms] = useState<FarmDTO[]>([]);
  const [crops, setCrops] = useState<CropDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    inputRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      trigger?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([api.listFarms(), api.listCrops()])
      .then(([farmsRes, cropsRes]) => {
        if (!active) return;
        setFarms(farmsRes.farms);
        setCrops(cropsRes.crops);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const farmHits = useMemo(
    () =>
      !q
        ? farms
        : farms.filter(
            (farm) =>
              farm.name.toLowerCase().includes(q) ||
              `${farm.centroidLat},${farm.centroidLng}`.includes(q),
          ),
    [farms, q],
  );
  const cropHits = useMemo(
    () =>
      !q
        ? crops
        : crops.filter(
            (crop) =>
              crop.cropName.toLowerCase().includes(q) ||
              (crop.farmlandName ?? "").toLowerCase().includes(q) ||
              (crop.growthStage ?? "").toLowerCase().includes(q),
          ),
    [crops, q],
  );

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <dialog
      ref={dialogRef}
      className="search-dialog"
      aria-label={t("Search")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="card w-full overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[var(--color-line)] p-4">
          <Search className="h-4 w-4 text-[var(--color-ink-soft)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search fields, crops, growth stages…")}
            aria-label={t("Search fields, crops, growth stages")}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--color-ink-soft)]"
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && farmHits[0]) go("/map");
            }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close search")}
            className="icon-btn border-transparent bg-transparent text-ink-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[min(60dvh,28rem)] overflow-y-auto p-2.5">
          {loading ? (
            <p className="muted px-3 py-6 text-center text-sm">{t("Loading…")}</p>
          ) : farms.length === 0 && crops.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-sm font-semibold">{t("Nothing mapped yet")}</p>
              <p className="muted mt-1 text-xs">
                {t("Draw your first field on the satellite map and it will appear here.")}
              </p>
              <button
                type="button"
                onClick={() => go("/map")}
                className="btn btn-primary mt-3"
              >
                <MapPin className="h-4 w-4" />
                {t("Open field map")}
              </button>
            </div>
          ) : (
            <>
              {farmHits.length > 0 ? (
                <p className="muted px-3 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]">
                  {t("Fields")}
                </p>
              ) : null}
              {farmHits.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => go("/map")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--card-muted)]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-100 text-leaf-700">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {farm.name}
                    </span>
                    <span className="muted block text-xs tabular-nums">
                      {farm.centroidLat.toFixed(3)},{" "}
                      {farm.centroidLng.toFixed(3)}
                    </span>
                  </span>
                  <span className="chip chip-brand shrink-0">
                    {formatLandArea(farm.areaAcres)}
                  </span>
                </button>
              ))}

              {cropHits.length > 0 ? (
                <p className="muted px-3 pb-1 pt-3 text-[0.68rem] font-semibold uppercase tracking-[0.12em]">
                  {t("Crops")}
                </p>
              ) : null}
              {cropHits.slice(0, 6).map((crop) => (
                <button
                  key={crop.id}
                  type="button"
                  onClick={() => go("/crops")}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--card-muted)]"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                    <Sprout className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {crop.cropName}
                      {crop.farmlandName ? (
                        <span className="muted font-normal">
                          {" "}
                          · {crop.farmlandName}
                        </span>
                      ) : null}
                    </span>
                    <span className="muted block text-xs tabular-nums">
                      {crop.durationDays
                        ? t("Day {day} of {total}", {
                            day: crop.ageDays,
                            total: crop.durationDays,
                          })
                        : t("Day {day}", { day: crop.ageDays })}{" "}
                      · {t(crop.growthStage ?? "Seedling")}
                    </span>
                  </span>
                </button>
              ))}

              {farmHits.length === 0 && cropHits.length === 0 ? (
                <p className="muted px-3 py-6 text-center text-sm">
                  {t("No matches for “{query}”.", { query })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

/* -------------------------------------------------------------------------
   FarmSwitcher — the "3 fields active" pill + current field name from the
   reference top bar, wired to the real farm list.
------------------------------------------------------------------------- */

export function FarmSwitcher({
  farms,
  selectedId,
  onSelect,
  loading,
}: {
  farms: FarmDTO[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading?: boolean;
}) {
  const selected = farms.find((farm) => farm.id === selectedId) ?? farms[0];
  const { t } = useI18n();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <label className="toolbar-btn relative min-w-0 max-w-full gap-2.5 py-0 pr-3">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-leaf-500" />
        <select
          aria-label={t("Select field")}
          className="field-select w-[12.5rem] sm:w-[15rem]"
          title={selected?.name}
          value={selected?.id ?? ""}
          onChange={(event) => onSelect(Number(event.target.value))}
          disabled={loading || farms.length === 0}
        >
          {farms.length === 0 ? (
            <option value="">{loading ? t("Loading fields…") : t("No fields yet")}</option>
          ) : farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-ink-soft" />
      </label>
      {selected ? (
        <span className="chip hidden bg-[var(--card-muted)] text-ink-soft xl:inline-flex">
          {t(farms.length === 1 ? "{count} field mapped" : "{count} fields mapped", {
            count: farms.length,
          })}
        </span>
      ) : null}
      <Link href="/map" className="icon-btn" aria-label={t("Map another field")} title={t("Map another field")}>
        <Plus className="h-4 w-4" />
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

import { ApiError, api } from "@/lib/api-client";
import { formatLandArea } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { FarmDTO } from "@/lib/types";

/**
 * Manage the signed-in farmer's saved fields: rename one (e.g. fix a field that
 * was named wrong) or delete it. Every action is scoped to this account by the
 * API and by row level security.
 */
export function FarmManager({
  farms,
  onChanged,
}: {
  farms: FarmDTO[];
  onChanged: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (farms.length === 0) return null;

  const startEdit = (farm: FarmDTO) => {
    setEditingId(farm.id);
    setDraft(farm.name);
    setError(null);
  };

  const save = async (farmId: number) => {
    const name = draft.trim();
    if (!name) {
      setError(t("Enter a name for this field."));
      return;
    }
    setBusyId(farmId);
    setError(null);
    try {
      await api.renameFarm(farmId, name);
      setEditingId(null);
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t("Could not rename the field."),
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (farm: FarmDTO) => {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(
        t("Delete “{name}”? Its crops and reports will be removed too.", {
          name: farm.name,
        }),
      );
    if (!confirmed) return;

    setBusyId(farm.id);
    setError(null);
    try {
      await api.deleteFarm(farm.id);
      await onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : t("Could not delete the field."),
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card mt-4 p-4" aria-label={t("Your saved fields")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("Your saved fields")}</h2>
        <span className="muted text-xs tabular-nums">
          {t(farms.length === 1 ? "{count} field" : "{count} fields", {
            count: farms.length,
          })}
        </span>
      </div>

      <ul className="mt-3 divide-y divide-[var(--color-line)]">
        {farms.map((farm) => {
          const editing = editingId === farm.id;
          const busy = busyId === farm.id;
          return (
            <li key={farm.id} className="flex items-center gap-2 py-2">
              {editing ? (
                <>
                  <input
                    className="input min-w-0 flex-1 py-1.5"
                    value={draft}
                    autoFocus
                    maxLength={80}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void save(farm.id);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("Save name")}
                    disabled={busy}
                    onClick={() => void save(farm.id)}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn border-transparent bg-transparent text-ink-soft"
                    aria-label={t("Cancel")}
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {farm.name}
                  </span>
                  <span className="chip chip-brand shrink-0">
                    {formatLandArea(farm.areaAcres)}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("Rename {name}", { name: farm.name })}
                    disabled={busy}
                    onClick={() => startEdit(farm)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn border-transparent bg-transparent text-danger-700"
                    aria-label={t("Delete {name}", { name: farm.name })}
                    disabled={busy}
                    onClick={() => void remove(farm)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

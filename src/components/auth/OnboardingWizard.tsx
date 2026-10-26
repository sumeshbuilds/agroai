"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  KeyRound,
  Leaf,
  MapPin,
  PencilRuler,
  Sprout,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  CROP_OPTIONS,
  defaultDurationDays,
  getCropDayGuide,
} from "@/lib/crop-guide";
import type { FarmDTO } from "@/lib/types";

const MapDrawer = dynamic(
  () => import("@/components/map/MapDrawer").then((mod) => mod.MapDrawer),
  {
    ssr: false,
    loading: () => (
      <div className="h-[52vh] min-h-[320px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5" />
    ),
  },
);

const STEPS = [
  { label: "Your name", icon: UserRound },
  { label: "Select farm", icon: MapPin },
  { label: "Select crop", icon: Sprout },
  { label: "Create PIN", icon: KeyRound },
] as const;

function suggestPin(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  return `${slug || "farmer"}1234`;
}

export function OnboardingWizard() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [checking, setChecking] = useState(true);

  const [name, setName] = useState("");
  const [farms, setFarms] = useState<FarmDTO[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(false);
  const [farmId, setFarmId] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);

  const [cropName, setCropName] = useState(CROP_OPTIONS[0]);
  const [cropDays, setCropDays] = useState("");
  const [durationDays, setDurationDays] = useState(
    String(defaultDurationDays(CROP_OPTIONS[0])),
  );
  const [durationTouched, setDurationTouched] = useState(false);

  const [pin, setPin] = useState("");
  const [pinTouched, setPinTouched] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadFarms = useCallback(async () => {
    setFarmsLoading(true);
    try {
      const { farms: available } = await api.listAvailableFarms();
      setFarms(available);
      setFarmId((current) =>
        current !== null && available.some((farm) => farm.id === current)
          ? current
          : (available[0]?.id ?? null),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not load available farms.",
      );
    } finally {
      setFarmsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const { farmer } = await api.me();
        if (farmer) {
          router.replace("/");
          return;
        }
        if (active) {
          setChecking(false);
          await loadFarms();
        }
      } catch {
        if (active) {
          setChecking(false);
          await loadFarms();
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [loadFarms, router]);

  const suggestedPin = useMemo(() => suggestPin(name), [name]);
  const effectivePin = pinTouched ? pin : suggestedPin;

  const cropDayNumber = Number(cropDays);
  const durationNumber = Number(durationDays);
  const preview = useMemo(() => {
    if (!Number.isFinite(cropDayNumber) || cropDays.trim() === "") return null;
    return getCropDayGuide(
      cropName,
      Math.max(0, cropDayNumber),
      Number.isFinite(durationNumber) && durationNumber > 0
        ? durationNumber
        : defaultDurationDays(cropName),
    );
  }, [cropName, cropDays, cropDayNumber, durationNumber]);

  const handleCropChange = (value: string) => {
    setCropName(value);
    if (!durationTouched) setDurationDays(String(defaultDurationDays(value)));
  };

  const next = () => {
    setError(null);

    if (step === 0 && name.trim().length < 2) {
      setError("Enter your name (at least 2 characters).");
      return;
    }
    if (step === 1 && farmId === null) {
      setError("Select a farm, or draw a new one on the map.");
      if (farms.length === 0) setShowMap(true);
      return;
    }
    if (step === 2) {
      if (cropDays.trim() === "" || !Number.isFinite(cropDayNumber) || cropDayNumber < 0) {
        setError("Enter how many days ago you sowed the crop.");
        return;
      }
      if (cropDayNumber > 400) {
        setError("Crop day looks too high — enter a value up to 400.");
        return;
      }
      if (
        durationDays.trim() === "" ||
        !Number.isFinite(durationNumber) ||
        durationNumber < 1 ||
        durationNumber > 400
      ) {
        setError("Enter the expected crop duration (1–400 days).");
        return;
      }
    }

    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const back = () => {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const finish = async () => {
    setError(null);

    if (!/^[A-Za-z0-9]{4,32}$/.test(effectivePin)) {
      setError("PIN must be 4–32 letters or numbers, for example name1234.");
      return;
    }
    if (farmId === null) {
      setError("Select a farm before finishing.");
      setStep(1);
      return;
    }

    setSubmitting(true);
    try {
      await api.register({
        name: name.trim(),
        pin: effectivePin,
        farmId,
        cropName,
        cropDays: Math.round(cropDayNumber),
        durationDays: Math.round(durationNumber),
      });
      router.replace("/");
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : null;
      setError(apiError?.message ?? "Could not create your account.");
      if (apiError?.code === "NAME_TAKEN") setStep(0);
      if (apiError?.code === "FARM_TAKEN" || apiError?.code === "FARM_NOT_FOUND") {
        setStep(1);
        await loadFarms();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-2 w-40 animate-pulse-soft rounded-full bg-black/10 dark:bg-white/10" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-3">
        <Link href="/login" className="flex items-center gap-2.5 font-semibold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
            <Leaf className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <span className="text-xl tracking-tight">
            Agro<span className="text-brand-700 dark:text-brand-400">AI</span>
          </span>
        </Link>
        <Link href="/login" className="muted text-sm font-semibold hover:text-[var(--foreground)]">
          Already registered? Sign in
        </Link>
      </header>

      <div className="mt-8">
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Onboarding progress">
          {STEPS.map((entry, index) => {
            const Icon = entry.icon;
            const done = index < step;
            const current = index === step;
            return (
              <li key={entry.label} className="min-w-0">
                <div
                  className={cn(
                    "mb-1.5 h-1.5 rounded-full transition-colors",
                    done || current ? "bg-brand-600" : "bg-black/10 dark:bg-white/10",
                  )}
                />
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] font-semibold sm:text-xs",
                    current
                      ? "text-brand-700 dark:text-brand-400"
                      : done
                        ? "text-[var(--foreground)]"
                        : "muted",
                  )}
                >
                  {done ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : (
                    <Icon className="h-4 w-4 shrink-0" />
                  )}
                  <span className="truncate">{entry.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <section className="card mt-4 space-y-5 p-5 sm:p-7">
        {error ? <Callout tone="danger">{error}</Callout> : null}

        <div key={step} className="animate-rise">
        {step === 0 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">What is your name?</h1>
              <p className="muted mt-1 text-sm">
                We use it to greet you and as your login name. Your PIN is created in the last step.
              </p>
            </div>
            <label className="block">
              <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
                Farmer name
              </span>
              <div className="relative mt-1.5">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  className="input pl-10"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Ramesh Patel"
                  maxLength={60}
                  autoFocus
                />
              </div>
            </label>
            <p className="muted text-xs">
              Use your real name — it will appear on the dashboard.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Select your farm</h1>
                <p className="muted mt-1 text-sm">
                  Pick a farm that is waiting to be claimed, or draw your own boundary on the map.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setShowMap((current) => !current)}>
                <PencilRuler className="h-4 w-4" />
                {showMap ? "Hide map" : "Draw new farm"}
              </Button>
            </div>

            {farmsLoading ? (
              <div className="h-20 animate-pulse-soft rounded-xl bg-black/5 dark:bg-white/5" />
            ) : farms.length === 0 ? (
              <Callout tone="info" title="No farm available to select">
                <p>
                  Draw your field boundary on the satellite map below. Tap at least 3 corners
                  around the field, then save. Its centre is used for real weather.
                </p>
              </Callout>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {farms.map((farm) => {
                  const selected = farmId === farm.id;
                  return (
                    <button
                      key={farm.id}
                      type="button"
                      onClick={() => setFarmId(farm.id)}
                      className={cn(
                        "flex items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors",
                        selected
                          ? "border-brand-500 bg-brand-50/70 dark:bg-brand-900/30"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-brand-400",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{farm.name}</p>
                        <p className="muted mt-0.5 text-xs tabular-nums">
                          {farm.centroidLat.toFixed(4)}, {farm.centroidLng.toFixed(4)}
                        </p>
                        <p className="muted text-xs">
                          {farm.areaAcres === null
                            ? "Area not recorded"
                            : `${farm.areaAcres.toFixed(2)} acres`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                          selected
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-black/20 dark:border-white/30",
                        )}
                      >
                        {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {showMap || farms.length === 0 ? (
              <div className="space-y-2 border-t border-[var(--border)] pt-4">
                <p className="text-sm font-semibold">Draw your farmland</p>
                <MapDrawer
                  farms={[]}
                  onSaved={async (farm) => {
                    setShowMap(false);
                    await loadFarms();
                    setFarmId(farm.id);
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Select your crop</h1>
              <p className="muted mt-1 text-sm">
                Tell us what is growing and which day it is on. The guide uses this plus your
                farm&apos;s live forecast.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
                  Crop
                </span>
                <select
                  className="select mt-1.5"
                  value={cropName}
                  onChange={(event) => handleCropChange(event.target.value)}
                >
                  {CROP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
                  Crop day (days since sowing)
                </span>
                <div className="relative mt-1.5">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    className="input pl-10"
                    type="number"
                    min={0}
                    max={400}
                    inputMode="numeric"
                    value={cropDays}
                    onChange={(event) => setCropDays(event.target.value)}
                    placeholder="e.g. 35"
                  />
                </div>
              </label>
            </div>

            <label className="block sm:max-w-xs">
              <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
                Expected crop duration (days)
              </span>
              <input
                className="input mt-1.5"
                type="number"
                min={1}
                max={400}
                inputMode="numeric"
                value={durationDays}
                onChange={(event) => {
                  setDurationTouched(true);
                  setDurationDays(event.target.value);
                }}
              />
              <span className="muted mt-1 block text-xs">
                Pre-filled with the typical duration for {cropName}. Adjust it if your variety
                is different.
              </span>
            </label>

            {preview ? (
              <div className="rounded-xl border border-brand-500/30 bg-brand-50/60 p-4 dark:bg-brand-900/20">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">
                    {preview.emoji} Day {preview.ageDays} · {preview.stage.name}
                  </p>
                  <span className="chip chip-brand">{preview.progress}%</span>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${Math.max(2, preview.progress)}%` }}
                  />
                </div>
                <p className="muted mt-2.5 text-xs">
                  {preview.stage.focus} Harvest window in about {preview.daysToHarvest} days.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Create your PIN</h1>
              <p className="muted mt-1 text-sm">
                You will sign in with <strong>{name.trim() || "your name"}</strong> and this PIN.
                Suggested format: name + 1234.
              </p>
            </div>

            <label className="block">
              <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
                Login PIN
              </span>
              <div className="relative mt-1.5">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  className="input pl-10 font-mono tracking-wide"
                  value={effectivePin}
                  onChange={(event) => {
                    setPinTouched(true);
                    setPin(event.target.value);
                  }}
                  maxLength={32}
                  autoComplete="new-password"
                  aria-describedby="pin-help"
                />
              </div>
              <span id="pin-help" className="muted mt-1.5 block text-xs">
                4–32 letters or numbers. Example: <code className="font-mono">{suggestedPin}</code>.
                Keep it somewhere safe — you need it every time you sign in.
              </span>
            </label>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card-muted)] p-4 text-sm">
              <p className="font-semibold">Ready to create your account</p>
              <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                <div>
                  <dt className="muted">Name</dt>
                  <dd className="font-semibold">{name.trim() || "—"}</dd>
                </div>
                <div>
                  <dt className="muted">Farm</dt>
                  <dd className="font-semibold">
                    {farms.find((farm) => farm.id === farmId)?.name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="muted">Crop</dt>
                  <dd className="font-semibold">{cropName}</dd>
                </div>
                <div>
                  <dt className="muted">Crop day</dt>
                  <dd className="font-semibold">
                    Day {Number.isFinite(cropDayNumber) ? Math.round(cropDayNumber) : "—"}
                    {preview ? ` of ${preview.durationDays}` : ""}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
          {step > 0 ? (
            <Button variant="ghost" onClick={back} disabled={submitting}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <span />
          )}

          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={finish} loading={submitting}>
              <Check className="h-4 w-4" />
              Create account &amp; open dashboard
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

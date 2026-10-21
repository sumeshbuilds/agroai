"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { Bell, Map as MapIcon, Radar, Siren, TriangleAlert } from "lucide-react";

import { AlertBanner, type ActiveAlert } from "@/components/alerts/AlertBanner";
import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ApiError, api, type AlertCheckResponse } from "@/lib/api-client";
import { formatRelative } from "@/lib/format";
import { useFarms } from "@/lib/hooks/use-farms";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { ANIMAL_KINDS, DANGER_RADIUS_KM, animalKind } from "@/lib/map";
import type { AlertDTO, GeoPoint } from "@/lib/types";

const SimulatorMap = dynamic(
  () => import("@/components/map/SimulatorMap").then((mod) => mod.SimulatorMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[58vh] min-h-[360px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5" />
    ),
  },
);

export function SimulateView() {
  const { farms, loading, needsSetup } = useFarms();
  const { permission, requestPermission } = useNotifications();

  const [animalId, setAnimalId] = useState(ANIMAL_KINDS[0].id);
  const [sightings, setSightings] = useState<AlertDTO[]>([]);
  const [pendingPick, setPendingPick] = useState<GeoPoint | null>(null);
  const [affectedFarmIds, setAffectedFarmIds] = useState<number[]>([]);
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [lastResult, setLastResult] = useState<AlertCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handlePick = async (point: GeoPoint) => {
    if (checking) return;

    setPendingPick(point);
    setChecking(true);
    setNotice(null);

    const kind = animalKind(animalId);

    try {
      const result = await api.checkAlert({
        animalType: animalId,
        lat: point[0],
        lng: point[1],
        source: kind.source,
        severity: kind.severity,
        radiusKm: DANGER_RADIUS_KM,
      });

      setSightings((current) => [result.alert, ...current].slice(0, 30));
      setAffectedFarmIds(result.affectedFarms.map((farm) => farm.farmId));
      setLastResult(result);

      if (result.atRisk) {
        const nearest = result.affectedFarms[0];
        setActiveAlert({
          animalType: kind.label,
          emoji: kind.emoji,
          farmName: nearest.name,
          distanceKm: nearest.distanceKm,
          direction: nearest.direction,
          severity: kind.severity,
          createdAt: result.alert.createdAt,
        });
      } else {
        setActiveAlert(null);
      }
    } catch (cause) {
      setNotice(
        cause instanceof ApiError
          ? cause.message
          : "Could not run the intrusion check.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Predator & hazard alerts"
        subtitle="Simulate a wildlife sighting or thermal event and see which farms fall inside the 3 km danger radius."
        icon={<Siren className="h-5 w-5" />}
      />

      <SetupNotice showDatabase={needsSetup} />

      {activeAlert ? (
        <AlertBanner
          key={`${activeAlert.animalType}-${activeAlert.createdAt ?? ""}`}
          alert={activeAlert}
          autoPlaySiren
          onDismiss={() => setActiveAlert(null)}
        />
      ) : null}

      {notice ? <Callout tone="danger">{notice}</Callout> : null}

      <div className="card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">1. Choose the threat</h2>
          {permission === "default" ? (
            <Button variant="secondary" onClick={() => void requestPermission()}>
              <Bell className="h-4 w-4" />
              Enable notifications
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {ANIMAL_KINDS.map((kind) => (
            <button
              key={kind.id}
              type="button"
              onClick={() => setAnimalId(kind.id)}
              className={
                animalId === kind.id
                  ? "btn btn-primary"
                  : "btn btn-secondary"
              }
            >
              <span aria-hidden className="text-base">
                {kind.emoji}
              </span>
              {kind.label}
            </button>
          ))}
        </div>

        <p className="muted text-sm">
          2. Tap anywhere on the satellite map near a saved farm to spawn the{" "}
          <strong>{animalKind(animalId).label}</strong> sighting.
        </p>
      </div>

      {loading ? (
        <div className="h-[58vh] min-h-[360px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5" />
      ) : farms.length === 0 ? (
        <EmptyState
          icon={<MapIcon className="h-7 w-7" />}
          title="Save a farm first"
          description="Alerts are matched against your saved farm boundaries. Draw a field to try the simulation."
          action={
            <Link href="/map" className="btn btn-primary">
              <MapIcon className="h-4 w-4" />
              Open farm map
            </Link>
          }
        />
      ) : (
        <SimulatorMap
          farms={farms}
          sightings={sightings}
          affectedFarmIds={affectedFarmIds}
          pendingPick={pendingPick}
          radiusKm={DANGER_RADIUS_KM}
          onPick={handlePick}
        />
      )}

      {lastResult ? (
        lastResult.atRisk ? (
          <Callout
            tone="danger"
            icon={<TriangleAlert className="h-5 w-5" />}
            title={`${lastResult.affectedFarms.length} farm${lastResult.affectedFarms.length === 1 ? "" : "s"} within ${DANGER_RADIUS_KM} km`}
          >
            <ul className="mt-1 space-y-1">
              {lastResult.affectedFarms.map((farm) => (
                <li key={farm.farmId}>
                  <strong>{farm.name}</strong> — {farm.distanceKm.toFixed(2)} km
                  to the {farm.direction}
                </li>
              ))}
            </ul>
          </Callout>
        ) : (
          <Callout tone="success" title="No farms at risk">
            <p>
              The sighting was logged, but every farm is outside the{" "}
              {DANGER_RADIUS_KM} km danger radius.
            </p>
          </Callout>
        )
      ) : null}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide muted">
          <Radar className="h-4 w-4" />
          Recent sightings ({sightings.length})
        </h2>

        {sightings.length === 0 ? (
          <p className="muted text-sm">
            No simulations yet. Tap the map to trigger one.
          </p>
        ) : (
          <div className="space-y-2">
            {sightings.map((sighting) => {
              const kind = animalKind(sighting.animalType);
              return (
                <div
                  key={sighting.id}
                  className="card flex items-center justify-between gap-3 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{kind.emoji}</span>
                    <div>
                      <p className="font-bold">{kind.label}</p>
                      <p className="muted text-xs">
                        {sighting.lat.toFixed(4)}, {sighting.lng.toFixed(4)} ·{" "}
                        {sighting.source} · {formatRelative(sighting.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={
                      sighting.severity === "CRITICAL"
                        ? "chip chip-danger"
                        : "chip chip-warn"
                    }
                  >
                    {sighting.severity}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

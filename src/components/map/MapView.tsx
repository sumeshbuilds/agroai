"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";

import { SetupNotice } from "@/components/setup/SetupNotice";
import { Callout } from "@/components/ui/Callout";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { api } from "@/lib/api-client";
import { formatAcres } from "@/lib/format";
import { useFarms } from "@/lib/hooks/use-farms";
import type { AlertDTO } from "@/lib/types";

const MapDrawer = dynamic(
  () => import("@/components/map/MapDrawer").then((mod) => mod.MapDrawer),
  {
    ssr: false,
    loading: () => (
      <div className="h-[58vh] min-h-[360px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5" />
    ),
  },
);

export function MapView() {
  const { farms, loading, needsSetup, refresh } = useFarms();
  const [sightings, setSightings] = useState<AlertDTO[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAlerts({ limit: 25 })
      .then((data) => setSightings(data.alerts))
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Farm map"
        subtitle="Draw your farmland on live satellite imagery. Tap to add each corner, then save."
        icon={<MapIcon className="h-5 w-5" />}
      />

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone="success">{notice}</Callout> : null}

      {!needsSetup ? (
        loading ? (
          <div className="h-[58vh] min-h-[360px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5" />
        ) : (
          <MapDrawer
            farms={farms}
            sightings={sightings}
            onSaved={async (farm) => {
              setNotice(
                `Saved “${farm.name}” (${formatAcres(farm.areaAcres)}). Its centre is now used for weather and alerts.`,
              );
              await refresh();
            }}
          />
        )
      ) : null}

      {farms.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide muted">
            Saved farms ({farms.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {farms.map((farm) => (
              <div key={farm.id} className="card flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-bold">{farm.name}</p>
                  <p className="muted text-xs">
                    {farm.centroidLat.toFixed(4)}, {farm.centroidLng.toFixed(4)}
                  </p>
                </div>
                <span className="chip chip-brand shrink-0">
                  {formatAcres(farm.areaAcres)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

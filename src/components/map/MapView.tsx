"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Map as MapIcon, Ruler, Satellite, Video } from "lucide-react";

import { SetupNotice } from "@/components/setup/SetupNotice";
import { Callout } from "@/components/ui/Callout";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { api } from "@/lib/api-client";
import type { CameraSessionDTO } from "@/lib/camera";
import {
  acresToHectares,
  acresToSquareMetres,
  formatLandArea,
} from "@/lib/format";
import { useFarms } from "@/lib/hooks/use-farms";

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
  const [cameras, setCameras] = useState<CameraSessionDTO[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await api.listCameraSessions();
        if (active) setCameras(data.sessions);
      } catch {
        // The map still works without camera markers.
      }
    };

    const kickoff = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  const totalAcres = useMemo(
    () => farms.reduce((sum, farm) => sum + (farm.areaAcres ?? 0), 0),
    [farms],
  );
  const liveCameras = cameras.filter((camera) => camera.isLive);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <SectionHeading
        title="Satellite field map"
        subtitle="Outline your farmland on satellite imagery. Area is calculated from the polygon, and the field centre powers live weather + camera tracking."
        icon={<MapIcon className="h-5 w-5" />}
        action={
          <Link href="/watch" className="btn btn-secondary">
            <Video className="h-4 w-4" />
            Live watch
          </Link>
        }
      />

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone="success">{notice}</Callout> : null}

      {farms.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <Satellite className="h-5 w-5" />
            </span>
            <div>
              <p className="muted text-[11px] font-semibold uppercase tracking-[0.08em]">
                Mapped land
              </p>
              <p className="text-lg font-bold tabular-nums">
                {totalAcres.toFixed(2)} acres
              </p>
              <p className="muted text-xs tabular-nums">
                {acresToHectares(totalAcres).toFixed(2)} ha ·{" "}
                {acresToSquareMetres(totalAcres).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{" "}
                m²
              </p>
            </div>
          </div>

          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
              <Ruler className="h-5 w-5" />
            </span>
            <div>
              <p className="muted text-[11px] font-semibold uppercase tracking-[0.08em]">
                Field parcels
              </p>
              <p className="text-lg font-bold tabular-nums">{farms.length}</p>
              <p className="muted text-xs">Satellite polygon area</p>
            </div>
          </div>

          <div className="card flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Camera className="h-5 w-5" />
            </span>
            <div>
              <p className="muted text-[11px] font-semibold uppercase tracking-[0.08em]">
                Field cameras
              </p>
              <p className="text-lg font-bold tabular-nums">
                {liveCameras.length} live
              </p>
              <p className="muted text-xs">
                {cameras.length} paired · AI animal + human tracking
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!needsSetup ? (
        loading ? (
          <div className="h-[58vh] min-h-[360px] animate-pulse-soft rounded-2xl bg-black/5 dark:bg-white/5" />
        ) : (
          <MapDrawer
            farms={farms}
            cameras={cameras}
            onSaved={async (farm) => {
              setNotice(
                `Saved “${farm.name}” (${formatLandArea(farm.areaAcres)}). Its centre now powers weather, area estimates and camera tracking.`,
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
            {farms.map((farm) => {
              const camera = liveCameras.find(
                (item) => item.farm?.id === farm.id,
              );
              return (
                <div
                  key={farm.id}
                  className="card flex items-center justify-between gap-3 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold">{farm.name}</p>
                    <p className="muted text-xs">
                      {farm.centroidLat.toFixed(4)},{" "}
                      {farm.centroidLng.toFixed(4)}
                      {camera ? ` · 📷 ${camera.name} live` : ""}
                    </p>
                  </div>
                  <span className="chip chip-brand shrink-0">
                    {formatLandArea(farm.areaAcres)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

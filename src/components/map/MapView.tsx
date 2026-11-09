"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { MapPin, Satellite } from "lucide-react";

import { SetupNotice } from "@/components/setup/SetupNotice";
import { WorkbenchBar } from "@/components/layout/PageBar";
import { Callout } from "@/components/ui/Callout";
import { api } from "@/lib/api-client";
import type { CameraSessionDTO } from "@/lib/camera";
import { formatLandArea } from "@/lib/format";
import { useFarms } from "@/lib/hooks/use-farms";

const MapDrawer = dynamic(
  () => import("@/components/map/MapDrawer").then((mod) => mod.MapDrawer),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-[36rem] w-full animate-pulse-soft rounded-2xl bg-paper-deep sm:min-h-[28rem]" />
    ),
  },
);

export function MapView() {
  const { farms, needsSetup, refresh } = useFarms();
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
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const liveCameras = cameras.filter((camera) => camera.isLive);

  return (
    <div className="flex min-h-full flex-col px-4 py-6 sm:px-6 md:h-full md:min-h-0">
      <WorkbenchBar
        className="border-b border-[var(--color-line)] pb-5"
        left={
          <div className="flex min-w-0 items-center gap-3">
            <span className="title-icon hidden sm:flex">
              <MapPin aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight">
                Field &amp; land map
              </h1>
              <p className="muted mt-1.5 flex items-center gap-3 text-xs tabular-nums">
                <span>
                  {liveCameras.length} camera{liveCameras.length === 1 ? "" : "s"} live
                </span>
              </p>
            </div>
          </div>
        }
      />

      {notice ? (
        <Callout tone="success" icon={<Satellite aria-hidden className="h-4 w-4" />} className="mt-4">
          {notice}
        </Callout>
      ) : null}

      <div className="min-h-0 flex-1 pt-5">
        <SetupNotice showDatabase={needsSetup} />
        {needsSetup ? null : (
          <MapDrawer
            farms={farms}
            cameras={cameras}
            onSaved={async (farm) => {
              setNotice(
                `Saved “${farm.name}” (${formatLandArea(farm.areaAcres)}). Its centre now powers weather and camera tracking.`,
              );
              await refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}

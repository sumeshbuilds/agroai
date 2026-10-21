"use client";

import { useEffect, useRef } from "react";
import { Bell, Siren, TriangleAlert, Volume2, VolumeX, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { useSiren } from "@/lib/hooks/use-siren";

export interface ActiveAlert {
  animalType: string;
  farmName: string;
  distanceKm: number;
  direction: string;
  severity?: string | null;
  emoji?: string;
  createdAt?: string | null;
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function AlertBanner({
  alert,
  autoPlaySiren = false,
  onDismiss,
}: {
  alert: ActiveAlert;
  autoPlaySiren?: boolean;
  onDismiss: () => void;
}) {
  const { play, stop, isPlaying } = useSiren();
  const { permission, requestPermission, notify } = useNotifications();
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (autoPlaySiren) {
      play(7000);
    }
  }, [autoPlaySiren, play]);

  useEffect(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;

    notify(`${alert.emoji ?? "⚠️"} ${alert.animalType} near ${alert.farmName}`, {
      body: `${formatDistance(alert.distanceKm)} to the ${alert.direction}. Move livestock indoors and stay alert.`,
      tag: "agroai-intrusion",
      requireInteraction: true,
    });
  }, [alert, notify]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="animate-alert-flash relative overflow-hidden rounded-2xl p-4 text-white shadow-xl sm:p-5"
    >
      <div className="flex items-start gap-4">
        <span className="animate-siren-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl">
          <Siren className="h-6 w-6" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/90">
            <TriangleAlert className="h-4 w-4" />
            Danger alert {alert.severity ? `· ${alert.severity}` : ""}
          </p>
          <h2 className="mt-0.5 text-xl font-extrabold leading-tight sm:text-2xl">
            {alert.emoji ? `${alert.emoji} ` : ""}
            {alert.animalType} near your farm
          </h2>
          <p className="mt-1 text-sm font-medium text-white/95">
            Detected{" "}
            <strong className="font-extrabold">
              {formatDistance(alert.distanceKm)}
            </strong>{" "}
            to the <strong className="font-extrabold">{alert.direction}</strong>{" "}
            of <strong className="font-extrabold">{alert.farmName}</strong>.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => (isPlaying ? stop() : play(7000))}
              className="border-transparent bg-white/95 text-danger-700 hover:bg-white"
            >
              {isPlaying ? (
                <>
                  <VolumeX className="h-4 w-4" /> Stop siren
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4" /> Sound siren
                </>
              )}
            </Button>

            {permission === "default" ? (
              <Button
                variant="secondary"
                onClick={() => void requestPermission()}
                className="border-white/40 bg-transparent text-white hover:bg-white/10"
              >
                <Bell className="h-4 w-4" /> Enable notifications
              </Button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            stop();
            onDismiss();
          }}
          aria-label="Dismiss alert"
          className="shrink-0 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

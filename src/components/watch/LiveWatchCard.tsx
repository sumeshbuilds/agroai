"use client";

import Link from "next/link";
import {
  ArrowRight,
  Camera,
  CameraOff,
  MapPin,
  PawPrint,
  Radio,
  Users,
  Video,
} from "lucide-react";

import {
  CATEGORY_STYLES,
  cameraStats,
  type CameraSessionDTO,
} from "@/lib/camera";
import { formatRelative } from "@/lib/format";

export function LiveWatchCard({
  session,
  loading = false,
}: {
  session: CameraSessionDTO | null;
  loading?: boolean;
}) {
  if (loading) {
    return <div className="card h-64 animate-pulse-soft" />;
  }

  if (!session) {
    return (
      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Video className="h-[1.15rem] w-[1.15rem]" />
            </span>
            <div>
              <h2 className="text-base font-semibold leading-tight">
                Live field watch
              </h2>
              <p className="muted mt-0.5 text-xs leading-relaxed">
                Turn your phone into a field camera. It detects people and
                animals on-device — no satellite guessing.
              </p>
            </div>
          </div>
          <Link href="/watch" className="btn btn-primary">
            <Camera className="h-4 w-4" />
            Pair a phone camera
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    );
  }

  const stats = cameraStats(session.latestDetections);

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-brand-700 dark:text-brand-400" />
          <h2 className="text-base font-semibold">Live field watch</h2>
        </div>
        <span
          className={
            session.isLive
              ? "chip chip-danger"
              : session.status === "live"
                ? "chip chip-warn"
                : "chip bg-[var(--card-muted)] text-[var(--muted)]"
          }
        >
          {session.isLive ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              LIVE
            </>
          ) : session.status === "ended" ? (
            <>
              <CameraOff className="h-3 w-3" />
              Ended
            </>
          ) : session.status === "live" ? (
            <>
              <CameraOff className="h-3 w-3" />
              No frames
            </>
          ) : (
            <>
              <CameraOff className="h-3 w-3" />
              Waiting
            </>
          )}
        </span>
      </header>

      <div
        className="relative bg-slate-950"
        style={{
          aspectRatio:
            session.frameWidth && session.frameHeight
              ? `${session.frameWidth} / ${session.frameHeight}`
              : "16 / 9",
        }}
      >
        {session.frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.frameUrl}
            alt={`Latest frame from ${session.name}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
            <Camera className="h-6 w-6 text-emerald-400" />
            <p className="text-xs font-bold text-slate-100">
              Waiting for the phone
            </p>
            <p className="text-[10px] text-slate-400">
              Open the pairing link and start the stream
            </p>
          </div>
        )}

        {session.latestDetections.map((detection) => {
          const style = CATEGORY_STYLES[detection.category];
          const [x, y, w, h] = detection.box;
          return (
            <div
              key={detection.trackId}
              className={`absolute border-2 ${style.border}`}
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                backgroundColor: style.fill,
              }}
            >
              <span
                className={`absolute -top-4 left-[-2px] max-w-[130px] truncate rounded-t px-1 py-0.5 text-[9px] font-extrabold leading-none ${style.text}`}
              >
                {detection.emoji} {detection.label}
              </span>
            </div>
          );
        })}

        {session.isLive ? (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
            <span className="h-1 w-1 animate-pulse rounded-full bg-white" />
            Live
          </span>
        ) : null}

        <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold text-white/80 backdrop-blur">
          <Radio className="h-2.5 w-2.5" />
          {session.lastSeenAt
            ? formatRelative(session.lastSeenAt)
            : "no frames yet"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="chip chip-brand">
            <Users className="h-3 w-3" />
            {stats.persons} {stats.persons === 1 ? "person" : "people"}
          </span>
          <span className="chip chip-danger">
            <PawPrint className="h-3 w-3" />
            {stats.animals} {stats.animals === 1 ? "animal" : "animals"}
          </span>
          {session.farm ? (
            <span className="chip bg-[var(--card-muted)] text-[var(--muted)]">
              <MapPin className="h-3 w-3" />
              {session.farm.distanceKm < 1
                ? `${Math.round(session.farm.distanceKm * 1000)} m from ${session.farm.name}`
                : `${session.farm.distanceKm.toFixed(1)} km from ${session.farm.name}`}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="muted text-xs">
            {session.name}
            {session.deviceLabel ? ` · ${session.deviceLabel}` : ""}
          </p>
          <Link
            href="/watch"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:underline dark:text-brand-400"
          >
            Open live watch
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

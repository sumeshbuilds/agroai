"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import {
  Activity,
  Bot,
  Camera,
  CameraOff,
  Check,
  CircleDot,
  Clipboard,
  Cpu,
  ExternalLink,
  Eye,
  Gauge,
  Link2,
  MapPin,
  PawPrint,
  Play,
  Plus,
  Radar,
  Radio,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Signal,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";

import { SetupNotice } from "@/components/setup/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CameraAlarmBanner } from "@/components/watch/CameraAlarmBanner";
import { ApiError, api } from "@/lib/api-client";
import {
  CATEGORY_STYLES,
  cameraStats,
  type CameraDetectionDTO,
  type CameraSessionDTO,
  type FrameDetection,
} from "@/lib/camera";
import { formatRelative } from "@/lib/format";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { CAMERA_WATCH_RADIUS_KM } from "@/lib/map";
import type { WeatherSnapshot } from "@/lib/weather";

interface SessionDetail {
  session: CameraSessionDTO;
  detections: CameraDetectionDTO[];
}

const POLL_MS_NORMAL = 1_000;
const POLL_MS_SLOW = 2_500;

export function WatchView() {
  const origin = useClientValue(() => window.location.origin, "");
  const hostname = useClientValue(() => window.location.hostname, "");
  const protocol = useClientValue(() => window.location.protocol, "http:");
  const port = useClientValue(() => window.location.port, "");
  // Slow links (2G / data saver) poll less often to keep the feed usable.
  const pollMs = useClientValue(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    return connection?.saveData ||
      connection?.effectiveType === "2g" ||
      connection?.effectiveType === "slow-2g"
      ? POLL_MS_SLOW
      : POLL_MS_NORMAL;
  }, POLL_MS_NORMAL);

  const [sessions, setSessions] = useState<CameraSessionDTO[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [networkIps, setNetworkIps] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [weatherState, setWeatherState] = useState<{
    lat: number;
    lng: number;
    snapshot: WeatherSnapshot;
  } | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [clock, setClock] = useState(0);

  const selectedRef = useRef<number | null>(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const activeDetail = detail?.session.id === selectedId ? detail : null;
  const selectedSession =
    activeDetail?.session ?? sessions.find((s) => s.id === selectedId) ?? null;

  // ---- data loading ------------------------------------------------------
  const loadSessions = useCallback(async (silent = false) => {
    try {
      const data = await api.listCameraSessions();
      setSessions(data.sessions);
      setNeedsSetup(false);
      setError(null);
      setSelectedId((current) => {
        if (current && data.sessions.some((s) => s.id === current)) return current;
        return (
          data.sessions.find((s) => s.isLive)?.id ??
          data.sessions[0]?.id ??
          null
        );
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DB_NOT_CONFIGURED") {
        setNeedsSetup(true);
      }
      if (!silent) {
        setError(
          cause instanceof Error ? cause.message : "Could not load camera sessions.",
        );
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number, silent = false) => {
    try {
      const data = await api.getCameraSession(id);
      if (selectedRef.current !== id) return;
      setDetail(data);
      setDetailError(null);
    } catch (cause) {
      if (selectedRef.current !== id) return;
      if (!silent) {
        setDetailError(
          cause instanceof Error ? cause.message : "Could not load this camera.",
        );
      }
    }
  }, []);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await loadSessions(true);
      if (selectedRef.current !== null) {
        await loadDetail(selectedRef.current, true);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const kickoff = window.setTimeout(() => void loadSessions(), 0);
    const timer = window.setInterval(() => void loadSessions(true), 8000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [loadSessions]);

  useEffect(() => {
    api
      .getCameraNetwork()
      .then((data) =>
        setNetworkIps(
          data.addresses
            .map((entry) => entry.address)
            .sort((a, b) => lanScore(b) - lanScore(a)),
        ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    const kickoff = window.setTimeout(() => void loadDetail(selectedId), 0);
    const timer = window.setInterval(() => void loadDetail(selectedId, true), pollMs);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, [selectedId, loadDetail, pollMs]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Weather at the phone's GPS, rounded to ~1 km so GPS jitter does not spam
  // Open-Meteo while the operator walks around the field.
  const latKey = selectedSession?.lat?.toFixed(2) ?? null;
  const lngKey = selectedSession?.lng?.toFixed(2) ?? null;

  useEffect(() => {
    if (latKey === null || lngKey === null) return;

    let active = true;
    const lat = Number(latKey);
    const lng = Number(lngKey);

    api
      .getWeatherByPoint(lat, lng)
      .then((data) => {
        if (!active) return;
        setWeatherState({ lat, lng, snapshot: data.weather });
        setWeatherError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setWeatherError(
          cause instanceof Error ? cause.message : "Weather unavailable.",
        );
      });

    return () => {
      active = false;
    };
  }, [latKey, lngKey]);

  const weather =
    latKey !== null &&
    lngKey !== null &&
    weatherState &&
    weatherState.lat === Number(latKey) &&
    weatherState.lng === Number(lngKey)
      ? weatherState.snapshot
      : null;

  // ---- pairing URL -------------------------------------------------------
  const phoneUrl = useMemo(() => {
    if (!selectedSession?.token) return "";
    if (!origin) return "";

    let base = origin;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      const lan = networkIps[0];
      if (lan) {
        base = `${protocol}//${lan}${port ? `:${port}` : ""}`;
      }
    }

    return `${base}/camera?token=${encodeURIComponent(selectedSession.token)}`;
  }, [selectedSession?.token, origin, hostname, networkIps, protocol, port]);

  const phoneIsSecure = phoneUrl.startsWith("https://");

  // ---- actions -----------------------------------------------------------
  const createSession = async () => {
    setCreating(true);
    setNotice(null);
    setError(null);
    try {
      const name = `Field camera ${sessions.length + 1}`;
      const { session } = await api.createCameraSession(name);
      setSessions((current) => [session, ...current]);
      setSelectedId(session.id);
      setDetail({ session, detections: [] });
      setNotice("Camera paired. Scan the QR code with your phone.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the camera.");
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (status: "live" | "ended") => {
    if (!selectedSession) return;
    setBusy(status);
    setNotice(null);
    try {
      const { session } = await api.updateCameraSession(selectedSession.id, {
        status,
      });
      setDetail((current) =>
        current && current.session.id === session.id
          ? { ...current, session }
          : current,
      );
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? session : item)),
      );
      setNotice(
        status === "ended"
          ? "Stream ended. The phone will show “stopped” within a few seconds."
          : "Stream restarted. Reload the camera page on the phone if it was stopped.",
      );
      if (status === "ended") {
        setDetail((current) =>
          current ? { ...current, session: { ...current.session, latestDetections: [] } } : current,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the camera.");
    } finally {
      setBusy(null);
    }
  };

  const removeSession = async () => {
    if (!selectedSession) return;
    if (!window.confirm(`Delete “${selectedSession.name}” and its detection history?`)) {
      return;
    }
    setBusy("delete");
    try {
      await api.deleteCameraSession(selectedSession.id);
      const remaining = sessions.filter((item) => item.id !== selectedSession.id);
      setSessions(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setDetail(null);
      setNotice("Camera removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the camera.");
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!phoneUrl) return;
    try {
      await navigator.clipboard.writeText(phoneUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard blocked. Select the link and copy it manually.");
    }
  };

  const liveDetections = selectedSession?.latestDetections ?? [];
  const stats = cameraStats(liveDetections);
  const frameAge =
    selectedSession?.frameUpdatedAt && clock > 0
      ? Math.max(
          0,
          Math.round(
            (clock - new Date(selectedSession.frameUpdatedAt).getTime()) / 1000,
          ),
        )
      : null;

  const liveChipLabel = selectedSession?.isLive
    ? "Live camera"
    : selectedSession?.status === "live"
      ? "Waiting for frames"
      : selectedSession?.status === "ended"
        ? "Stream ended"
        : "No live camera";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6">
        <SectionHeading
          title="Animal & people watch"
          subtitle="Your phone is the camera. It watches for people and animals on-device and streams what it sees here — satellites map the land, cameras watch what moves on it."
          icon={<Radar aria-hidden className="h-5 w-5" />}
          action={<>
          <span
            className={
              selectedSession?.isLive
                ? "chip chip-brand"
                : selectedSession?.status === "live"
                  ? "chip chip-warn"
                  : "chip bg-[var(--card-muted)] text-[var(--muted)]"
            }
          >
            <span
              className={
                selectedSession?.isLive
                  ? "h-1.5 w-1.5 rounded-full bg-leaf-600"
                  : "h-1.5 w-1.5 rounded-full bg-current opacity-50"
              }
            />
            {liveChipLabel}
          </span>
          <Button
            variant="secondary"
            onClick={() => void refreshNow()}
            loading={refreshing}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={createSession} loading={creating}>
            <Plus className="h-4 w-4" />
            Pair a phone
          </Button>
          </>}
        />
      </div>

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone="success" className="mb-3">{notice}</Callout> : null}
      {error ? <Callout tone="danger" className="mb-3">{error}</Callout> : null}

      <CameraAlarmBanner className="mb-6" intervalMs={4_000} />

      {sessionsLoading && sessions.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="card h-[460px] animate-pulse-soft" />
          <div className="card h-[460px] animate-pulse-soft" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Camera className="h-7 w-7" />}
          title="Pair your phone as the first field camera"
          description="Tap “Pair a phone”, scan the QR code on your mobile, then point the rear camera at the demo field. People and animals show up here with live boxes and movement direction."
          action={
            <Button onClick={createSession} loading={creating}>
              <Smartphone className="h-4 w-4" />
              Pair a phone camera
            </Button>
          }
        />
      ) : (
        <>
          <nav aria-label="Camera sessions" className="mb-5 flex flex-wrap gap-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedId(session.id)}
                aria-pressed={session.id === selectedId}
                className={
                  session.id === selectedId
                    ? "btn max-w-full border-leaf-600 bg-leaf-100 text-leaf-700"
                    : "btn btn-secondary max-w-full"
                }
              >
                <span
                  className={
                    session.isLive
                       ? "h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-600"
                      : "h-1.5 w-1.5 rounded-full bg-current opacity-40"
                  }
                />
                <span className="truncate">{session.name}</span>
                {session.isLive ? (
                  <span className="text-[0.625rem] font-semibold">
                    LIVE
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              {detailError ? <Callout tone="danger">{detailError}</Callout> : null}

              <LivePlayer
                session={selectedSession}
                detections={liveDetections}
                frameAge={frameAge}
              />

              <section aria-label="Camera statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  icon={<Users className="h-4 w-4" />}
                  label="People"
                  value={String(stats.persons)}
                  accent={stats.persons > 0}
                />
                <StatTile
                  icon={<PawPrint className="h-4 w-4" />}
                  label="Animals"
                  value={String(stats.animals)}
                  accent={stats.animals > 0}
                />
                <StatTile
                  icon={<Gauge className="h-4 w-4" />}
                  label="Motion"
                  value={`${Math.round((selectedSession?.motion ?? 0) * 1000) / 10}%`}
                />
                <StatTile
                  icon={<Cpu className="h-4 w-4" />}
                  label="On-device AI"
                  value={
                    selectedSession?.aiEnabled
                      ? "Active"
                      : selectedSession?.status === "ended"
                        ? "Stopped"
                        : "Motion"
                  }
                />
              </section>

              <section className="card overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-5">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <Activity className="h-4 w-4 text-accent-600" />
                      Detection feed
                    </h2>
                    <p className="muted mt-1.5 text-xs leading-relaxed">
                      Confirmed human and animal tracks from the live camera
                    </p>
                  </div>
                  <span className="chip chip-violet">
                    {selectedSession?.totalDetections ?? 0} logged
                  </span>
                </header>

                {!activeDetail || activeDetail.detections.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
                    <Eye className="h-6 w-6 text-[var(--color-ink-soft)]" />
                    <p className="text-sm font-semibold">No tracks logged yet</p>
                    <p className="muted max-w-sm text-xs leading-relaxed">
                      Walk a person or animal through the camera frame. Each new
                      track appears here once, with its confidence and movement
                      direction.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {activeDetail.detections.slice(0, 22).map((detection) => {
                      const style = CATEGORY_STYLES[detection.category];
                      return (
                        <li
                          key={detection.id}
                          className="flex items-center gap-3 px-5 py-4"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base ${style.text}`}
                          >
                            {detection.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {detection.label}
                              {detection.confidence ? (
                                <span className="muted ml-2 text-xs font-medium tabular-nums">
                                  {Math.round(detection.confidence * 100)}%
                                </span>
                              ) : null}
                            </p>
                            <p className="muted text-xs">
                              {detection.direction ?? "in frame"} ·{" "}
                              {formatRelative(detection.createdAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {detection.category === "person" ? (
                              <span className="chip chip-warn">Human</span>
                            ) : (
                              <span className="chip chip-danger">Animal</span>
                            )}
                            {detection.verified ? (
                              <span
                                className="chip chip-brand"
                                title="Confirmed by Groq vision"
                              >
                                <Sparkles className="h-3 w-3" />
                                AI
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>

            <aside className="min-w-0 space-y-5">
              <section className="card overflow-hidden">
                <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-5">
                  <Smartphone className="h-4 w-4 text-accent-600" />
                  <h2 className="text-base font-semibold">Phone pairing</h2>
                  {selectedSession?.isLive ? (
                    <span className="chip chip-brand ml-auto">
                      <Signal className="h-3 w-3" />
                      connected
                    </span>
                  ) : null}
                </header>

                <div className="space-y-4 p-5">
                  {selectedSession ? (
                    <>
                      <div className="grid grid-cols-1 items-start gap-4 min-[380px]:grid-cols-[8rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)]">
                        <div className="w-40 max-w-full rounded-xl bg-white p-2 min-[380px]:w-auto">
                          {phoneUrl ? (
                            <QRCode
                              value={phoneUrl}
                              size={168}
                              style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                              bgColor="#ffffff"
                              fgColor="#18291f"
                            />
                          ) : (
                            <div className="aspect-square w-full animate-pulse-soft rounded bg-card-muted" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold">{selectedSession.name}</p>
                          <p className="muted mt-2 text-xs leading-relaxed">
                            Scan with the phone camera, allow camera + location,
                            then tap <strong>Start camera stream</strong>.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="chip max-w-full whitespace-normal break-words bg-[var(--card-muted)] text-[var(--muted)]">
                              {selectedSession.deviceLabel ?? "Waiting for phone"}
                            </span>
                            {selectedSession.lat !== null ? (
                              <span className="chip chip-violet">
                                <MapPin className="h-3 w-3" />
                                GPS linked
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-[var(--card-muted)] p-3">
                        <p className="muted mb-1.5 text-xs font-medium">
                          Camera link
                        </p>
                        <p className="break-all font-mono text-[11px] leading-relaxed">
                          {phoneUrl || "Getting your network address…"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => void copyLink()} disabled={!phoneUrl}>
                          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                          {copied ? "Copied" : "Copy link"}
                        </Button>
                        {phoneUrl ? (
                          <a
                            href={phoneUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </a>
                        ) : null}
                      </div>

                      {!phoneIsSecure ? (
                        <details className="rounded-xl bg-warn-100 px-3.5 py-2 text-xs text-warn-700">
                          <summary className="min-h-11 content-center font-semibold leading-relaxed">
                            Phone camera needs HTTPS — tap for setup
                          </summary>
                          <ol className="mb-2 mt-2 list-decimal space-y-2 break-words pl-4 leading-relaxed [overflow-wrap:anywhere]">
                            <li>
                              Best for the exhibition: deploy to Vercel or use a
                              Cloudflare / ngrok HTTPS tunnel.
                            </li>
                            <li>
                              Android Chrome workaround: open{" "}
                              <code className="font-mono">
                                chrome://flags/#unsafely-treat-insecure-origin-as-secure
                              </code>
                              , add{" "}
                              <code className="font-mono">
                                {phoneUrl.split("/camera")[0]}
                              </code>
                              , enable, relaunch Chrome.
                            </li>
                            <li>
                              Or run <code className="font-mono">npm run dev:https</code>{" "}
                              and accept the certificate on the phone.
                            </li>
                          </ol>
                        </details>
                      ) : null}

                      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                        {selectedSession.status === "ended" ? (
                          <Button
                            onClick={() => void setStatus("live")}
                            loading={busy === "live"}
                          >
                            <Play className="h-4 w-4" />
                            Restart stream
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => void setStatus("ended")}
                            loading={busy === "ended"}
                          >
                            <CameraOff className="h-4 w-4" />
                            Stop stream
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => void removeSession()}
                          loading={busy === "delete"}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="muted text-sm">Select or create a camera first.</p>
                  )}
                </div>
              </section>

              <section className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <MapPin className="h-4 w-4 text-leaf-600" />
                    Field context
                  </h2>
                  <Link href="/map" className="inline-flex min-h-11 items-center text-xs font-medium text-accent-700 underline-offset-4 hover:underline">
                    Satellite map
                  </Link>
                </div>

                {selectedSession?.farm ? (
                  <div className="mt-3 border-b border-[var(--border)] pb-4">
                    <p className="text-sm font-semibold">{selectedSession.farm.name}</p>
                    <p className="muted mt-1.5 text-xs leading-relaxed">
                      Camera is {formatDistance(selectedSession.farm.distanceKm)} to
                      the {selectedSession.farm.direction} of this field.
                    </p>
                    {selectedSession.farm.distanceKm > CAMERA_WATCH_RADIUS_KM ? (
                      <p className="mt-1 text-xs font-semibold text-mustard-600">
                        Camera is outside the {CAMERA_WATCH_RADIUS_KM} km field
                        watch radius.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted mt-3 text-xs leading-relaxed">
                    Allow location on the phone to link this camera to your
                    satellite-mapped field and show hyper-local weather.
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
                  <ContextRow
                    icon={<Ruler className="h-3.5 w-3.5" />}
                    label="Live camera"
                    value={selectedSession?.isLive ? "Streaming" : "Offline"}
                  />
                  <ContextRow
                    icon={<Signal className="h-3.5 w-3.5" />}
                    label="Frame latency"
                    value={frameAge === null ? "—" : `${frameAge}s`}
                  />
                  <ContextRow
                    icon={<MapPin className="h-3.5 w-3.5" />}
                    label="Phone GPS"
                    value={
                      selectedSession?.lat !== null && selectedSession?.lat !== undefined
                        ? `${selectedSession.lat.toFixed(3)}, ${selectedSession.lng?.toFixed(3)}`
                        : "Not shared"
                    }
                  />
                  <ContextRow
                    icon={<Bot className="h-3.5 w-3.5" />}
                    label="Detector"
                    value={
                      selectedSession?.aiEnabled
                        ? "On-device + Groq"
                        : "Motion assist"
                    }
                  />
                </div>

                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <p className="muted text-xs font-medium">
                    Weather at the camera
                  </p>
                  {weather ? (
                    <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-1">
                      <p className="text-2xl font-bold tabular-nums">
                        {weather.current.temperature?.toFixed(0) ?? "—"}°C
                      </p>
                      <p className="muted text-xs">
                        Rain {weather.current.precipitation ?? 0} mm · Wind{" "}
                        {weather.current.windSpeed ?? 0} km/h
                      </p>
                      <p className="muted text-xs">
                        Soil{" "}
                        {weather.current.soilMoisture === null
                          ? "—"
                          : `${(weather.current.soilMoisture * 100).toFixed(0)}%`}
                      </p>
                    </div>
                  ) : (
                    <p className="muted mt-1 text-xs">
                      {weatherError ??
                        (selectedSession?.lat !== null && selectedSession?.lat !== undefined
                          ? "Loading live Open-Meteo weather…"
                          : "Waiting for phone location.")}
                    </p>
                  )}
                </div>
              </section>

              <section className="card p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="h-4 w-4 text-accent-600" />
                  Demo in 4 steps
                </h2>
                <ol className="mt-4 space-y-3">
                  {[
                    "Pair a phone and open the QR link on your mobile.",
                    "Allow camera + location; tap Start camera stream.",
                    "Point at the field and walk a person or animal through frame.",
                    "Watch the box, label, confidence and movement trail appear here.",
                  ].map((step, index) => (
                    <li key={step} className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-[10px] font-semibold text-leaf-700">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Synthetic intrusion simulation was removed. Every alert on this
                  page comes from a real camera track.
                </p>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function LivePlayer({
  session,
  detections,
  frameAge,
}: {
  session: CameraSessionDTO | null;
  detections: FrameDetection[];
  frameAge: number | null;
}) {
  return (
    <section className="camera-surface relative overflow-hidden rounded-2xl bg-slate-950 shadow-[var(--shadow-card)]" aria-label="Camera preview">
      <div
        className="relative aspect-[4/3] w-full sm:aspect-video"
        style={{
          aspectRatio:
            session?.frameWidth && session?.frameHeight
              ? `${session.frameWidth} / ${session.frameHeight}`
              : undefined,
        }}
      >
        {session?.frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.frameUrl}
            alt={`Live frame from ${session.name}`}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-leaf-300">
              <Camera aria-hidden className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-slate-100">
              Waiting for the phone camera
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-slate-400">
              Scan the QR code, tap Start camera stream, then point the phone at
              the field.
            </p>
          </div>
        )}

        {detections.map((detection) => {
          const style = CATEGORY_STYLES[detection.category];
          const [x, y, w, h] = detection.box;
          return (
            <div
              key={detection.trackId}
              className={`pointer-events-none absolute border-2 ${style.border}`}
              style={{
                left: `${x * 100}%`,
                top: `${y * 100}%`,
                width: `${w * 100}%`,
                height: `${h * 100}%`,
                backgroundColor: style.fill,
                boxShadow: "0 0 0 1px rgba(2,6,23,0.35)",
              }}
            >
              <span
                className={`absolute -top-5 left-[-2px] inline-flex max-w-[160px] items-center gap-1 truncate rounded-t-md px-1.5 py-0.5 text-[10px] font-extrabold leading-none ${style.text}`}
              >
                {detection.emoji} {detection.label}
                <span className="opacity-70">
                  {Math.round(detection.confidence * 100)}%
                </span>
              </span>
            </div>
          );
        })}

        {detections.length > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {detections.map((detection) => {
              if (!detection.path || detection.path.length < 2) return null;
              const points = detection.path
                .map((point) => `${point[0] * 100},${point[1] * 100}`)
                .join(" ");
              return (
                <polyline
                  key={`trail-${detection.trackId}`}
                  points={points}
                  fill="none"
                  stroke={
                    detection.category === "person"
                      ? "#fbbf24"
                      : detection.category === "animal"
                        ? "#f87171"
                        : "#38bdf8"
                  }
                  strokeWidth={0.35}
                  strokeDasharray="0.8 0.8"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        ) : null}

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span
            className={
              session?.isLive
                 ? "inline-flex items-center gap-1.5 rounded-full bg-danger-500 px-2.5 py-1 text-[11px] font-semibold text-white"
                 : "inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-200"
            }
          >
            <span
              className={
                session?.isLive
                   ? "h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white"
                  : "h-1.5 w-1.5 rounded-full bg-slate-400"
              }
            />
            {session?.isLive ? "Live" : "Offline"}
          </span>
          {session?.aiEnabled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-200 backdrop-blur">
              <Cpu className="h-3 w-3" />
              On-device AI
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-200 backdrop-blur">
              <Activity className="h-3 w-3" />
              Motion mode
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {detections.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white/70 backdrop-blur">
                <CircleDot className="h-3 w-3" />
                No objects in frame
              </span>
            ) : (
              detections.slice(0, 4).map((detection) => (
                <span
                  key={detection.trackId}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur"
                >
                  {detection.emoji} {detection.label}
                  <span className="text-white/60">
                    {Math.round(detection.confidence * 100)}%
                  </span>
                </span>
              ))
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
            <Link2 className="h-3 w-3" />
            {frameAge === null ? "no frame yet" : `${frameAge}s frame age`}
          </span>
        </div>

      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <Camera className="h-3.5 w-3.5 text-leaf-300" />
          {session?.name ?? "Field camera"}
          {session?.deviceLabel ? (
            <span className="font-normal text-slate-400">
              · {session.deviceLabel}
            </span>
          ) : null}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
          {session?.lastSeenAt ? (
            <>
              <Radio className="h-3 w-3" />
              Last frame {formatRelative(session.lastSeenAt)}
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              No frames received
            </>
          )}
        </p>
      </footer>
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
            ? "card bg-danger-100 p-4"
            : "card p-4"
      }
    >
      <p className="muted flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ContextRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 py-2">
      <p className="muted flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </p>
      <p className="mt-1 break-words text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function lanScore(address: string): number {
  if (address.startsWith("192.168.")) return 4;
  if (address.startsWith("10.")) return 3;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  if (address.startsWith("100.")) return 1;
  return 0;
}

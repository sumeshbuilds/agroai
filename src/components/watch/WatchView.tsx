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
import { ApiError, api } from "@/lib/api-client";
import {
  CATEGORY_STYLES,
  cameraStats,
  type CameraDetectionDTO,
  type CameraSessionDTO,
} from "@/lib/camera";
import { formatRelative } from "@/lib/format";
import {
  nextPollDelay,
  nextSessionListDelay,
} from "@/lib/camera-link";
import {
  cameraFrameVersion, loadCameraPreviewFrame, snapshotFrameDetections,
  type CameraPreviewFrame,
} from "@/lib/camera-preview";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useI18n } from "@/lib/i18n";
import { CAMERA_WATCH_RADIUS_KM } from "@/lib/map";
import type { WeatherSnapshot } from "@/lib/weather";

interface SessionDetail {
  session: CameraSessionDTO;
  detections: CameraDetectionDTO[];
}

interface LinkProfile {
  saveData: boolean;
  effectiveType: string;
  slow: boolean;
  online: boolean;
}

function readLinkProfile(): LinkProfile {
  if (typeof navigator === "undefined") {
    return { saveData: false, effectiveType: "", slow: false, online: true };
  }
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = connection?.effectiveType ?? "";
  return {
    saveData,
    effectiveType,
    slow: saveData || effectiveType === "2g" || effectiveType === "slow-2g",
    online: navigator.onLine !== false,
  };
}

export function WatchView() {
  const { t } = useI18n();
  const origin = useClientValue(() => window.location.origin, "");
  const hostname = useClientValue(() => window.location.hostname, "");
  const protocol = useClientValue(() => window.location.protocol, "http:");
  const port = useClientValue(() => window.location.port, "");

  const [sessions, setSessions] = useState<CameraSessionDTO[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<CameraPreviewFrame | null>(null);
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
  const [network, setNetwork] = useState<LinkProfile>(() => ({
    saveData: false,
    effectiveType: "",
    slow: false,
    online: true,
  }));
  const [syncState, setSyncState] = useState<"idle" | "ok" | "retrying">("idle");
  const [sourceUpdatedAt, setSourceUpdatedAt] = useState({
    sessions: 0,
    detail: 0,
  });

  const selectedRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const mutationRef = useRef(false);
  const epochRef = useRef(0);
  const sessionsControllerRef = useRef<AbortController | null>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const sessionsRequestRef = useRef<Promise<void> | null>(null);
  const detailRequestRef = useRef<{ id: number; promise: Promise<void> } | null>(null);
  const previewRef = useRef<CameraPreviewFrame | null>(null);
  const ownedUrlsRef = useRef(new Set<string>());
  const copiedTimerRef = useRef(0);
  const detailFailuresRef = useRef(0);
  const sessionsFailuresRef = useRef(0);
  const selectedLiveRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    const urls = ownedUrlsRef.current;
    return () => {
      activeRef.current = false;
      epochRef.current += 1;
      sessionsControllerRef.current?.abort();
      detailControllerRef.current?.abort();
      window.clearTimeout(copiedTimerRef.current);
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: {
          addEventListener?: (type: string, listener: () => void) => void;
          removeEventListener?: (type: string, listener: () => void) => void;
        };
      }
    ).connection;
    const update = () => setNetwork(readLinkProfile());
    update();
    connection?.addEventListener?.("change", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      connection?.removeEventListener?.("change", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const src = previewFrame?.src;
    const urls = ownedUrlsRef.current;
    return () => {
      if (src && urls.delete(src)) URL.revokeObjectURL(src);
    };
  }, [previewFrame?.src]);

  const selectSession = useCallback((id: number | null) => {
    if (selectedRef.current === id) return;
    selectedRef.current = id;
    detailControllerRef.current?.abort();
    detailFailuresRef.current = 0;
    setSourceUpdatedAt((current) => ({ ...current, detail: 0 }));
    setSyncState("idle");
    previewRef.current = null;
    setPreviewFrame(null);
    setDetailError(null);
    setSelectedId(id);
  }, []);

  const commitPreview = useCallback((frame: CameraPreviewFrame) => {
    ownedUrlsRef.current.add(frame.src);
    previewRef.current = frame;
    setPreviewFrame(frame);
  }, []);

  const activeDetail = detail?.session.id === selectedId ? detail : null;
  const listedSession = sessions.find((s) => s.id === selectedId) ?? null;
  const selectedSession =
    activeDetail &&
    listedSession &&
    sourceUpdatedAt.sessions > sourceUpdatedAt.detail
      ? // The lightweight list poll can be fresher than a stalled detail poll.
        // Overlay it so an external stop/restart is not hidden.
        { ...activeDetail.session, ...listedSession }
      : activeDetail?.session ?? listedSession ?? null;

  useEffect(() => {
    selectedLiveRef.current = Boolean(selectedSession?.isLive);
  }, [selectedSession?.isLive]);

  // ---- data loading ------------------------------------------------------
  const loadSessions = useCallback(async (silent = false) => {
    if (!activeRef.current || mutationRef.current) return;
    if (sessionsRequestRef.current) return sessionsRequestRef.current;
    const controller = new AbortController();
    sessionsControllerRef.current = controller;
    const epoch = epochRef.current;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    const task = (async () => {
      try {
        const data = await api.listCameraSessions({ signal: controller.signal });
        if (!activeRef.current || controller.signal.aborted || epoch !== epochRef.current) return;
        setSessions(data.sessions);
        setNeedsSetup(false);
        setError(null);
        sessionsFailuresRef.current = 0;
        setSourceUpdatedAt((current) => ({ ...current, sessions: Date.now() }));
        const current = selectedRef.current;
        if (current === null || !data.sessions.some((session) => session.id === current)) {
          selectSession(data.sessions.find((session) => session.isLive)?.id ?? data.sessions[0]?.id ?? null);
        }
      } catch (cause) {
        if (!activeRef.current || epoch !== epochRef.current || (controller.signal.aborted && !timedOut)) return;
        sessionsFailuresRef.current = Math.min(5, sessionsFailuresRef.current + 1);
        if (cause instanceof ApiError && cause.code === "DB_NOT_CONFIGURED") setNeedsSetup(true);
        setError(silent ? "Camera list connection lost. Previously loaded cameras are kept; tap Refresh to retry."
          : cause instanceof Error ? cause.message : "Could not load camera sessions.");
      } finally {
        window.clearTimeout(timeout);
        if (sessionsControllerRef.current === controller) {
          sessionsControllerRef.current = null;
          sessionsRequestRef.current = null;
        }
        if (activeRef.current) setSessionsLoading(false);
      }
    })();
    sessionsRequestRef.current = task;
    return task;
  }, [selectSession]);

  const loadDetail = useCallback(async (id: number, silent = false) => {
    if (!activeRef.current || mutationRef.current || selectedRef.current !== id) return;
    if (detailRequestRef.current?.id === id && !detailControllerRef.current?.signal.aborted) return detailRequestRef.current.promise;
    detailControllerRef.current?.abort();
    const controller = new AbortController();
    detailControllerRef.current = controller;
    const epoch = epochRef.current;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 12_000);
    const accept = () => activeRef.current && !controller.signal.aborted && selectedRef.current === id && epoch === epochRef.current;
    const markOk = () => {
      detailFailuresRef.current = 0;
      setSyncState((current) => (current === "ok" ? current : "ok"));
    };
    const task = (async () => {
      try {
        // At most one metadata+JPEG operation per camera. A superseded image
        // gets one immediate metadata refresh, not an overlapping poll storm.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const data = await api.getCameraSession(id, { signal: controller.signal });
          if (!accept()) return;
          setDetail(data);
          setSourceUpdatedAt((current) => ({ ...current, detail: Date.now() }));
          const version = cameraFrameVersion(data.session);
          const current = previewRef.current;
          if (!version) { setDetailError(null); markOk(); return; }
          if (current?.sessionId === id && current.version === version) {
            commitPreview({ ...current, detections: snapshotFrameDetections(data.session.latestDetections) });
            setDetailError(null);
            markOk();
            return;
          }
          // A hidden dashboard does not need the JPEG. Metadata still refreshes
          // so session status stays correct; the next visible tick fetches the
          // newest frame.
          if (document.visibilityState !== "visible") {
            setDetailError(null);
            markOk();
            return;
          }
          try {
            const frame = await loadCameraPreviewFrame(data.session, controller.signal);
            if (!accept()) { URL.revokeObjectURL(frame.src); return; }
            commitPreview(frame);
            setDetailError(null);
            markOk();
            return;
          } catch (cause) {
            if (cause instanceof ApiError && cause.code === "FRAME_SUPERSEDED" && attempt === 0) continue;
            throw cause;
          }
        }
      } catch (cause) {
        if (!activeRef.current || selectedRef.current !== id || epoch !== epochRef.current || (controller.signal.aborted && !timedOut)) return;
        const superseded =
          cause instanceof ApiError && cause.code === "FRAME_SUPERSEDED";
        if (!superseded) {
          detailFailuresRef.current = Math.min(6, detailFailuresRef.current + 1);
          setSyncState("retrying");
        }
        setDetailError(superseded
          ? "A newer snapshot is arriving. The previous matching image and boxes are kept."
          : silent ? "Camera connection lost. The previous matching image and boxes are kept; tap Refresh to retry."
          : cause instanceof Error ? cause.message : "Could not load this camera.");
      } finally {
        window.clearTimeout(timeout);
        if (detailControllerRef.current === controller) {
          detailControllerRef.current = null;
          detailRequestRef.current = null;
        }
      }
    })();
    detailRequestRef.current = { id, promise: task };
    return task;
  }, [commitPreview]);

  const refreshNow = async () => {
    setRefreshing(true);
    sessionsFailuresRef.current = 0;
    detailFailuresRef.current = 0;
    try {
      await loadSessions(true);
      if (selectedRef.current !== null) {
        await loadDetail(selectedRef.current, true);
      }
    } finally {
      if (activeRef.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const tick = async (silent = true) => {
      await loadSessions(silent);
      if (stopped) return;
      timer = window.setTimeout(
        () => void tick(),
        nextSessionListDelay({
          hidden: document.visibilityState !== "visible",
          online: network.online,
          failures: sessionsFailuresRef.current,
        }),
      );
    };
    timer = window.setTimeout(() => void tick(false), 0);
    const retry = () => {
      if (
        document.visibilityState !== "visible" ||
        sessionsRequestRef.current ||
        mutationRef.current
      ) {
        return;
      }
      sessionsFailuresRef.current = 0;
      window.clearTimeout(timer);
      void tick();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      sessionsControllerRef.current?.abort();
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [loadSessions, network.online]);

  useEffect(() => {
    let active = true;
    api
      .getCameraNetwork()
      .then((data) => {
        if (active) setNetworkIps(
          data.addresses
            .map((entry) => entry.address)
            .sort((a, b) => lanScore(b) - lanScore(a)),
        );
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedId === null) return;
    let stopped = false;
    let timer = 0;
    const tick = async (silent = true) => {
      await loadDetail(selectedId, silent);
      if (stopped) return;
      timer = window.setTimeout(
        () => void tick(),
        nextPollDelay({
          hidden: document.visibilityState !== "visible",
          online: network.online,
          failures: detailFailuresRef.current,
          live: selectedLiveRef.current,
          slow: network.slow,
          hasFrame: Boolean(previewRef.current),
        }),
      );
    };
    timer = window.setTimeout(() => void tick(false), 0);
    const retry = () => {
      if (
        document.visibilityState !== "visible" ||
        detailRequestRef.current ||
        mutationRef.current
      ) {
        return;
      }
      detailFailuresRef.current = 0;
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", retry);
    window.addEventListener("online", retry);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      detailControllerRef.current?.abort();
      document.removeEventListener("visibilitychange", retry);
      window.removeEventListener("online", retry);
    };
  }, [selectedId, loadDetail, network.slow, network.online]);

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
  const beginMutation = () => {
    if (mutationRef.current) return false;
    mutationRef.current = true;
    epochRef.current += 1;
    sessionsControllerRef.current?.abort();
    detailControllerRef.current?.abort();
    return true;
  };
  const finishMutation = () => { mutationRef.current = false; epochRef.current += 1; };

  const createSession = async () => {
    if (!beginMutation()) return;
    setCreating(true);
    setNotice(null);
    setError(null);
    try {
      const name = `Field camera ${sessions.length + 1}`;
      const { session } = await api.createCameraSession(name);
      if (!activeRef.current) return;
      setSessions((current) => [session, ...current]);
      selectSession(session.id);
      setDetail({ session, detections: [] });
      setNotice("Camera paired. Scan the QR code with your phone.");
    } catch (cause) {
      if (activeRef.current) setError(cause instanceof Error ? cause.message : "Could not create the camera.");
    } finally {
      finishMutation();
      if (activeRef.current) setCreating(false);
    }
  };

  const setStatus = async (status: "live" | "ended") => {
    if (!selectedSession || !beginMutation()) return;
    const id = selectedSession.id;
    setBusy(status);
    setNotice(null);
    try {
      const { session } = await api.updateCameraSession(id, {
        status,
      });
      if (!activeRef.current) return;
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
          current?.session.id === id ? { ...current, session: { ...current.session, latestDetections: [] } } : current,
        );
        if (previewRef.current?.sessionId === id) commitPreview({ ...previewRef.current, detections: [] });
      }
    } catch (cause) {
      if (activeRef.current) setError(cause instanceof Error ? cause.message : "Could not update the camera.");
    } finally {
      finishMutation();
      if (activeRef.current) setBusy(null);
    }
  };

  const removeSession = async () => {
    if (!selectedSession) return;
    if (!window.confirm(t("Delete “{name}” and its detection history?", { name: selectedSession.name }))) {
      return;
    }
    if (!beginMutation()) return;
    const id = selectedSession.id;
    setBusy("delete");
    try {
      await api.deleteCameraSession(id);
      if (!activeRef.current) return;
      const remaining = sessions.filter((item) => item.id !== id);
      setSessions((current) => current.filter((item) => item.id !== id));
      if (selectedRef.current === id) selectSession(remaining[0]?.id ?? null);
      setDetail((current) => current?.session.id === id ? null : current);
      setNotice("Camera removed.");
    } catch (cause) {
      if (activeRef.current) setError(cause instanceof Error ? cause.message : "Could not delete the camera.");
    } finally {
      finishMutation();
      if (activeRef.current) setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!phoneUrl) return;
    try {
      await navigator.clipboard.writeText(phoneUrl);
      if (!activeRef.current) return;
      setCopied(true);
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard blocked. Select the link and copy it manually.");
    }
  };

  const activePreview = previewFrame?.sessionId === selectedId ? previewFrame : null;
  const liveDetections = activePreview?.detections ?? [];
  const stats = cameraStats(liveDetections);
  const frameAge =
    activePreview?.capturedAt && clock > 0
      ? Math.max(
          0,
          Math.round(
            (clock - new Date(activePreview.capturedAt).getTime()) / 1000,
          ),
        )
      : null;

  const linkTrouble = !network.online || syncState === "retrying";
  const liveChipLabel = linkTrouble
    ? t(network.online ? "Reconnecting…" : "Offline")
    : selectedSession?.isLive
      ? t("Live camera")
      : selectedSession?.status === "live"
        ? t("Waiting for frames")
        : selectedSession?.status === "ended"
          ? t("Stream ended")
          : t("No live camera");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6">
        <SectionHeading
          title={t("Animal & people watch")}
          subtitle={t(
            "Your phone is the camera. It watches for people and animals on-device and streams what it sees here — satellites map the land, cameras watch what moves on it.",
          )}
          icon={<Radar aria-hidden className="h-5 w-5" />}
          action={<>
          <span
            className={
              !linkTrouble && selectedSession?.isLive
                ? "chip chip-brand"
                : selectedSession?.status === "live" || linkTrouble
                  ? "chip chip-warn"
                  : "chip bg-[var(--card-muted)] text-[var(--muted)]"
            }
          >
            <span
              className={
                !linkTrouble && selectedSession?.isLive
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
            {t("Refresh")}
          </Button>
           <Button onClick={createSession} loading={creating} disabled={busy !== null}>
            <Plus className="h-4 w-4" />
            {t("Pair a phone")}
          </Button>
          </>}
        />
      </div>

      <SetupNotice showDatabase={needsSetup} />

      {notice ? <Callout tone="success" className="mb-3">{t(notice)}</Callout> : null}
      {error ? <Callout tone="danger" className="mb-3">{t(error)}</Callout> : null}

      {sessionsLoading && sessions.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="card h-[460px] animate-pulse-soft" />
          <div className="card h-[460px] animate-pulse-soft" />
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<Camera className="h-7 w-7" />}
          title={t("Pair your phone as the first field camera")}
          description={t(
            "Tap “Pair a phone”, scan the QR code on your mobile, then point the rear camera at the demo field. People and animals show up here with live boxes and movement direction.",
          )}
          action={
            <Button onClick={createSession} loading={creating} disabled={busy !== null}>
              <Smartphone className="h-4 w-4" />
              {t("Pair a phone camera")}
            </Button>
          }
        />
      ) : (
        <>
          <nav aria-label={t("Camera sessions")} className="mb-5 flex flex-wrap gap-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => selectSession(session.id)}
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
                    {t("LIVE")}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-5">
              {detailError ? <Callout tone="danger">{t(detailError)}</Callout> : null}

              <LivePlayer
                session={selectedSession}
                frame={activePreview}
                frameAge={frameAge}
                syncState={syncState}
                online={network.online}
              />

              <section aria-label={t("Camera statistics")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  icon={<Users className="h-4 w-4" />}
                  label={t("People")}
                  value={String(stats.persons)}
                  accent={stats.persons > 0}
                />
                <StatTile
                  icon={<PawPrint className="h-4 w-4" />}
                  label={t("Animals")}
                  value={String(stats.animals)}
                  accent={stats.animals > 0}
                />
                <StatTile
                  icon={<Gauge className="h-4 w-4" />}
                  label={t("Motion")}
                  value={`${Math.round((selectedSession?.motion ?? 0) * 1000) / 10}%`}
                />
                <StatTile
                  icon={<Cpu className="h-4 w-4" />}
                  label={t("On-device AI")}
                  value={
                    selectedSession?.aiEnabled
                      ? t("Active")
                      : selectedSession?.status === "ended"
                        ? t("Stopped")
                         : t("Detection unavailable")
                  }
                />
              </section>

              <section className="card overflow-hidden">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-5">
                  <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <Activity className="h-4 w-4 text-accent-600" />
                      {t("Detection feed")}
                    </h2>
                    <p className="muted mt-1.5 text-xs leading-relaxed">
                      {t("Confirmed human and animal tracks from the live camera")}
                    </p>
                  </div>
                  <span className="chip chip-violet">
                    {t("{count} logged", { count: selectedSession?.totalDetections ?? 0 })}
                  </span>
                </header>

                {!activeDetail || activeDetail.detections.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
                    <Eye className="h-6 w-6 text-[var(--color-ink-soft)]" />
                    <p className="text-sm font-semibold">{t("No tracks logged yet")}</p>
                    <p className="muted max-w-sm text-xs leading-relaxed">
                      {t(
                        "Walk a person or animal through the camera frame. Each new track appears here once, with its confidence and movement direction.",
                      )}
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
                              {t(detection.label)}
                              {detection.confidence ? (
                                <span className="muted ml-2 text-xs font-medium tabular-nums">
                                  {Math.round(detection.confidence * 100)}%
                                </span>
                              ) : null}
                            </p>
                            <p className="muted text-xs">
                              {t(detection.direction ?? "in frame")} ·{" "}
                              {t(formatRelative(detection.createdAt))}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {detection.category === "person" ? (
                              <span className="chip chip-warn">{t("Human")}</span>
                            ) : (
                              <span className="chip chip-danger">{t("Animal")}</span>
                            )}
                            {detection.verified ? (
                              <span
                                className="chip chip-brand"
                                title={t("Confirmed by Groq vision")}
                              >
                                <Sparkles className="h-3 w-3" />
                                {t("AI")}
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
                  <h2 className="text-base font-semibold">{t("Phone pairing")}</h2>
                  {selectedSession?.isLive ? (
                    <span className="chip chip-brand ml-auto">
                      <Signal className="h-3 w-3" />
                      {t("connected")}
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
                            {t("Scan with the phone camera, allow camera + location, then tap")}{" "}
                            <strong>{t("Start camera stream")}</strong>.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="chip max-w-full whitespace-normal break-words bg-[var(--card-muted)] text-[var(--muted)]">
                              {selectedSession.deviceLabel ?? t("Waiting for phone")}
                            </span>
                            {selectedSession.lat !== null ? (
                              <span className="chip chip-violet">
                                <MapPin className="h-3 w-3" />
                                {t("GPS linked")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl bg-[var(--card-muted)] p-3">
                        <p className="muted mb-1.5 text-xs font-medium">
                          {t("Camera link")}
                        </p>
                        <p className="break-all font-mono text-[11px] leading-relaxed">
                          {phoneUrl || t("Getting your network address…")}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => void copyLink()} disabled={!phoneUrl}>
                          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                          {copied ? t("Copied") : t("Copy link")}
                        </Button>
                        {phoneUrl ? (
                          <a
                            href={phoneUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-secondary"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {t("Open")}
                          </a>
                        ) : null}
                      </div>

                      {!phoneIsSecure ? (
                        <details className="rounded-xl bg-warn-100 px-3.5 py-2 text-xs text-warn-700">
                          <summary className="min-h-11 content-center font-semibold leading-relaxed">
                            {t("Phone camera needs HTTPS — tap for setup")}
                          </summary>
                          <ol className="mb-2 mt-2 list-decimal space-y-2 break-words pl-4 leading-relaxed [overflow-wrap:anywhere]">
                            <li>
                              {t(
                                "Best for the exhibition: deploy to Vercel or use a Cloudflare / ngrok HTTPS tunnel.",
                              )}
                            </li>
                            <li>
                              {t(
                                "Android Chrome workaround: open {flag}, add {origin}, enable, relaunch Chrome.",
                                {
                                  flag: "chrome://flags/#unsafely-treat-insecure-origin-as-secure",
                                  origin: phoneUrl.split("/camera")[0],
                                },
                              )}
                            </li>
                            <li>
                              {t("Or run {command} and accept the certificate on the phone.", {
                                command: "npm run dev:https",
                              })}
                            </li>
                          </ol>
                        </details>
                      ) : null}

                      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                        {selectedSession.status === "ended" ? (
                          <Button
                             onClick={() => void setStatus("live")}
                             loading={busy === "live"}
                             disabled={creating || (busy !== null && busy !== "live")}
                          >
                            <Play className="h-4 w-4" />
                            {t("Restart stream")}
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                             onClick={() => void setStatus("ended")}
                             loading={busy === "ended"}
                             disabled={creating || (busy !== null && busy !== "ended")}
                          >
                            <CameraOff className="h-4 w-4" />
                            {t("Stop stream")}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                           onClick={() => void removeSession()}
                           loading={busy === "delete"}
                           disabled={creating || (busy !== null && busy !== "delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("Delete")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="muted text-sm">{t("Select or create a camera first.")}</p>
                  )}
                </div>
              </section>

              <section className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <MapPin className="h-4 w-4 text-leaf-600" />
                    {t("Field context")}
                  </h2>
                  <Link href="/map" className="inline-flex min-h-11 items-center text-xs font-medium text-accent-700 underline-offset-4 hover:underline">
                    {t("Satellite map")}
                  </Link>
                </div>

                {selectedSession?.farm ? (
                  <div className="mt-3 border-b border-[var(--border)] pb-4">
                    <p className="text-sm font-semibold">{selectedSession.farm.name}</p>
                    <p className="muted mt-1.5 text-xs leading-relaxed">
                      {t("Camera is {distance} to the {direction} of this field.", {
                        distance: formatDistance(selectedSession.farm.distanceKm, t),
                        direction: t(selectedSession.farm.direction),
                      })}
                    </p>
                    {selectedSession.farm.distanceKm > CAMERA_WATCH_RADIUS_KM ? (
                      <p className="mt-1 text-xs font-semibold text-mustard-600">
                        {t("Camera is outside the {radius} km field watch radius.", {
                          radius: CAMERA_WATCH_RADIUS_KM,
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted mt-3 text-xs leading-relaxed">
                    {t(
                      "Allow location on the phone to link this camera to your satellite-mapped field and show hyper-local weather.",
                    )}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
                  <ContextRow
                    icon={<Ruler className="h-3.5 w-3.5" />}
                    label={t("Live camera")}
                    value={selectedSession?.isLive ? t("Streaming") : t("Offline")}
                  />
                  <ContextRow
                    icon={<Signal className="h-3.5 w-3.5" />}
                    label={t("Frame latency")}
                    value={frameAge === null ? "—" : `${frameAge}s`}
                  />
                  <ContextRow
                    icon={<MapPin className="h-3.5 w-3.5" />}
                    label={t("Phone GPS")}
                    value={
                      selectedSession?.lat !== null && selectedSession?.lat !== undefined
                        ? `${selectedSession.lat.toFixed(3)}, ${selectedSession.lng?.toFixed(3)}`
                        : t("Not shared")
                    }
                  />
                  <ContextRow
                    icon={<Bot className="h-3.5 w-3.5" />}
                    label={t("Detector")}
                    value={
                      selectedSession?.aiEnabled
                         ? t("On-device AI; optional verification")
                         : t("Detection unavailable")
                    }
                  />
                </div>

                <div className="mt-3 border-t border-[var(--border)] pt-3">
                  <p className="muted text-xs font-medium">
                    {t("Weather at the camera")}
                  </p>
                  {weather ? (
                    <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-1">
                      <p className="text-2xl font-bold tabular-nums">
                        {weather.current.temperature?.toFixed(0) ?? "—"}°C
                      </p>
                      <p className="muted text-xs">
                        {t("Rain {rain} mm · Wind {wind} km/h", {
                          rain: weather.current.precipitation ?? 0,
                          wind: weather.current.windSpeed ?? 0,
                        })}
                      </p>
                      <p className="muted text-xs">
                        {t("Soil {value}", {
                          value:
                            weather.current.soilMoisture === null
                              ? "—"
                              : `${(weather.current.soilMoisture * 100).toFixed(0)}%`,
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className="muted mt-1 text-xs">
                      {weatherError
                        ? t(weatherError)
                        : selectedSession?.lat !== null && selectedSession?.lat !== undefined
                          ? t("Loading live Open-Meteo weather…")
                          : t("Waiting for phone location.")}
                    </p>
                  )}
                </div>
              </section>

              <section className="card p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="h-4 w-4 text-accent-600" />
                  {t("Demo in 4 steps")}
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
                      <span>{t(step)}</span>
                    </li>
                  ))}
                </ol>
                <p className="muted mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t(
                    "Synthetic intrusion simulation was removed. Every alert on this page comes from a real camera track.",
                  )}
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
  frame,
  frameAge,
  syncState,
  online,
}: {
  session: CameraSessionDTO | null;
  frame: CameraPreviewFrame | null;
  frameAge: number | null;
  syncState: "idle" | "ok" | "retrying";
  online: boolean;
}) {
  const { t } = useI18n();
  const detections = frame?.detections ?? [];
  return (
    <section className="camera-surface relative overflow-hidden rounded-2xl bg-slate-950 shadow-[var(--shadow-card)]" aria-label={t("Camera preview")}>
      <div
        className="relative aspect-[4/3] w-full sm:aspect-video"
        style={{
          aspectRatio:
            frame?.width && frame.height
              ? `${frame.width} / ${frame.height}`
              : undefined,
        }}
      >
        {frame && session ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame.src}
            data-camera-frame-version={frame.version}
            alt={t("Live frame from {name}", { name: session.name })}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-leaf-300">
              <Camera aria-hidden className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-slate-100">
              {t("Waiting for the phone camera")}
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-slate-400">
              {t(
                "Scan the QR code, tap Start camera stream, then point the phone at the field.",
              )}
            </p>
          </div>
        )}

        {detections.map((detection) => {
          const style = CATEGORY_STYLES[detection.category];
          const [x, y, w, h] = detection.box;
          return (
            <div
              key={detection.trackId}
              data-camera-track-id={detection.trackId}
              data-camera-frame-version={frame?.version}
              className={`pointer-events-none absolute border-2 ${style.border} ${detection.coasting ? "border-dashed opacity-50" : ""}`}
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
                className={`absolute inline-flex max-w-[160px] items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold leading-none ${style.text}`}
                style={{ top: y < 0.08 ? 0 : -24, left: x > 0.7 ? undefined : -2, right: x > 0.7 ? -2 : undefined }}
                title={t(detection.label)}
              >
                <span className="truncate">{t(detection.label)}{detection.coasting ? ` · ${t("Predicted")}` : ""}</span>
                <span className="shrink-0">
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
                   opacity={detection.coasting ? 0.5 : 1}
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
            {session?.isLive ? t("Live") : t("Offline")}
          </span>
          {!online || syncState === "retrying" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-100 backdrop-blur">
              <WifiOff className="h-3 w-3" />
              {t(online ? "Reconnecting…" : "Offline")}
            </span>
          ) : null}
          {session?.aiEnabled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-200 backdrop-blur">
              <Cpu className="h-3 w-3" />
              {t("On-device AI")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-200 backdrop-blur">
              <Activity className="h-3 w-3" />
              {t("Video only")}
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {detections.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[10px] font-semibold text-white/70 backdrop-blur">
                <CircleDot className="h-3 w-3" />
                {t(session?.aiEnabled ? "No detections in this snapshot" : "Detection unavailable")}
              </span>
            ) : (
              detections.slice(0, 4).map((detection) => (
                <span
                  key={detection.trackId}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur"
                >
                  {t(detection.label)}{detection.coasting ? ` · ${t("Predicted")}` : ""}
                  <span className="text-white/80">
                    {Math.round(detection.confidence * 100)}%
                  </span>
                </span>
              ))
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
            <Link2 className="h-3 w-3" />
            {frameAge === null
              ? t("no frame yet")
              : t("{seconds}s frame age", { seconds: frameAge })}
          </span>
        </div>

      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <Camera className="h-3.5 w-3.5 text-leaf-300" />
          {session?.name ?? t("Field camera")}
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
              {t("Last frame {time}", {
                time: t(formatRelative(session.lastSeenAt)),
              })}
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              {t("No frames received")}
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

function formatDistance(km: number, t: (text: string) => string): string {
  if (km < 1) return `${Math.round(km * 1000)} ${t("m")}`;
  return `${km.toFixed(1)} ${t("km")}`;
}

function lanScore(address: string): number {
  if (address.startsWith("192.168.")) return 4;
  if (address.startsWith("10.")) return 3;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  if (address.startsWith("100.")) return 1;
  return 0;
}

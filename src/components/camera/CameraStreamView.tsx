"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ObjectDetection } from "@tensorflow-models/coco-ssd";
import Link from "next/link";
import {
  Activity,
  BellRing,
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  FlipHorizontal,
  Flashlight,
  Gauge,
  Loader2,
  MapPin,
  Radio,
  ScanEye,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import { ApiError, api } from "@/lib/api-client";
import {
  CATEGORY_COLORS,
  clamp01,
  enrichDetection,
  isTrackableClass,
  objectMeta,
  TRACK_CONFIRM_CONFIDENCE,
  TRACK_CONFIRM_HITS,
  TRACK_MEMORY_MS,
  type CameraAlertDTO,
  type CameraIngestPayload,
  type CameraSessionDTO,
  type DetectionBox,
  type FrameDetection,
  type IngestDetection,
  type TrackedCategory,
} from "@/lib/camera";
import { useClientValue } from "@/lib/hooks/use-client-value";

type AiState = "idle" | "loading" | "ready" | "unavailable";
type UploadState = "idle" | "ok" | "error" | "stopped";

interface TrackState {
  id: string;
  objectClass: string;
  category: TrackedCategory;
  confidence: number;
  box: DetectionBox;
  center: [number, number];
  area: number;
  path: Array<[number, number]>;
  firstSeen: number;
  lastSeen: number;
  lastStep: number;
  hits: number;
  moving: boolean;
  confirmed: boolean;
  direction?: string;
  speed?: number;
}

interface GeoState {
  lat: number;
  lng: number;
  accuracy: number;
}

interface WakeLockLike {
  release: () => Promise<void>;
}

interface NetworkProfile {
  saveData: boolean;
  effectiveType: string;
  slow: boolean;
}

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

const DETECT_MAX_WIDTH = 416;
/** Detection cadence (ms): moving object, idle scene, hidden tab. */
const DETECT_INTERVAL_ACTIVE = 350;
const DETECT_INTERVAL_IDLE = 950;
const DETECT_INTERVAL_HIDDEN = 2_500;
/** Upload cadence (ms). */
const UPLOAD_INTERVAL_ACTIVE = 700;
const UPLOAD_INTERVAL_IDLE = 2_600;
const UPLOAD_INTERVAL_SLOW = 5_000;
const IDLE_UPLOAD_INTERVAL_SLOW = 6_500;

function iou(a: DetectionBox, b: DetectionBox): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function centerDistance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function smoothBox(previous: DetectionBox, next: DetectionBox): DetectionBox {
  const alpha = 0.62;
  return [
    previous[0] + (next[0] - previous[0]) * alpha,
    previous[1] + (next[1] - previous[1]) * alpha,
    previous[2] + (next[2] - previous[2]) * alpha,
    previous[3] + (next[3] - previous[3]) * alpha,
  ];
}

function trackPrefix(category: TrackedCategory): string {
  return category === "person" ? "p" : "a";
}

function describeDirection(
  dx: number,
  dy: number,
  areaRatio: number,
): string | undefined {
  if (areaRatio > 1.16) return "coming closer";
  if (areaRatio < 0.86) return "moving away";
  if (Math.hypot(dx, dy) < 0.004) return undefined;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    return dx > 0 ? "moving right" : "moving left";
  }
  return dy > 0 ? "moving down-frame" : "moving up-frame";
}

function deviceLabel(): string {
  if (typeof navigator === "undefined") return "Camera";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone camera";
  if (/iPad/i.test(ua)) return "iPad camera";
  if (/Android/i.test(ua)) return "Android camera";
  return "Mobile camera";
}

function networkProfile(): NetworkProfile {
  if (typeof navigator === "undefined") {
    return { saveData: false, effectiveType: "", slow: false };
  }
  const connection = (
    navigator as Navigator & { connection?: ConnectionLike }
  ).connection;
  const saveData = Boolean(connection?.saveData);
  const effectiveType = connection?.effectiveType ?? "";
  const slow =
    saveData || effectiveType === "slow-2g" || effectiveType === "2g";

  return { saveData, effectiveType, slow };
}

/** Keeps the strongest box when the model reports near-duplicates. */
function suppressDuplicates<
  T extends { box: DetectionBox; confidence: number; category: TrackedCategory },
>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => b.confidence - a.confidence);
  const kept: T[] = [];
  for (const item of sorted) {
    const duplicate = kept.some(
      (other) =>
        other.category === item.category && iou(other.box, item.box) > 0.6,
    );
    if (!duplicate) kept.push(item);
  }
  return kept;
}

export function CameraStreamView() {
  const token = useClientValue(
    () => new URLSearchParams(window.location.search).get("token") ?? "",
    "",
  );
  const mounted = useClientValue(() => true, false);
  const secure = useClientValue(() => window.isSecureContext, false);
  const hasMedia = useClientValue(
    () => Boolean(navigator.mediaDevices?.getUserMedia),
    false,
  );
  const host = useClientValue(() => window.location.host, "");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const captureRef = useRef<HTMLCanvasElement | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevLumRef = useRef<Uint8ClampedArray | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<ObjectDetection | null>(null);
  const aiLoadingRef = useRef(false);
  const aiReadyRef = useRef(false);
  const detectBusyRef = useRef(false);
  const uploadBusyRef = useRef(false);
  const runningRef = useRef(false);
  const tracksRef = useRef<Map<string, TrackState>>(new Map());
  const counterRef = useRef(0);
  const runIdRef = useRef("");
  const motionRef = useRef(0);
  const lastMotionAtRef = useRef(0);
  const geoRef = useRef<GeoState | null>(null);
  const wakeLockRef = useRef<WakeLockLike | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSignatureRef = useRef("");
  const alertTimerRef = useRef(0);

  const [pairing, setPairing] = useState<{
    session: CameraSessionDTO;
    farmerName: string;
  } | null>(null);
  const [pairingLoading, setPairingLoading] = useState(true);
  const [pairingError, setPairingError] = useState<string | null>(null);

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stoppedByServer, setStoppedByServer] = useState(false);

  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiError, setAiError] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [groqQueued, setGroqQueued] = useState(false);

  const [uploads, setUploads] = useState(0);
  const [motionPct, setMotionPct] = useState(0);
  const [gps, setGps] = useState<GeoState | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [detections, setDetections] = useState<FrameDetection[]>([]);
  const [phoneAlert, setPhoneAlert] = useState<CameraAlertDTO | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [network, setNetwork] = useState<NetworkProfile>(() =>
    networkProfile(),
  );

  const isEnded = pairing?.session.status === "ended";
  const linkError =
    mounted && !token
      ? "This page needs a camera link. Open Live Watch on the laptop and scan its QR code."
      : pairingError;
  const pairingBusy = token ? pairingLoading : false;
  const verifiedCount = detections.filter(
    (detection) => detection.source === "groq",
  ).length;

  // ---- pairing -----------------------------------------------------------
  useEffect(() => {
    if (!token) return;

    let active = true;

    const load = async (silent: boolean) => {
      try {
        const data = await api.getCameraPairing(token);
        if (!active) return;
        setPairing(data);
        setPairingError(null);
      } catch (cause) {
        if (!active) return;
        setPairingError(
          cause instanceof ApiError
            ? cause.message
            : "Could not load this camera session.",
        );
      } finally {
        if (active && !silent) setPairingLoading(false);
      }
    };

    void load(false);
    const timer = window.setInterval(() => void load(true), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [token]);

  // Track slow connections so quality/cadence can adapt automatically.
  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: ConnectionLike }
    ).connection;
    if (!connection?.addEventListener) return;

    const update = () => setNetwork(networkProfile());
    connection.addEventListener("change", update);
    return () => connection.removeEventListener?.("change", update);
  }, []);

  // ---- AI model ----------------------------------------------------------
  const loadAi = useCallback(async () => {
    if (aiReadyRef.current || aiLoadingRef.current) return;
    aiLoadingRef.current = true;
    setAiState("loading");
    setAiError(null);

    try {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");

      try {
        await tf.setBackend("webgl");
        await tf.ready();
      } catch {
        // CPU is slower but keeps detection alive on old GPUs.
        await tf.setBackend("cpu");
        await tf.ready();
      }

      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      aiReadyRef.current = true;
      setAiState("ready");
    } catch (cause) {
      aiReadyRef.current = false;
      setAiState("unavailable");
      setAiError(
        cause instanceof Error
          ? `AI detector unavailable — movement assist only (${cause.message}).`
          : "AI detector unavailable — movement assist only.",
      );
    } finally {
      aiLoadingRef.current = false;
    }
  }, []);

  // ---- camera lifecycle --------------------------------------------------
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    releaseStream();
    setStarted(false);
    setTorchOn(false);
    setTorchSupported(false);
    setUploadState("idle");
    setUploadError(null);
    setDetections([]);
    setGroqQueued(false);
    tracksRef.current.clear();
    lastSignatureRef.current = "";
    prevLumRef.current = null;
    window.clearTimeout(alertTimerRef.current);

    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, [releaseStream]);

  const startCamera = useCallback(
    async (nextFacing: "environment" | "user" = "environment") => {
      if (!token || starting) return;

      if (!secure || !hasMedia) {
        setCameraError(
          "Camera access needs HTTPS (or localhost). Open this page over a secure URL — see the setup steps below.",
        );
        return;
      }

      setStarting(true);
      setCameraError(null);
      setUploadError(null);
      setStoppedByServer(false);

      try {
        releaseStream();

        if (watchIdRef.current !== null) {
          navigator.geolocation?.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        void wakeLockRef.current?.release().catch(() => undefined);
        wakeLockRef.current = null;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 20, max: 30 },
          },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is not ready.");

        video.srcObject = stream;
        await video.play().catch(() => undefined);

        // Some phones resolve getUserMedia before the first frame is decoded.
        // Wait for real dimensions so uploads never send a placeholder JPEG.
        if (video.videoWidth < 32 || video.videoHeight < 32) {
          await new Promise<void>((resolve) => {
            let settled = false;
            let timer = 0;
            const finish = () => {
              if (settled) return;
              settled = true;
              video.removeEventListener("loadedmetadata", finish);
              video.removeEventListener("resize", finish);
              if (timer) window.clearTimeout(timer);
              resolve();
            };
            timer = window.setTimeout(finish, 3500);
            video.addEventListener("loadedmetadata", finish);
            video.addEventListener("resize", finish);
          });
        }

        if (video.videoWidth < 32 || video.videoHeight < 32) {
          throw new Error(
            "The camera did not provide a usable video frame. Try the rear camera or another browser.",
          );
        }

        runningRef.current = true;
        // Track ids must be unique across page reloads, otherwise the server's
        // 15-minute dedupe would swallow the next person as "already seen".
        runIdRef.current = Math.random().toString(36).slice(2, 7);
        tracksRef.current.clear();
        lastSignatureRef.current = "";
        prevLumRef.current = null;
        motionRef.current = 0;
        setStarted(true);
        setElapsed(0);
        setFacing(nextFacing);
        setUploadState("idle");
        setNetwork(networkProfile());

        // Torch is available on some Android rear cameras.
        const track = stream.getVideoTracks()[0];
        let torchAvailable = false;
        try {
          const capabilities = track?.getCapabilities?.() as
            | (MediaTrackCapabilities & { torch?: boolean })
            | undefined;
          torchAvailable = Boolean(capabilities?.torch);
        } catch {
          torchAvailable = false;
        }
        setTorchSupported(torchAvailable);

        // Keep the screen awake during the demo (best effort).
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: string) => Promise<WakeLockLike> };
        };
        if (nav.wakeLock) {
          wakeLockRef.current = await nav.wakeLock
            .request("screen")
            .catch(() => null);
        }

        // GPS is optional but lets the laptop show field weather + distance.
        if ("geolocation" in navigator) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const next: GeoState = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
              };
              geoRef.current = next;
              setGps(next);
              setGpsError(null);
            },
            () =>
              setGpsError(
                "Location blocked. Allow location for field weather and map distance.",
              ),
            {
              enableHighAccuracy: true,
              maximumAge: 20_000,
              timeout: 20_000,
            },
          );
        } else {
          setGpsError("This browser does not share location.");
        }

        void loadAi();
      } catch (cause) {
        releaseStream();
        runningRef.current = false;
        setStarted(false);
        setCameraError(
          cause instanceof Error
            ? cause.message
            : "Could not open the camera. Check permissions and try again.",
        );
      } finally {
        setStarting(false);
      }
    },
    [hasMedia, loadAi, releaseStream, secure, starting, token],
  );

  // Stop the stream if the laptop ends the session.
  useEffect(() => {
    if (pairing?.session.status !== "ended" || !started) return;

    const timer = window.setTimeout(() => {
      stopCamera();
      setStoppedByServer(true);
      setUploadState("stopped");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pairing?.session.status, started, stopCamera]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      runningRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
      }
      void wakeLockRef.current?.release().catch(() => undefined);
      window.clearTimeout(alertTimerRef.current);
    },
    [],
  );

  // ---- detection ---------------------------------------------------------
  const runDetection = useCallback(async () => {
    const model = modelRef.current;
    const video = videoRef.current;
    if (
      !runningRef.current ||
      !model ||
      !video ||
      detectBusyRef.current ||
      video.readyState < 2 ||
      video.videoWidth < 32 ||
      video.videoHeight < 32
    ) {
      return;
    }

    detectBusyRef.current = true;
    const now = performance.now();

    try {
      // Run the model on a downscaled canvas: roughly 4× fewer pixels than the
      // 1280×720 preview, which is the biggest phone-side lag win.
      const canvas =
        detectCanvasRef.current ??
        (detectCanvasRef.current = document.createElement("canvas"));
      const width = Math.min(
        DETECT_MAX_WIDTH,
        Math.max(160, Math.round(video.videoWidth)),
      );
      const height = Math.max(1, Math.round((width / video.videoWidth) * video.videoHeight));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d", { willReadFrequently: false });
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);

      const predictions = await model.detect(canvas, 20, 0.35);

      const candidates = suppressDuplicates(
        predictions
          .filter(
            (prediction) =>
              isTrackableClass(prediction.class) && prediction.score >= 0.35,
          )
          .map((prediction) => {
            const [px, py, pw, ph] = prediction.bbox;
            const box: DetectionBox = [
              clamp01(px / width),
              clamp01(py / height),
              clamp01(pw / width),
              clamp01(ph / height),
            ];
            const meta = objectMeta(prediction.class);
            const category: TrackedCategory =
              meta.category === "person" ? "person" : "animal";
            return {
              objectClass: prediction.class.trim().toLowerCase(),
              confidence: prediction.score,
              box,
              category,
            };
          })
          .filter(
            (candidate) => candidate.box[2] >= 0.03 && candidate.box[3] >= 0.03,
          ),
      );

      const tracks = tracksRef.current;
      const matched = new Set<string>();

      for (const candidate of candidates) {
        const box = candidate.box;
        const center: [number, number] = [
          box[0] + box[2] / 2,
          box[1] + box[3] / 2,
        ];

        let bestId: string | null = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const [id, track] of tracks) {
          if (matched.has(id)) continue;
          if (now - track.lastSeen > TRACK_MEMORY_MS) continue;

          const overlap = iou(track.box, box);
          const distance = centerDistance(track.center, center);
          const sameClass = track.objectClass === candidate.objectClass;
          const sameCategory = track.category === candidate.category;

          // Same species can move further between frames; a category flip
          // (dog ↔ cow) still needs meaningful overlap so tracks do not merge.
          if (sameClass) {
            if (overlap < 0.12 && distance > 0.16) continue;
          } else if (!sameCategory || overlap < 0.38 || distance > 0.12) {
            continue;
          }

          const score =
            distance + (1 - overlap) * 0.18 + (sameClass ? 0 : 0.06);
          if (score < bestScore) {
            bestScore = score;
            bestId = id;
          }
        }

        if (bestId) {
          const track = tracks.get(bestId)!;
          const dt = Math.max(0.1, (now - track.lastStep) / 1000);
          const smoothed = smoothBox(track.box, box);
          const smoothCenter: [number, number] = [
            smoothed[0] + smoothed[2] / 2,
            smoothed[1] + smoothed[3] / 2,
          ];
          const dx = smoothCenter[0] - track.center[0];
          const dy = smoothCenter[1] - track.center[1];
          const areaRatio =
            (smoothed[2] * smoothed[3]) / Math.max(0.0001, track.area);
          const stepDistance = Math.hypot(dx, dy);

          track.hits += 1;
          // Exponential smoothing keeps the overlay stable without adding lag.
          track.confidence = track.confidence * 0.55 + candidate.confidence * 0.45;
          track.box = smoothed;
          track.center = smoothCenter;
          track.area = smoothed[2] * smoothed[3];
          track.lastSeen = now;
          track.lastStep = now;
          track.moving = stepDistance > 0.004;
          track.direction = describeDirection(dx, dy, areaRatio);
          track.speed = clamp01(stepDistance / dt) * 100;

          if (!track.confirmed) {
            track.confirmed =
              (track.hits >= TRACK_CONFIRM_HITS &&
                track.confidence >= TRACK_CONFIRM_CONFIDENCE) ||
              (track.confidence >= 0.82 && track.hits >= 2);
          }

          if (stepDistance > 0.008) {
            track.path = [...track.path.slice(-15), smoothCenter];
          } else {
            const lastPoint = track.path[track.path.length - 1] ?? smoothCenter;
            track.path = [...track.path.slice(-15), lastPoint];
          }

          matched.add(bestId);
        } else {
          counterRef.current += 1;
          const id = `${trackPrefix(candidate.category)}${counterRef.current}-${runIdRef.current}`;
          tracks.set(id, {
            id,
            objectClass: candidate.objectClass,
            category: candidate.category,
            confidence: candidate.confidence,
            box,
            center,
            area: box[2] * box[3],
            path: [center],
            firstSeen: now,
            lastSeen: now,
            lastStep: now,
            hits: 1,
            moving: false,
            confirmed:
              candidate.confidence >= 0.92 && motionRef.current > 0.02,
          });
          matched.add(id);
        }
      }

      for (const [id, track] of tracks) {
        if (now - track.lastSeen > TRACK_MEMORY_MS) tracks.delete(id);
      }
    } catch (cause) {
      // Keep the camera streaming; the model may recover on the next tick.
      console.warn("[camera] detection failed", cause);
    } finally {
      detectBusyRef.current = false;
    }
  }, []);

  // ---- motion (trigger + diagnostics only, never a tracked object) -------
  const sampleMotion = useCallback(() => {
    const video = videoRef.current;
    if (
      !runningRef.current ||
      document.visibilityState !== "visible" ||
      !video ||
      video.readyState < 2 ||
      video.videoWidth < 32
    ) {
      return;
    }

    const canvas =
      motionCanvasRef.current ??
      (motionCanvasRef.current = document.createElement("canvas"));
    const width = 128;
    const height = 72;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    const data = frame.data;
    const lum = new Uint8ClampedArray(width * height);

    for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
      lum[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

    const previous = prevLumRef.current;
    if (previous) {
      let changed = 0;
      for (let j = 0; j < lum.length; j += 1) {
        if (Math.abs(lum[j] - previous[j]) > 26) changed += 1;
      }
      motionRef.current = changed / (width * height);
      if (changed > 6) lastMotionAtRef.current = performance.now();
    }

    prevLumRef.current = lum;
  }, []);

  // ---- payload + upload --------------------------------------------------
  const buildDetections = useCallback((): IngestDetection[] => {
    const now = performance.now();

    return [...tracksRef.current.values()]
      .filter((track) => now - track.lastSeen < 1_100)
      .map((track) => ({
        trackId: track.id,
        objectClass: track.objectClass,
        confidence: track.confidence,
        box: track.box,
        moving: track.moving,
        direction: track.direction,
        speed: track.speed,
        path: track.path,
        // Only a temporally stable track may raise an alarm server-side.
        confirmed:
          track.confirmed && now - track.lastSeen < 700,
        hits: track.hits,
      }));
  }, []);

  const uploadFrame = useCallback(async () => {
    const video = videoRef.current;
    if (
      !token ||
      !runningRef.current ||
      uploadBusyRef.current ||
      !video ||
      video.readyState < 2 ||
      video.videoWidth < 32 ||
      video.videoHeight < 32
    ) {
      return;
    }

    uploadBusyRef.current = true;

    try {
      const profile = networkProfile();
      const active = tracksRef.current.size > 0;
      const targetWidth = active
        ? profile.slow
          ? 360
          : 560
        : profile.slow
          ? 320
          : 460;
      const width = Math.min(targetWidth, video.videoWidth);
      const height = Math.max(
        1,
        Math.round((video.videoHeight / video.videoWidth) * width),
      );

      const canvas =
        captureRef.current ??
        (captureRef.current = document.createElement("canvas"));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the frame.");
      context.drawImage(video, 0, 0, width, height);

      const quality = active
        ? profile.slow
          ? 0.4
          : 0.55
        : profile.slow
          ? 0.34
          : 0.46;

      // `toBlob` + multipart avoids the ~33% base64 overhead on mobile data.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!blob) throw new Error("Could not encode the frame.");

      const geo = geoRef.current;
      const meta: Omit<CameraIngestPayload, "frame"> = {
        frameWidth: video.videoWidth,
        frameHeight: video.videoHeight,
        aiEnabled: aiReadyRef.current,
        deviceLabel: deviceLabel(),
        capturedAt: new Date().toISOString(),
        motion: motionRef.current,
        quality: profile.slow ? "low" : active ? "high" : "balanced",
        detections: buildDetections(),
        ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
      };

      const response = await api.postCameraFrameMultipart(token, meta, blob);

      if (!runningRef.current) return;
      setUploads((count) => count + 1);
      setUploadState("ok");
      setUploadError(null);
      if (response.verificationQueued) setGroqQueued(true);

      const newestAlert = response.newAlerts[0];
      if (newestAlert) {
        setPhoneAlert(newestAlert);
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate([120, 80, 120]);
        }
        window.clearTimeout(alertTimerRef.current);
        alertTimerRef.current = window.setTimeout(
          () => setPhoneAlert(null),
          12_000,
        );
      }
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        (cause.code === "STREAM_STOPPED" || cause.status === 404)
      ) {
        stopCamera();
        setStoppedByServer(true);
        setUploadState("stopped");
      } else {
        setUploadState("error");
        setUploadError(
          cause instanceof Error ? cause.message : "Frame upload failed.",
        );
      }
    } finally {
      uploadBusyRef.current = false;
    }
  }, [buildDetections, stopCamera, token]);

  // ---- display sync ------------------------------------------------------
  const syncDisplay = useCallback(() => {
    const ingest = buildDetections();
    const next = ingest.map(enrichDetection);
    const signature = next
      .map(
        (item) =>
          `${item.trackId}:${item.label}:${item.confirmed ? "1" : "0"}:${item.confidence.toFixed(2)}:${item.box
            .map((value) => value.toFixed(2))
            .join(",")}:${item.direction ?? ""}`,
      )
      .join("|");

    if (signature !== lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      setDetections(next);
    }
    setMotionPct(Math.round(motionRef.current * 1000) / 10);
  }, [buildDetections]);

  // ---- adaptive loops ----------------------------------------------------
  useEffect(() => {
    if (!started) return;

    let stopped = false;
    let detectTimer = 0;
    let motionTimer = 0;
    let uploadTimer = 0;

    const scheduleDetect = () => {
      if (stopped) return;
      const hidden = document.visibilityState !== "visible";
      const motionRecent = performance.now() - lastMotionAtRef.current < 1_500;
      const delay = hidden
        ? DETECT_INTERVAL_HIDDEN
        : motionRecent || tracksRef.current.size > 0
          ? DETECT_INTERVAL_ACTIVE
          : DETECT_INTERVAL_IDLE;

      detectTimer = window.setTimeout(async () => {
        await runDetection();
        scheduleDetect();
      }, delay);
    };

    const scheduleMotion = () => {
      if (stopped) return;
      const delay =
        document.visibilityState !== "visible"
          ? 1_200
          : performance.now() - lastMotionAtRef.current < 2_000
            ? 180
            : 320;

      motionTimer = window.setTimeout(() => {
        sampleMotion();
        scheduleMotion();
      }, delay);
    };

    const scheduleUpload = () => {
      if (stopped) return;
      const profile = networkProfile();
      const active = tracksRef.current.size > 0;
      const delay = profile.slow
        ? active
          ? UPLOAD_INTERVAL_SLOW
          : IDLE_UPLOAD_INTERVAL_SLOW
        : active
          ? UPLOAD_INTERVAL_ACTIVE
          : UPLOAD_INTERVAL_IDLE;

      uploadTimer = window.setTimeout(async () => {
        if (document.visibilityState === "visible") await uploadFrame();
        scheduleUpload();
      }, delay);
    };

    scheduleDetect();
    scheduleMotion();
    scheduleUpload();

    const displayTimer = window.setInterval(syncDisplay, 220);
    const clockTimer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );

    return () => {
      stopped = true;
      window.clearTimeout(detectTimer);
      window.clearTimeout(motionTimer);
      window.clearTimeout(uploadTimer);
      window.clearInterval(displayTimer);
      window.clearInterval(clockTimer);
    };
  }, [started, runDetection, sampleMotion, uploadFrame, syncDisplay]);

  // ---- overlay -----------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let lastDraw = 0;

    const draw = (time: number) => {
      raf = window.requestAnimationFrame(draw);
      if (time - lastDraw < 90) return;
      lastDraw = time;

      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const rect = video.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d");
      if (!context) return;

      context.clearRect(0, 0, width, height);
      const now = performance.now();

      for (const track of tracksRef.current.values()) {
        if (now - track.lastSeen > 1_100) continue;
        const color = CATEGORY_COLORS[track.category];
        const [x, y, w, h] = track.box;
        const px = x * width;
        const py = y * height;
        const pw = w * width;
        const ph = h * height;

        if (track.path.length > 1) {
          context.beginPath();
          context.strokeStyle = `${color}99`;
          context.lineWidth = 2 * dpr;
          context.setLineDash([4 * dpr, 4 * dpr]);
          track.path.forEach((point, index) => {
            const tx = point[0] * width;
            const ty = point[1] * height;
            if (index === 0) context.moveTo(tx, ty);
            else context.lineTo(tx, ty);
          });
          context.stroke();
          context.setLineDash([]);
        }

        context.strokeStyle = color;
        context.lineWidth = (track.confirmed ? 3 : 1.75) * dpr;
        if (!track.confirmed) context.setLineDash([6 * dpr, 4 * dpr]);
        context.strokeRect(px, py, pw, ph);
        context.setLineDash([]);

        const meta = objectMeta(track.objectClass);
        const label = `${meta.emoji} ${meta.label} ${Math.round(
          track.confidence * 100,
        )}%${track.confirmed ? " ✓" : ""}`;
        context.font = `600 ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
        const textWidth = context.measureText(label).width;
        const labelHeight = 22 * dpr;
        const labelY = Math.max(0, py - labelHeight);

        context.fillStyle = color;
        context.fillRect(px, labelY, textWidth + 14 * dpr, labelHeight);
        context.fillStyle = "#0b120d";
        context.fillText(label, px + 7 * dpr, labelY + 15 * dpr);

        if (track.direction) {
          context.font = `500 ${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
          const directionWidth = context.measureText(track.direction).width;
          context.fillStyle = "rgba(2, 6, 23, 0.72)";
          context.fillRect(
            px,
            py + ph + 4 * dpr,
            directionWidth + 12 * dpr,
            17 * dpr,
          );
          context.fillStyle = "#f8fafc";
          context.fillText(
            track.direction,
            px + 6 * dpr,
            py + ph + 16 * dpr,
          );
        }
      }
    };

    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [started]);

  // ---- flip / torch ------------------------------------------------------
  const flipCamera = async () => {
    if (!started) return;
    await startCamera(facing === "environment" ? "user" : "environment");
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as
      | (MediaStreamTrack & {
          applyConstraints?: (constraints: unknown) => Promise<void>;
        })
      | undefined;
    if (!track?.applyConstraints) return;

    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const aiBadge = useMemo(() => {
    if (aiState === "ready") {
      return {
        label: verifiedCount > 0 ? "AI verified" : "AI ready",
        tone: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
      };
    }
    if (aiState === "loading") {
      return {
        label: "Loading AI…",
        tone: "bg-sky-400/15 text-sky-300 border-sky-400/30",
      };
    }
    if (aiState === "unavailable") {
      return {
        label: "Motion assist",
        tone: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      };
    }
    return {
      label: "AI idle",
      tone: "bg-white/5 text-slate-300 border-white/10",
    };
  }, [aiState, verifiedCount]);

  const qualityLabel = network.slow
    ? network.saveData
      ? "Data saver"
      : "2G"
    : network.effectiveType
      ? network.effectiveType.toUpperCase()
      : "Auto";

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-950">
              <ScanEye className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">
                {pairing?.session.name ?? "AgroAI field camera"}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {pairing?.farmerName ?? "Pairing phone camera…"}
              </p>
            </div>
          </div>

          <span
            className={
              started
                ? "inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-300"
                : "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300"
            }
          >
            <span
              className={
                started
                  ? "h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"
                  : "h-1.5 w-1.5 rounded-full bg-slate-500"
              }
            />
            {started ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl space-y-4 px-3 pb-10 pt-3 sm:px-4">
        {linkError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="flex items-center gap-2 font-bold">
              <TriangleAlert className="h-4 w-4" />
              Camera link problem
            </p>
            <p className="mt-1 text-red-200/80">{linkError}</p>
            <Link href="/watch" className="mt-3 inline-flex text-xs font-bold text-red-100 underline">
              Open Live Watch to get a new link
            </Link>
          </div>
        ) : null}

        {stoppedByServer || isEnded ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <p className="flex items-center gap-2 font-bold">
              <CameraOff className="h-4 w-4" />
              Stream stopped from the laptop
            </p>
            <p className="mt-1 text-amber-100/80">
              Open Live Watch, select this camera and tap “Restart stream”, then
              reload this page to pair again.
            </p>
          </div>
        ) : null}

        {!secure || !hasMedia ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">
            <p className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4" />
              Camera needs a secure connection
            </p>
            <p className="mt-1 text-sky-100/80">
              Phone browsers only expose the camera on <strong>https://</strong>{" "}
              or <strong>localhost</strong>. This page is on{" "}
              <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px]">
                {host || "http://…"}
              </code>
              .
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-sky-100/90">
              <li>
                Easiest: open the deployed <strong>https://</strong> URL, or use a
                Cloudflare/ngrok HTTPS tunnel.
              </li>
              <li>
                Android Chrome demo workaround: open{" "}
                <code className="font-mono">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>,
                add <code className="font-mono">http://{host}</code>, enable it and
                relaunch Chrome.
              </li>
              <li>
                Or run <code className="font-mono">npm run dev:https</code> and
                accept the certificate on the phone.
              </li>
            </ol>
          </div>
        ) : null}

        {phoneAlert ? (
          <div className="animate-rise flex items-center gap-3 rounded-2xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-100">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-xl">
              {phoneAlert.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 font-bold">
                <BellRing className="h-4 w-4" />
                Alarm sent to dashboard
              </p>
              <p className="text-xs text-red-100/80">
                {phoneAlert.message}
                {phoneAlert.confidence
                  ? ` · ${Math.round(phoneAlert.confidence * 100)}% confidence`
                  : ""}
              </p>
            </div>
          </div>
        ) : null}

        <div
          className={
            started
              ? "relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl"
              : "relative aspect-[3/4] overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl"
          }
        >
          <video
            ref={videoRef}
            className="block h-auto w-full"
            autoPlay
            muted
            playsInline
          />
          <canvas
            ref={overlayRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />

          {started ? (
            <>
              <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Live
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur ${aiBadge.tone}`}>
                  <Sparkles className="h-3 w-3" />
                  {aiBadge.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                  <Activity className="h-3 w-3" />
                  Motion {motionPct.toFixed(1)}%
                </span>
              </div>

              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {detections.slice(0, 4).map((detection) => (
                    <span
                      key={detection.trackId}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur"
                    >
                      <span aria-hidden>{detection.emoji}</span>
                      {detection.label}
                      <span className="text-white/60">
                        {Math.round(detection.confidence * 100)}%
                      </span>
                      {detection.confirmed ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      ) : null}
                    </span>
                  ))}
                  {detections.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/70 backdrop-blur">
                      <Crosshair className="h-3 w-3" />
                      Watching for people &amp; animals…
                    </span>
                  ) : null}
                </div>

                <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
                  <Wifi className="h-3 w-3" />
                  {uploads} frames · {qualityLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-slate-950/70 via-slate-950/40 to-slate-950/80 px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/15 text-emerald-300">
                <Camera className="h-7 w-7" />
              </span>
              <div>
                <p className="text-lg font-bold">Point at your field</p>
                <p className="mt-1 text-sm text-slate-300">
                  Only people and animals are tracked. Confirmed tracks raise an
                  alarm on the dashboard in about a second.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void startCamera("environment")}
                disabled={starting || !pairing || isEnded || !secure || !hasMedia}
                className="btn btn-primary min-h-12! px-6! text-base!"
              >
                {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {starting ? "Opening camera…" : "Start camera stream"}
              </button>
              {pairingBusy ? (
                <p className="text-[11px] text-slate-400">Checking camera link…</p>
              ) : null}
            </div>
          )}
        </div>

        {cameraError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-sm text-red-200">
            <TriangleAlert className="mr-1.5 inline h-4 w-4" />
            {cameraError}
          </div>
        ) : null}

        {uploadError ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3.5 text-sm text-amber-100">
            Upload: {uploadError}
          </div>
        ) : null}

        {aiError ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-sm text-amber-100">
            {aiError}
          </div>
        ) : null}

        {started ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                icon={<Radio className="h-3.5 w-3.5" />}
                label="Stream"
                value={formatElapsed(elapsed)}
              />
              <Stat
                icon={
                  uploadState === "error" ? (
                    <WifiOff className="h-3.5 w-3.5" />
                  ) : (
                    <Wifi className="h-3.5 w-3.5" />
                  )
                }
                label="Upload"
                value={
                  uploadState === "error"
                    ? "Retrying"
                    : uploadState === "ok"
                      ? "Receiving"
                      : "Starting"
                }
                tone={uploadState === "error" ? "danger" : "default"}
              />
              <Stat
                icon={<Zap className="h-3.5 w-3.5" />}
                label="Link"
                value={qualityLabel}
              />
              <Stat
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="GPS"
                value={gps ? `±${Math.round(gps.accuracy)} m` : "—"}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void flipCamera()}
                className="btn btn-secondary min-h-11! flex-1 border-white/15! bg-white/5! text-slate-100! hover:bg-white/10!"
              >
                <FlipHorizontal className="h-4 w-4" />
                Flip camera
              </button>
              {torchSupported ? (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  className="btn btn-secondary min-h-11! border-white/15! bg-white/5! text-slate-100! hover:bg-white/10!"
                >
                  <Flashlight className="h-4 w-4" />
                  {torchOn ? "Torch off" : "Torch on"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={stopCamera}
                className="btn btn-danger min-h-11!"
              >
                <CameraOff className="h-4 w-4" />
                Stop
              </button>
            </div>

            {detections.length > 0 ? (
              <section className="space-y-2">
                <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  <span>In view now</span>
                  {groqQueued ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-emerald-300">
                      <Gauge className="h-3 w-3" />
                      Groq check queued
                    </span>
                  ) : null}
                </p>
                <div className="space-y-1.5">
                  {detections.map((detection) => (
                    <div
                      key={detection.trackId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="text-base">{detection.emoji}</span>
                        {detection.label}
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                          {Math.round(detection.confidence * 100)}%
                        </span>
                        {detection.confirmed ? (
                          <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-300">
                            Confirmed
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-300">
                            Checking
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {detection.direction ?? (detection.moving ? "moving" : "still")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {gpsError ? (
              <p className="text-[11px] leading-relaxed text-amber-300/80">
                {gpsError}
              </p>
            ) : null}

            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              Detection runs on this phone. Only humans and animals are tracked;
              frames shrink to 320–560 px and slow automatically on 2G/data saver.
              No video is stored.
            </p>
          </>
        ) : null}

        <p className="pt-2 text-center text-[11px] text-slate-500">
          Keep this page open and point the rear camera at the field.
        </p>
      </div>
    </main>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2"
          : "rounded-xl border border-white/10 bg-white/5 px-3 py-2"
      }
    >
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-100">
        {value}
      </p>
    </div>
  );
}

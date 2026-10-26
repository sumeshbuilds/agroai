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
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  FlipHorizontal,
  Flashlight,
  Loader2,
  MapPin,
  Radio,
  ScanEye,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";

import { ApiError, api } from "@/lib/api-client";
import {
  CATEGORY_COLORS,
  clamp01,
  enrichDetection,
  objectMeta,
  type CameraIngestPayload,
  type CameraSessionDTO,
  type DetectionBox,
  type FrameDetection,
  type IngestDetection,
} from "@/lib/camera";
import { useClientValue } from "@/lib/hooks/use-client-value";

type AiState = "idle" | "loading" | "ready" | "unavailable";
type UploadState = "idle" | "ok" | "error" | "stopped";

interface TrackState {
  id: string;
  objectClass: string;
  confidence: number;
  box: DetectionBox;
  center: [number, number];
  area: number;
  path: Array<[number, number]>;
  lastSeen: number;
  lastStep: number;
  moving: boolean;
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

function trackPrefix(objectClass: string): string {
  const category = objectMeta(objectClass).category;
  if (category === "person") return "p";
  if (category === "animal") return "a";
  if (category === "vehicle") return "v";
  if (category === "motion") return "m";
  return "o";
}

function describeDirection(
  dx: number,
  dy: number,
  areaRatio: number,
): string | undefined {
  if (areaRatio > 1.18) return "coming closer";
  if (areaRatio < 0.85) return "moving away";
  if (Math.hypot(dx, dy) < 0.003) return undefined;
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
  const motionRef = useRef(0);
  const motionBoxRef = useRef<DetectionBox | null>(null);
  const geoRef = useRef<GeoState | null>(null);
  const wakeLockRef = useRef<WakeLockLike | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSignatureRef = useRef("");

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

  const [uploads, setUploads] = useState(0);
  const [motionPct, setMotionPct] = useState(0);
  const [gps, setGps] = useState<GeoState | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [detections, setDetections] = useState<FrameDetection[]>([]);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const isEnded = pairing?.session.status === "ended";
  const linkError =
    mounted && !token
      ? "This page needs a camera link. Open Live Watch on the laptop and scan its QR code."
      : pairingError;
  const pairingBusy = token ? pairingLoading : false;

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

  // ---- AI model ----------------------------------------------------------
  const loadAi = useCallback(async () => {
    if (aiReadyRef.current || aiLoadingRef.current) return;
    aiLoadingRef.current = true;
    setAiState("loading");
    setAiError(null);

    try {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl");
      await tf.ready();

      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      modelRef.current = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      aiReadyRef.current = true;
      setAiState("ready");
    } catch (cause) {
      aiReadyRef.current = false;
      setAiState("unavailable");
      setAiError(
        cause instanceof Error
          ? `AI detector unavailable — falling back to motion mode (${cause.message}).`
          : "AI detector unavailable — falling back to motion mode.",
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
    tracksRef.current.clear();
    lastSignatureRef.current = "";

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
          },
          audio: false,
        });

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is not ready.");

        video.srcObject = stream;
        await video.play().catch(() => undefined);

        // Some phones resolve getUserMedia before the first frame is decoded.
        // Wait for real dimensions so uploads never send a 0×0/placeholder JPEG.
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
        setStarted(true);
        setElapsed(0);
        setFacing(nextFacing);
        setUploadState("idle");

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
            { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
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
      const predictions = await model.detect(video, 15, 0.42);
      const tracks = tracksRef.current;
      const matched = new Set<string>();

      for (const prediction of predictions) {
        const [px, py, pw, ph] = prediction.bbox;
        const vw = video.videoWidth || 1;
        const vh = video.videoHeight || 1;
        const box: DetectionBox = [
          clamp01(px / vw),
          clamp01(py / vh),
          clamp01(pw / vw),
          clamp01(ph / vh),
        ];
        if (box[2] < 0.02 || box[3] < 0.02) continue;

        const center: [number, number] = [
          box[0] + box[2] / 2,
          box[1] + box[3] / 2,
        ];

        let bestId: string | null = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const [id, track] of tracks) {
          if (matched.has(id)) continue;
          if (track.objectClass !== prediction.class) continue;
          if (now - track.lastSeen > 1600) continue;
          const overlap = iou(track.box, box);
          const distance = centerDistance(track.center, center);
          if (overlap < 0.12 && distance > 0.14) continue;
          const score = distance + (1 - overlap) * 0.1;
          if (score < bestScore) {
            bestScore = score;
            bestId = id;
          }
        }

        if (bestId) {
          const track = tracks.get(bestId)!;
          const dt = Math.max(0.08, (now - track.lastStep) / 1000);
          const dx = center[0] - track.center[0];
          const dy = center[1] - track.center[1];
          const areaRatio = (box[2] * box[3]) / Math.max(0.0001, track.area);
          const stepDistance = Math.hypot(dx, dy);

          track.confidence = Math.max(prediction.score, track.confidence * 0.6);
          track.box = box;
          track.center = center;
          track.area = box[2] * box[3];
          track.lastSeen = now;
          track.lastStep = now;
          track.moving = stepDistance > 0.004;
          track.direction = describeDirection(dx, dy, areaRatio);
          track.speed = clamp01(stepDistance / dt) * 100;
          track.path = [...track.path.slice(-13), center];
          matched.add(bestId);
        } else {
          counterRef.current += 1;
          const id = `${trackPrefix(prediction.class)}${counterRef.current}`;
          tracks.set(id, {
            id,
            objectClass: prediction.class,
            confidence: prediction.score,
            box,
            center,
            area: box[2] * box[3],
            path: [center],
            lastSeen: now,
            lastStep: now,
            moving: false,
          });
          matched.add(id);
        }
      }

      for (const [id, track] of tracks) {
        if (now - track.lastSeen > 2600) tracks.delete(id);
      }
    } catch (cause) {
      // Keep the camera streaming; the model may recover on the next tick.
      console.warn("[camera] detection failed", cause);
    } finally {
      detectBusyRef.current = false;
    }
  }, []);

  // ---- motion fallback ---------------------------------------------------
  const sampleMotion = useCallback(() => {
    const video = videoRef.current;
    if (
      !runningRef.current ||
      !video ||
      video.readyState < 2 ||
      video.videoWidth < 32
    ) {
      return;
    }

    const canvas =
      motionCanvasRef.current ??
      (motionCanvasRef.current = document.createElement("canvas"));
    const width = 160;
    const height = 90;
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
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      for (let j = 0; j < lum.length; j += 1) {
        if (Math.abs(lum[j] - previous[j]) > 26) {
          changed += 1;
          const x = j % width;
          const y = Math.floor(j / width);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      const ratio = changed / (width * height);
      motionRef.current = ratio;

      if (changed > 12) {
        motionBoxRef.current = [
          clamp01((minX - 3) / width),
          clamp01((minY - 3) / height),
          clamp01((maxX - minX + 7) / width),
          clamp01((maxY - minY + 7) / height),
        ];
      } else {
        motionBoxRef.current = null;
      }
    }

    prevLumRef.current = lum;
  }, []);

  // ---- payload + upload --------------------------------------------------
  const buildDetections = useCallback((): IngestDetection[] => {
    const now = performance.now();
    const tracks = [...tracksRef.current.values()].filter(
      (track) => now - track.lastSeen < 1800,
    );

    if (tracks.length === 0) {
      const motion = motionRef.current;
      const box = motionBoxRef.current;
      if (motion > 0.015 && box) {
        return [
          {
            trackId: "motion-1",
            objectClass: "motion",
            confidence: clamp01(0.25 + motion * 8),
            box,
            moving: true,
            direction: "movement in frame",
            speed: motion * 100,
            path: [
              [box[0] + box[2] / 2, box[1] + box[3] / 2],
            ],
          },
        ];
      }
      return [];
    }

    return tracks.map((track) => ({
      trackId: track.id,
      objectClass: track.objectClass,
      confidence: track.confidence,
      box: track.box,
      moving: track.moving,
      direction: track.direction,
      speed: track.speed,
      path: track.path,
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
      const canvas =
        captureRef.current ??
        (captureRef.current = document.createElement("canvas"));
      const targetWidth = Math.min(560, video.videoWidth);
      const targetHeight = Math.max(
        1,
        Math.round((video.videoHeight / video.videoWidth) * targetWidth),
      );

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the frame.");
      context.drawImage(video, 0, 0, targetWidth, targetHeight);

      const frame = canvas.toDataURL("image/jpeg", 0.55);
      const geo = geoRef.current;

      const payload: CameraIngestPayload = {
        frame,
        frameWidth: video.videoWidth,
        frameHeight: video.videoHeight,
        aiEnabled: aiReadyRef.current,
        deviceLabel: deviceLabel(),
        capturedAt: new Date().toISOString(),
        motion: motionRef.current,
        detections: buildDetections(),
        ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
      };

      await api.postCameraFrame(token, payload);

      if (!runningRef.current) return;
      setUploads((count) => count + 1);
      setUploadState("ok");
      setUploadError(null);
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
          `${item.trackId}:${item.label}:${item.confidence.toFixed(2)}:${item.box
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

  // ---- loops -------------------------------------------------------------
  useEffect(() => {
    if (!started) return;

    const detectTimer = window.setInterval(() => void runDetection(), 420);
    const motionTimer = window.setInterval(sampleMotion, 150);
    const uploadTimer = window.setInterval(() => void uploadFrame(), 800);
    const displayTimer = window.setInterval(syncDisplay, 250);
    const clockTimer = window.setInterval(() => setElapsed((value) => value + 1), 1000);

    return () => {
      window.clearInterval(detectTimer);
      window.clearInterval(motionTimer);
      window.clearInterval(uploadTimer);
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
      if (time - lastDraw < 60) return;
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
        if (now - track.lastSeen > 1800) continue;
        const meta = objectMeta(track.objectClass);
        const color = CATEGORY_COLORS[meta.category];
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
        context.lineWidth = 2.5 * dpr;
        context.strokeRect(px, py, pw, ph);

        const label = `${meta.emoji} ${meta.label} ${Math.round(track.confidence * 100)}%`;
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
    if (aiState === "ready") return { label: "AI ready", tone: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" };
    if (aiState === "loading") return { label: "Loading AI…", tone: "bg-sky-400/15 text-sky-300 border-sky-400/30" };
    if (aiState === "unavailable") return { label: "Motion mode", tone: "bg-amber-400/15 text-amber-300 border-amber-400/30" };
    return { label: "AI idle", tone: "bg-white/5 text-slate-300 border-white/10" };
  }, [aiState]);

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
                    </span>
                  ))}
                  {detections.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white/70 backdrop-blur">
                      <Crosshair className="h-3 w-3" />
                      Watching for movement…
                    </span>
                  ) : null}
                </div>

                <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
                  <Wifi className="h-3 w-3" />
                  {uploads} frames
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
                  Start the camera, then let people or animals walk through the
                  frame. Detections appear on the laptop in under 2 seconds.
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
                icon={<Activity className="h-3.5 w-3.5" />}
                label="Motion"
                value={`${motionPct.toFixed(1)}%`}
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
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  In view now
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
              Frames are analysed on this phone. Only a small JPEG snapshot (about
              30–60 KB per second) and the detected labels are uploaded — no video
              is stored.
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

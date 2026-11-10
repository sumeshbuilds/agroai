"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
  MapPin,
  Radio,
  ScanEye,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wifi,
  WifiOff,
  Zap,
  X,
} from "lucide-react";

import { ApiError, api } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import {
  CATEGORY_COLORS,
  enrichDetection,
  objectMeta,
  type CameraAlertDTO,
  type CameraSessionDTO,
  type FrameDetection,
} from "@/lib/camera";
import {
  encodeCameraFrame, MAX_PENDING_CAMERA_FRAMES, sampleCameraLuminance,
  type CameraFrameSnapshot, type LuminanceSample,
} from "@/lib/camera-capture";
import { CameraEventBuffer } from "@/lib/camera-event-buffer";
import { estimateCameraMotion, STILL_CAMERA } from "@/lib/camera-motion";
import { cameraCandidates, CameraTracker, distantScanRegions, suppressDuplicateDetections } from "@/lib/camera-tracker";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useI18n } from "@/lib/i18n";

type AiState = "idle" | "loading" | "ready" | "unavailable";
type UploadState = "idle" | "ok" | "error" | "stopped";

interface GeoState {
  lat: number;
  lng: number;
  accuracy: number;
}

interface WakeLockLike {
  release: () => Promise<void>;
  released?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
}

interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
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

const DETECT_MAX_WIDTH = 720;
/** Detection cadence (ms): moving object, idle scene, hidden tab. */
const DETECT_INTERVAL_ACTIVE = 350;
const DETECT_INTERVAL_IDLE = 950;
const DETECT_INTERVAL_HIDDEN = 2_500;
/** Upload cadence (ms). */
const UPLOAD_INTERVAL_ACTIVE = 700;
const UPLOAD_INTERVAL_IDLE = 2_600;
const UPLOAD_INTERVAL_SLOW = 5_000;
const IDLE_UPLOAD_INTERVAL_SLOW = 6_500;

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

export function CameraStreamView() {
  const { t } = useI18n();
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
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectionMotionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevLumRef = useRef<LuminanceSample | null>(null);
  const previousDetectionLumRef = useRef<LuminanceSample | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const modelRef = useRef<ObjectDetection | null>(null);
  const aiLoadingRef = useRef(false);
  const aiLifetimeRef = useRef(0);
  const aiReadyRef = useRef(false);
  const detectBusyRef = useRef(false);
  const uploadBusyRef = useRef(false);
  const runningRef = useRef(false);
  const trackerRef = useRef(new CameraTracker());
  const snapshotRef = useRef<CameraFrameSnapshot | null>(null);
  const eventBufferRef = useRef(new CameraEventBuffer());
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const inferenceMsRef = useRef(350);
  const detectionFailuresRef = useRef(0);
  const opticsVersionRef = useRef(0);
  const uploadMsRef = useRef(0);
  const lastUploadedSnapshotRef = useRef<CameraFrameSnapshot | null>(null);
  const distantScanRef = useRef(false);
  const cameraMovingRef = useRef(false);
  const motionRef = useRef(0);
  const lastMotionAtRef = useRef(0);
  const geoRef = useRef<GeoState | null>(null);
  const wakeLockRef = useRef<WakeLockLike | null>(null);
  const wakeLockRequestRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSignatureRef = useRef("");
  const startedAtRef = useRef(0);
  const phoneDismissedRef = useRef(new Set<number>());
  const phoneSeenRef = useRef(new Set<number>());
  const receiptScrollRef = useRef<HTMLDivElement | null>(null);
  const controlBusyRef = useRef(false);

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
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [groqQueued, setGroqQueued] = useState(false);

  const [uploads, setUploads] = useState(0);
  const [motionPct, setMotionPct] = useState(0);
  const [gps, setGps] = useState<GeoState | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [detections, setDetections] = useState<FrameDetection[]>([]);
  const [phoneAlerts, setPhoneAlerts] = useState<CameraAlertDTO[]>([]);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [focusModes, setFocusModes] = useState<string[]>([]);
  const [zoomRange, setZoomRange] = useState<CameraCapabilities["zoom"] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [controlError, setControlError] = useState<string | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [distantScan, setDistantScan] = useState(false);
  const [cameraMoving, setCameraMoving] = useState(false);
  const [backlog, setBacklog] = useState(0);
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

  // ---- pairing -----------------------------------------------------------
  useEffect(() => {
    if (!token) return;

    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    const load = async (silent: boolean) => {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 12_000);
      try {
        const data = await api.getCameraPairing(token, { signal: controller.signal });
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
        window.clearTimeout(timeout);
        if (active && !silent) setPairingLoading(false);
        if (active) timer = window.setTimeout(() => void load(true), 5_000);
      }
    };

    void load(false);
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timer);
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
    const lifetime = aiLifetimeRef.current;
    setAiState("loading");
    setAiError(null);

    try {
      const tf = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-backend-webgl");
      // COCO-SSD also uses CPU for post-processing. Register it even when
      // WebGL works; otherwise the supposed GPU fallback was not a fallback.
      await import("@tensorflow/tfjs-backend-cpu");

      try {
        if (!await tf.setBackend("webgl")) throw new Error("WebGL is unavailable.");
        await tf.ready();
      } catch {
        // CPU is slower but keeps detection alive on old GPUs.
        if (!await tf.setBackend("cpu")) throw new Error("CPU detection is unavailable.");
        await tf.ready();
      }

      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      const base = tf.getBackend() === "webgl" && !networkProfile().slow ? "mobilenet_v2" : "lite_mobilenet_v2";
      let model: ObjectDetection;
      try { model = await cocoSsd.load({ base }); }
      catch (cause) {
        if (base === "lite_mobilenet_v2") throw cause;
        model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      }
      if (!activeRef.current || lifetime !== aiLifetimeRef.current) { model.dispose(); return; }
      modelRef.current = model;
      aiReadyRef.current = true;
      setAiState("ready");
    } catch {
      if (!activeRef.current || lifetime !== aiLifetimeRef.current) return;
      aiReadyRef.current = false;
      setAiState("unavailable");
      setAiError("AI detector unavailable. Video still streams, but people and animals cannot be detected. Tap Retry detector.");
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
    generationRef.current += 1;
    runningRef.current = false;
    startingRef.current = false;
    uploadControllerRef.current?.abort();
    releaseStream();
    setStarted(false);
    setStarting(false);
    setTorchOn(false);
    setTorchSupported(false);
    setUploadState("idle");
    setUploadError(null);
    setCaptureError(null);
    setDetections([]);
    setGroqQueued(false);
    trackerRef.current.reset();
    snapshotRef.current = null;
    lastSignatureRef.current = "";
    prevLumRef.current = null;
    previousDetectionLumRef.current = null;
    setFocusModes([]);
    setZoomRange(null);
    setControlError(null);
    setCameraMoving(false);
    cameraMovingRef.current = false;
    controlBusyRef.current = false;
    setControlBusy(false);
    lastUploadedSnapshotRef.current = null;
    // Confirmed event frames remain queued across a stop/flip. Only a
    // successful upload removes them; stale async work cannot replace them.

    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
  }, [releaseStream]);

  const acquireWakeLock = useCallback(async (generation: number) => {
    if (!runningRef.current || document.visibilityState !== "visible" || wakeLockRequestRef.current === generation || (wakeLockRef.current && !wakeLockRef.current.released)) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<WakeLockLike> } };
    wakeLockRequestRef.current = generation;
    const lock = await nav.wakeLock?.request("screen").catch(() => null);
    if (wakeLockRequestRef.current === generation) wakeLockRequestRef.current = null;
    if (!lock) return;
    if (!activeRef.current || generation !== generationRef.current || !runningRef.current || document.visibilityState !== "visible") {
      void lock.release().catch(() => undefined);
      return;
    }
    wakeLockRef.current = lock;
    lock.addEventListener?.("release", () => { if (wakeLockRef.current === lock) wakeLockRef.current = null; });
  }, []);

  const startCamera = useCallback(
    async (nextFacing: "environment" | "user" = "environment") => {
      if (!token || startingRef.current || !activeRef.current || isEnded) return;

      if (!secure || !hasMedia) {
        setCameraError(
          "Camera access needs HTTPS (or localhost). Open this page over a secure URL — see the setup steps below.",
        );
        return;
      }

      stopCamera();
      const generation = generationRef.current;
      startingRef.current = true;
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
        if (!activeRef.current || generation !== generationRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is not ready.");

        video.srcObject = stream;
        await video.play();

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

        if (!activeRef.current || generation !== generationRef.current) return;

        if (video.videoWidth < 32 || video.videoHeight < 32) {
          throw new Error(
            "The camera did not provide a usable video frame. Try the rear camera or another browser.",
          );
        }

        runningRef.current = true;
        // Track ids must be unique across starts and reloads; queued events
        // retain their old ids so a retry can recover the same saved alarm.
        trackerRef.current.reset(crypto.randomUUID().slice(0, 12));
        eventBufferRef.current.beginRun();
        lastSignatureRef.current = "";
        prevLumRef.current = null;
        previousDetectionLumRef.current = null;
        snapshotRef.current = null;
        motionRef.current = 0;
        detectionFailuresRef.current = 0;
        startedAtRef.current = performance.now();
        setStarted(true);
        setElapsed(0);
        setFacing(nextFacing);
        setUploadState("idle");
        setNetwork(networkProfile());

        // Torch is available on some Android rear cameras.
        const track = stream.getVideoTracks()[0];
        try {
          const capabilities = track?.getCapabilities?.() as CameraCapabilities | undefined;
          setTorchSupported(Boolean(capabilities?.torch));
          const modes = capabilities?.focusMode ?? [];
          setFocusModes(modes);
          const range = capabilities?.zoom;
          if (range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min) {
            setZoomRange(range);
            setZoom((track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? range.min);
          }
          if (modes.includes("continuous")) {
            void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
          }
        } catch {
          setTorchSupported(false);
        }
        track?.addEventListener("ended", () => {
          if (activeRef.current && runningRef.current && generation === generationRef.current) {
            stopCamera();
            setCameraError("The camera was disconnected or paused by the browser. Restart the camera stream.");
          }
        });
        void acquireWakeLock(generation);

        // GPS is optional but lets the laptop show field weather + distance.
        if ("geolocation" in navigator) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              if (!activeRef.current || generation !== generationRef.current) return;
              const next: GeoState = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                accuracy: position.coords.accuracy,
              };
              geoRef.current = next;
              setGps(next);
              setGpsError(null);
            },
            () => {
              if (activeRef.current && generation === generationRef.current) setGpsError(
                "Location blocked. Allow location for field weather and map distance.",
              );
            },
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
        if (!activeRef.current || generation !== generationRef.current) return;
        releaseStream();
        runningRef.current = false;
        setStarted(false);
        setCameraError(
          cause instanceof Error
            ? cause.message
            : "Could not open the camera. Check permissions and try again.",
        );
      } finally {
        if (activeRef.current && generation === generationRef.current) {
          startingRef.current = false;
          setStarting(false);
        }
      }
    },
    [acquireWakeLock, hasMedia, isEnded, loadAi, releaseStream, secure, stopCamera, token],
  );

  // Stop the stream if the laptop ends the session.
  useEffect(() => {
    if (pairing?.session.status !== "ended" || (!started && !starting)) return;

    const timer = window.setTimeout(() => {
      stopCamera();
      setStoppedByServer(true);
      setUploadState("stopped");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pairing?.session.status, started, starting, stopCamera]);

  // Cleanup on unmount.
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      aiLifetimeRef.current += 1;
      generationRef.current += 1;
      runningRef.current = false;
      uploadControllerRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
      }
      void wakeLockRef.current?.release().catch(() => undefined);
      if (!detectBusyRef.current) { modelRef.current?.dispose(); modelRef.current = null; }
    };
  }, []);

  // Freeze one canvas per observation. Reusing the detector canvas while an
  // inference is pending used to put old boxes on newer pixels.
  const captureSnapshot = useCallback((): CameraFrameSnapshot | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth < 32 || video.videoHeight < 32) return null;
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, DETECT_MAX_WIDTH / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera canvas unavailable.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const geo = geoRef.current;
      setCaptureError(null);
      return {
        canvas, detections: [], capturedTime: performance.now(), capturedAt: new Date().toISOString(),
        aiEnabled: false, motion: motionRef.current, geo: geo ? { lat: geo.lat, lng: geo.lng } : null,
      };
    } catch {
      if (activeRef.current) setCaptureError("Could not capture a camera frame. Restart the camera or try another browser.");
      return null;
    }
  }, []);

  // ---- detection ---------------------------------------------------------
  const runDetection = useCallback(async () => {
    const model = modelRef.current;
    if (!runningRef.current || !model || detectBusyRef.current || controlBusyRef.current || document.visibilityState !== "visible" ||
        eventBufferRef.current.full) return;
    const snapshot = captureSnapshot();
    if (!snapshot) return;
    const generation = generationRef.current;
    const optics = opticsVersionRef.current;
    const accept = () => activeRef.current && runningRef.current && generation === generationRef.current && optics === opticsVersionRef.current;
    detectBusyRef.current = true;
    const start = performance.now();
    try {
      const { canvas } = snapshot;
      const motionCanvas = detectionMotionCanvasRef.current ?? (detectionMotionCanvasRef.current = document.createElement("canvas"));
      const sample = sampleCameraLuminance(canvas, canvas.width, canvas.height, motionCanvas);
      const previous = previousDetectionLumRef.current;
      const motion = sample ? estimateCameraMotion(
        previous?.width === sample.width && previous.height === sample.height ? previous.data : null,
        sample.data, sample.width, sample.height,
      ) : STILL_CAMERA;
      const predictions = await model.detect(canvas, 40, 0.3);
      if (!accept()) return;
      const candidates = cameraCandidates(predictions, canvas.width, canvas.height);
      // Optional overlapping crops enlarge distant subjects for the model.
      // Both crops use these SAME frozen pixels and run serially, never on a
      // future video frame. Cadence below accounts for their measured cost.
      if (distantScanRef.current) {
        for (const region of distantScanRegions(canvas.width, canvas.height)) {
          const crop = document.createElement("canvas");
          crop.width = Math.round(canvas.width * region[2]);
          crop.height = Math.round(canvas.height * region[3]);
          crop.getContext("2d")?.drawImage(canvas, canvas.width * region[0], canvas.height * region[1], crop.width, crop.height, 0, 0, crop.width, crop.height);
          const cropped = await model.detect(crop, 30, 0.3);
          if (!accept()) return;
          candidates.push(...cameraCandidates(cropped, crop.width, crop.height, region));
        }
      }
      const cadence = Math.max(350, inferenceMsRef.current * 1.4,
        snapshotRef.current ? snapshot.capturedTime - snapshotRef.current.capturedTime : 0);
      snapshot.detections = trackerRef.current.update(
        suppressDuplicateDetections(candidates).slice(0, 12), snapshot.capturedTime, motion, canvas.width / canvas.height, cadence,
      ).sort((a, b) => {
        const priority = (item: typeof a) => item.confirmed && !eventBufferRef.current.hasTrack(item.trackId) ? 3 : item.coasting ? 0 : item.confirmed ? 2 : 1;
        return priority(b) - priority(a) || b.confidence - a.confidence;
      }).slice(0, 12);
      previousDetectionLumRef.current = sample;
      snapshot.aiEnabled = true;
      snapshot.motion = motion.motion;
      snapshotRef.current = snapshot;
      detectionFailuresRef.current = 0;

      if (eventBufferRef.current.enqueue(snapshot, networkProfile().slow, deviceLabel())) {
        setBacklog(eventBufferRef.current.size);
      }
    } catch {
      if (!accept()) return;
      detectionFailuresRef.current += 1;
      if (detectionFailuresRef.current >= 3) {
        aiReadyRef.current = false;
        modelRef.current = null;
        model.dispose();
        snapshotRef.current = null;
        trackerRef.current.reset(crypto.randomUUID().slice(0, 12));
        setAiState("unavailable");
        setAiError("AI detector unavailable. Video still streams, but people and animals cannot be detected. Tap Retry detector.");
      }
    } finally {
      inferenceMsRef.current = inferenceMsRef.current * 0.4 + (performance.now() - start) * 0.6;
      detectBusyRef.current = false;
      if (!activeRef.current && modelRef.current === model) { model.dispose(); modelRef.current = null; }
    }
  }, [captureSnapshot]);

  // Camera translation/exposure changes are diagnostics, not animal tracks.
  const sampleMotion = useCallback(() => {
    const video = videoRef.current;
    if (!runningRef.current || document.visibilityState !== "visible" || !video || video.readyState < 2 || video.videoWidth < 32) return;
    const canvas = motionCanvasRef.current ?? (motionCanvasRef.current = document.createElement("canvas"));
    let sample: LuminanceSample | null;
    try { sample = sampleCameraLuminance(video, video.videoWidth, video.videoHeight, canvas); }
    catch { return; } // A camera can lose its readable frame during a flip.
    if (!sample) return;
    const previous = prevLumRef.current;
    const motion = estimateCameraMotion(previous?.width === sample.width && previous.height === sample.height ? previous.data : null, sample.data, sample.width, sample.height);
    motionRef.current = motion.motion;
    cameraMovingRef.current = motion.confidence > 0.18 && Math.hypot(motion.dx, motion.dy) > 0.008;
    if (motion.motion > 0.015 || cameraMovingRef.current) lastMotionAtRef.current = performance.now();
    prevLumRef.current = sample;
  }, []);

  // ---- payload + upload --------------------------------------------------
  const uploadFrame = useCallback(async () => {
    if (!token || !runningRef.current || uploadBusyRef.current || document.visibilityState !== "visible") return;
    const generation = generationRef.current;
    const accept = () => activeRef.current && runningRef.current && generation === generationRef.current;
    uploadBusyRef.current = true;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const profile = networkProfile();
    const timeout = window.setTimeout(() => controller.abort(), profile.slow ? 30_000 : 20_000);
    const start = performance.now();
    let phase: "encode" | "upload" = "encode";
    try {
      const queued = eventBufferRef.current.size > 0;
      const snapshot = aiReadyRef.current ? snapshotRef.current : captureSnapshot();
      if (!queued && (!snapshot || snapshot === lastUploadedSnapshotRef.current)) return;
      const frame = queued ? await eventBufferRef.current.next(controller.signal) : await encodeCameraFrame(snapshot!, profile.slow, deviceLabel(), { signal: controller.signal });
      if (!accept() || !frame) return;
      controller.signal.throwIfAborted();
      phase = "upload";
      const response = await api.postCameraFrameMultipart(token, frame.meta, frame.blob, { signal: controller.signal });
      if (!accept()) return;
      controller.signal.throwIfAborted();
      if (queued) eventBufferRef.current.complete(frame);
      else if (snapshot) lastUploadedSnapshotRef.current = snapshot;
      setBacklog(eventBufferRef.current.size);
      setUploads((count) => count + 1);
      setUploadState("ok");
      setUploadError(null);
      setGroqQueued(Boolean(response.verificationQueued));
      const receipts = response.newAlerts.filter((item) => !phoneDismissedRef.current.has(item.id));
      const fresh = receipts.filter((item) => !phoneSeenRef.current.has(item.id));
      fresh.forEach((item) => phoneSeenRef.current.add(item.id));
      if (receipts.length > 0) {
        setPhoneAlerts((current) => {
          const alerts = new Map(current.map((item) => [item.id, item]));
          receipts.forEach((item) => { if (!phoneDismissedRef.current.has(item.id)) alerts.set(item.id, item); });
          return [...alerts.values()].sort((a, b) => b.id - a.id);
        });
        if (fresh.length > 0) {
          if (receiptScrollRef.current) receiptScrollRef.current.scrollTop = 0;
          navigator.vibrate?.([120, 80, 120]);
        }
      }
    } catch (cause) {
      if (!accept()) return;
      if (cause instanceof ApiError && (cause.code === "STREAM_STOPPED" || cause.status === 404)) {
        stopCamera();
        setStoppedByServer(true);
        setUploadState("stopped");
      } else {
        setUploadState("error");
        setUploadError(phase === "encode" && !controller.signal.aborted
          ? "Could not encode the camera image. Saved event frames will be retried; detection is still active."
          : controller.signal.aborted ? "Frame upload timed out. Confirmed event frames are queued for retry." : "Frame upload failed. Confirmed event frames are queued for retry.");
      }
    } finally {
      window.clearTimeout(timeout);
      uploadMsRef.current = performance.now() - start;
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      uploadBusyRef.current = false;
    }
  }, [captureSnapshot, stopCamera, token]);

  // ---- display sync ------------------------------------------------------
  const syncDisplay = useCallback(() => {
    if (!runningRef.current) return;
    const next = trackerRef.current.snapshot(performance.now()).map(enrichDetection);
    const signature = next.map((item) => `${item.trackId}:${item.label}:${item.confirmed}:${item.coasting}:${item.confidence.toFixed(2)}:${item.box.map((value) => value.toFixed(2)).join(",")}:${item.direction ?? ""}`).join("|");
    if (signature !== lastSignatureRef.current) {
      lastSignatureRef.current = signature;
      setDetections(next);
    }
    setMotionPct(Math.round(motionRef.current * 1000) / 10);
    setCameraMoving(cameraMovingRef.current);
  }, []);

  // ---- adaptive, serial loops -------------------------------------------
  useEffect(() => {
    if (!started) return;
    let stopped = false;
    let detectTimer = 0;
    let motionTimer = 0;
    let uploadTimer = 0;
    const generation = generationRef.current;
    const alive = () => !stopped && runningRef.current && generation === generationRef.current;
    const detect = async () => {
      const start = performance.now();
      await runDetection();
      if (!alive()) return;
      const base = document.visibilityState !== "visible" ? DETECT_INTERVAL_HIDDEN :
        performance.now() - lastMotionAtRef.current < 1_500 || trackerRef.current.size > 0 ? DETECT_INTERVAL_ACTIVE : DETECT_INTERVAL_IDLE;
      const cadence = Math.max(base, inferenceMsRef.current * 1.4);
      detectTimer = window.setTimeout(() => void detect(), Math.max(100, cadence - (performance.now() - start)));
    };
    const motion = () => {
      if (!alive()) return;
      sampleMotion();
      motionTimer = window.setTimeout(motion, document.visibilityState === "visible" ? 280 : 1_200);
    };
    const upload = async () => {
      const start = performance.now();
      await uploadFrame();
      if (!alive()) return;
      const profile = networkProfile();
      const active = trackerRef.current.size > 0 || eventBufferRef.current.size > 0;
      const base = profile.slow ? active ? UPLOAD_INTERVAL_SLOW : IDLE_UPLOAD_INTERVAL_SLOW : active ? UPLOAD_INTERVAL_ACTIVE : UPLOAD_INTERVAL_IDLE;
      const cadence = Math.max(base, uploadMsRef.current * 1.25);
      uploadTimer = window.setTimeout(() => void upload(), Math.max(200, cadence - (performance.now() - start)));
    };
    detectTimer = window.setTimeout(() => void detect(), 0);
    motionTimer = window.setTimeout(motion, 0);
    uploadTimer = window.setTimeout(() => void upload(), 0);
    const displayTimer = window.setInterval(syncDisplay, 220);
    const clockTimer = window.setInterval(() => setElapsed(Math.floor((performance.now() - startedAtRef.current) / 1000)), 1_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !alive()) return;
      prevLumRef.current = null;
      previousDetectionLumRef.current = null;
      trackerRef.current.ignoreNextMotion();
      void acquireWakeLock(generation);
      void videoRef.current?.play().catch(() => undefined);
      // Wake pending timers without starting overlapping inference/requests.
      if (!detectBusyRef.current) { window.clearTimeout(detectTimer); void detect(); }
      if (!uploadBusyRef.current) { window.clearTimeout(uploadTimer); void upload(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(detectTimer);
      window.clearTimeout(motionTimer);
      window.clearTimeout(uploadTimer);
      window.clearInterval(displayTimer);
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [started, acquireWakeLock, runDetection, sampleMotion, uploadFrame, syncDisplay]);

  // ---- overlay -----------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let lastDraw = 0;
    const fontFamily = getComputedStyle(document.body).fontFamily;

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

      for (const track of trackerRef.current.snapshot(now)) {
        const meta = objectMeta(track.objectClass);
        const color = CATEGORY_COLORS[meta.category];
        context.globalAlpha = track.coasting ? 0.5 : 1;
        const [x, y, w, h] = track.box;
        const px = x * width;
        const py = y * height;
        const pw = w * width;
        const ph = h * height;

        if (track.path && track.path.length > 1) {
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
        if (!track.confirmed || track.coasting) context.setLineDash([6 * dpr, 4 * dpr]);
        context.strokeRect(px, py, pw, ph);
        context.setLineDash([]);

        const label = `${t(meta.label)} ${Math.round(
          track.confidence * 100,
        )}%${track.coasting ? ` · ${t("Predicted")}` : track.confirmed ? " ✓" : ""}`;
        context.font = `600 ${12 * dpr}px ${fontFamily}`;
        const textWidth = context.measureText(label).width;
        const labelHeight = 22 * dpr;
        const labelY = Math.max(0, py - labelHeight);
        const labelX = Math.max(0, Math.min(px, width - textWidth - 14 * dpr));

        context.fillStyle = color;
        context.fillRect(labelX, labelY, textWidth + 14 * dpr, labelHeight);
        context.fillStyle = "#101c15";
        context.fillText(label, labelX + 7 * dpr, labelY + 15 * dpr);

        if (track.direction) {
          const direction = t(track.direction);
          context.font = `500 ${10 * dpr}px ${fontFamily}`;
          const directionWidth = context.measureText(direction).width;
          const directionX = Math.max(0, Math.min(px, width - directionWidth - 12 * dpr));
          const directionY = Math.min(height - 17 * dpr, py + ph + 4 * dpr);
          context.fillStyle = "rgba(16, 28, 21, 0.85)";
          context.fillRect(
            directionX,
            directionY,
            directionWidth + 12 * dpr,
            17 * dpr,
          );
          context.fillStyle = "#f2f5ed";
          context.fillText(
            direction,
            directionX + 6 * dpr,
            directionY + 12 * dpr,
          );
        }
      }
      context.globalAlpha = 1;
    };

    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [started, t]);

  // ---- flip / torch ------------------------------------------------------
  const flipCamera = async () => {
    if (!started) return;
    await startCamera(facing === "environment" ? "user" : "environment");
  };

  const applyCameraControl = async (constraint: MediaTrackConstraintSet, onSuccess: (track: MediaStreamTrack) => void) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!runningRef.current || !track || controlBusyRef.current) return;
    const generation = generationRef.current;
    controlBusyRef.current = true;
    setControlBusy(true);
    setControlError(null);
    opticsVersionRef.current += 1;
    try {
      await track.applyConstraints({ advanced: [constraint] });
      if (activeRef.current && generation === generationRef.current) onSuccess(track);
    } catch {
      if (activeRef.current && generation === generationRef.current) setControlError("This camera could not apply that setting. Try a smaller zoom or another camera.");
    } finally {
      if (activeRef.current && generation === generationRef.current) {
        opticsVersionRef.current += 1;
        prevLumRef.current = null;
        previousDetectionLumRef.current = null;
        trackerRef.current.ignoreNextMotion();
        controlBusyRef.current = false;
        setControlBusy(false);
      }
    }
  };
  const toggleTorch = () => applyCameraControl({ torch: !torchOn } as MediaTrackConstraintSet, () => setTorchOn((value) => !value));
  const changeZoom = (value: number) => applyCameraControl({ zoom: value } as MediaTrackConstraintSet, (track) => {
    setZoom((track.getSettings() as MediaTrackSettings & { zoom?: number }).zoom ?? value);
  });
  const refocus = () => applyCameraControl({ focusMode: focusModes.includes("single-shot") ? "single-shot" : "continuous" } as MediaTrackConstraintSet, () => undefined);

  const aiBadge = useMemo(() => {
    if (aiState === "ready") {
      return {
        label: t("AI ready"),
        tone: "bg-leaf-300/15 text-leaf-300 border-leaf-300/30",
      };
    }
    if (aiState === "loading") {
      return {
        label: t("AI loading"),
        tone: "bg-sky-400/15 text-sky-300 border-sky-400/30",
      };
    }
    if (aiState === "unavailable") {
      return {
        label: t("Detection unavailable"),
        tone: "bg-amber-400/15 text-amber-300 border-amber-400/30",
      };
    }
    return {
      label: t("AI idle"),
      tone: "bg-white/5 text-slate-300 border-white/10",
    };
  }, [aiState, t]);

  const qualityLabel = network.slow
    ? network.saveData
      ? t("Data saver")
      : t("2G")
    : network.effectiveType
      ? network.effectiveType.toUpperCase()
      : t("Auto");

  return (
    <main className="camera-surface min-h-dvh bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="brand-mark h-10 w-10">
              <ScanEye className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                {pairing?.session.name ?? t("AgroAI field camera")}
              </h1>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {pairing?.farmerName ?? t("Pairing phone camera…")}
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
                  ? "h-1.5 w-1.5 animate-pulse-soft rounded-full bg-red-400"
                  : "h-1.5 w-1.5 rounded-full bg-slate-500"
              }
            />
            {started ? t("LIVE") : t("OFFLINE")}
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-xl space-y-5 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
        {linkError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="flex items-center gap-2 font-bold">
              <TriangleAlert className="h-4 w-4" />
              {t("Camera link problem")}
            </p>
            <p className="mt-1 text-red-200/80">{t(linkError)}</p>
            <Link href="/watch" className="mt-3 inline-flex text-xs font-bold text-red-100 underline">
              {t("Open Live Watch to get a new link")}
            </Link>
          </div>
        ) : null}

        {stoppedByServer || isEnded ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            <p className="flex items-center gap-2 font-bold">
              <CameraOff className="h-4 w-4" />
              {t("Stream stopped from the laptop")}
            </p>
            <p className="mt-1 text-amber-100/80">
              {t(
                "Open Live Watch, select this camera and tap “Restart stream”, then reload this page to pair again.",
              )}
            </p>
          </div>
        ) : null}

        {!secure || !hasMedia ? (
          <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100">
            <p className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4" />
              {t("Camera needs a secure connection")}
            </p>
            <p className="mt-1 text-sky-100/80">
              {t(
                "Phone browsers only expose the camera on HTTPS or localhost. This page is on {host}.",
                { host: host || "http://…" },
              )}
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-sky-100/90">
              <li>
                {t(
                  "Easiest: open the deployed HTTPS URL, or use a Cloudflare/ngrok HTTPS tunnel.",
                )}
              </li>
              <li>
                {t(
                  "Android Chrome demo workaround: open {flag}, add {origin}, enable it and relaunch Chrome.",
                  {
                    flag: "chrome://flags/#unsafely-treat-insecure-origin-as-secure",
                    origin: `http://${host}`,
                  },
                )}
              </li>
              <li>
                {t(
                  "Or run {command} and accept the certificate on the phone.",
                  { command: "npm run dev:https" },
                )}
              </li>
            </ol>
          </div>
        ) : null}

        {backlog > 0 ? (
          <div role="status" className="rounded-xl bg-amber-400/10 p-3.5 text-sm leading-relaxed text-amber-100">
            <p className="font-semibold">{t("{count} confirmed event frames waiting to upload", { count: backlog })}</p>
            <p className="mt-1">{t(backlog >= MAX_PENDING_CAMERA_FRAMES ? "Event buffer full. Detection is paused until uploads catch up; keep this page open." : started ? "Events are kept in memory until sent. Keep this page open and connected." : "Restart the camera to send queued events. Closing this page loses unsent frames.")}</p>
          </div>
        ) : null}

        <div
          className={
            started
              ? "relative overflow-hidden rounded-2xl bg-slate-900"
              : "relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-900 sm:aspect-square"
          }
        >
          <video
            ref={videoRef}
            className="block h-auto w-full"
            autoPlay
            muted
            playsInline
            aria-label={t("Live preview from this phone camera")}
          />
          <canvas
            ref={overlayRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />

          {started ? (
            <>
              <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                  <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white" />
                  {t("Live")}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold backdrop-blur ${aiBadge.tone}`}>
                  <Sparkles className="h-3 w-3" />
                  {aiBadge.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                  <Activity className="h-3 w-3" />
                  {t("Motion {value}%", { value: motionPct.toFixed(1) })}
                </span>
                {cameraMoving ? <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">{t("Camera movement compensated")}</span> : null}
              </div>

              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {detections.slice(0, 4).map((detection) => (
                    <span
                      key={detection.trackId}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur"
                    >
                      <span aria-hidden>{detection.emoji}</span>
                      {t(detection.label)}
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
                      {t(aiState === "unavailable" ? "Video only — detection unavailable" : "Watching for people & animals…")}
                    </span>
                  ) : null}
                </div>

                <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white/80 backdrop-blur">
                  <Wifi className="h-3 w-3" />
                  {t("{frames} frames · {quality}", {
                    frames: uploads,
                    quality: qualityLabel,
                  })}
                </span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 py-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 text-leaf-300">
                <Camera className="h-7 w-7" />
              </span>
              <div>
                <h2 className="text-xl font-semibold">{t("Point at your field")}</h2>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-300">
                  {t(
                    "People and animals are tracked on this phone. Alarm timing depends on the phone, connection and dashboard polling.",
                  )}
                </p>
              </div>
              <Button
                onClick={() => void startCamera("environment")}
                loading={starting}
                disabled={!pairing || isEnded || !secure || !hasMedia}
                className="min-h-12 px-5 text-sm"
              >
                <Camera aria-hidden className="h-4 w-4" />
                {starting ? t("Opening camera…") : t("Start camera stream")}
              </Button>
              {starting ? <button type="button" onClick={stopCamera} className="btn btn-secondary border-white/15 bg-white/5 text-slate-100">{t("Cancel camera start")}</button> : null}
              {pairingBusy ? (
                <p className="text-[11px] text-slate-400">{t("Checking camera link…")}</p>
              ) : null}
            </div>
          )}
        </div>

        {cameraError ? (
          <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="flex items-center gap-2 font-semibold">
              <TriangleAlert aria-hidden className="h-4 w-4 shrink-0" />
              {t("Could not start the camera")}
            </p>
            <p className="mt-2 leading-relaxed">{t(cameraError)}</p>
            <p className="mt-2 text-xs leading-relaxed">
              {t(
                "Check camera access in your browser settings, then try starting the stream again.",
              )}
            </p>
          </div>
        ) : null}

        {uploadError ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3.5 text-sm text-amber-100">
            {t("Upload: {error}", { error: t(uploadError) })}
          </div>
        ) : null}

        {captureError ? <p role="alert" className="rounded-xl bg-amber-400/10 p-3.5 text-sm leading-relaxed text-amber-100">{t(captureError)}</p> : null}

        {aiError ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3.5 text-sm text-amber-100">
            <p>{t(aiError)}</p>
            <button type="button" onClick={() => void loadAi()} disabled={aiState === "loading"} className="btn btn-secondary mt-3 border-white/15 bg-white/5 text-slate-100">{t("Retry detector")}</button>
          </div>
        ) : null}

        {started ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                icon={<Radio className="h-3.5 w-3.5" />}
                label={t("Stream")}
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
                label={t("Upload")}
                value={
                  uploadState === "error"
                    ? t("Retrying")
                    : uploadState === "ok"
                      ? t("Receiving")
                      : t("Starting")
                }
                tone={uploadState === "error" ? "danger" : "default"}
              />
              <Stat
                icon={<Zap className="h-3.5 w-3.5" />}
                label={t("Link")}
                value={qualityLabel}
              />
              <Stat
                icon={<MapPin className="h-3.5 w-3.5" />}
                label={t("GPS")}
                value={gps ? `±${Math.round(gps.accuracy)} ${t("m")}` : "—"}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void flipCamera()}
                disabled={controlBusy}
                className="btn btn-secondary flex-1 border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
              >
                <FlipHorizontal className="h-4 w-4" />
                {t("Flip camera")}
              </button>
              {torchSupported ? (
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  disabled={controlBusy}
                  className="btn btn-secondary border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                  aria-pressed={torchOn}
                >
                  <Flashlight className="h-4 w-4" />
                  {torchOn ? t("Torch off") : t("Torch on")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={stopCamera}
                className="btn btn-danger"
              >
                <CameraOff className="h-4 w-4" />
                {t("Stop")}
              </button>
            </div>

            <section aria-label={t("Camera controls")} className="space-y-3 border-t border-white/10 pt-4">
              {zoomRange ? <div>
                <label htmlFor="camera-zoom" className="flex justify-between gap-2 text-sm font-semibold">{t("Camera zoom")}<span className="tabular-nums">{zoom.toFixed(1)}×</span></label>
                <input id="camera-zoom" type="range" min={zoomRange.min} max={Math.min(zoomRange.max, Math.max(4, zoomRange.min))} step={zoomRange.step || 0.1} value={zoom} disabled={controlBusy} onChange={(event) => void changeZoom(Number(event.target.value))} className="min-h-11 w-full accent-leaf-300" />
              </div> : null}
              <div className="flex flex-wrap gap-2">
                {focusModes.some((mode) => mode === "continuous" || mode === "single-shot") ? <button type="button" onClick={() => void refocus()} disabled={controlBusy} className="btn btn-secondary border-white/15 bg-white/5 text-slate-100"><Crosshair aria-hidden className="h-4 w-4" />{t("Refocus camera")}</button> : null}
                <button type="button" aria-pressed={distantScan} onClick={() => {
                  const next = !distantScan;
                  distantScanRef.current = next;
                  setDistantScan(next);
                }} className="btn btn-secondary border-white/15 bg-white/5 text-slate-100"><ScanEye aria-hidden className="h-4 w-4" />{t(distantScan ? "Distant scan on" : "Enable distant scan")}</button>
              </div>
              <p className="text-sm leading-relaxed text-slate-300">{t("Distant scan checks overlapping crops for small subjects. It uses more battery and may slow detection. Zoom and focus appear only on supported cameras.")}</p>
              {controlError ? <p role="status" className="text-sm text-amber-200">{t(controlError)}</p> : null}
            </section>

            {detections.length > 0 ? (
              <section className="space-y-2">
                <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  <span>{t("In view now")}</span>
                  {groqQueued ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-emerald-300">
                      <Gauge className="h-3 w-3" />
                      {t("Groq check queued")}
                    </span>
                  ) : null}
                </p>
                <div className="space-y-1.5">
                  {detections.map((detection) => (
                    <div
                      key={detection.trackId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="text-base">{detection.emoji}</span>
                        {t(detection.label)}
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                          {Math.round(detection.confidence * 100)}%
                        </span>
                        {detection.confirmed ? (
                          <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-emerald-300">
                            {t("Confirmed")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-300">
                            {t(detection.coasting ? "Predicted" : "Checking")}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {t(detection.coasting ? "temporarily out of view" : detection.direction ?? (detection.moving ? "moving" : "still"))}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {gpsError ? (
              <p className="text-[11px] leading-relaxed text-amber-300/80">
                {t(gpsError)}
              </p>
            ) : null}

              <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              {t(
                "Detection runs on this phone. Only people and animals are tracked. Small JPEG snapshots and event records are sent to the dashboard; this is not continuous video recording.",
              )}
            </p>
          </>
        ) : null}

        <p className="pt-1 text-center text-xs leading-relaxed text-slate-400">
          {t("Keep this page open and point the rear camera at the field.")}
        </p>
      </div>
      {mounted && phoneAlerts.length > 0 ? createPortal(
        <section aria-label={t("Camera alarm receipts")} className="camera-surface pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[1100] mx-auto flex max-h-[45dvh] max-w-xl flex-col gap-2">
          <div ref={receiptScrollRef} role="log" aria-live="assertive" aria-relevant="additions text" className="pointer-events-auto min-h-0 space-y-2 overflow-y-auto overscroll-contain p-1">
            {phoneAlerts.map((alert) => <article key={alert.id} data-phone-alarm-id={alert.id} className="rounded-2xl bg-slate-800 p-3 text-slate-100 shadow-[0_6px_24px_rgba(0,0,0,0.3)]">
              <div className="flex items-start gap-3">
                <BellRing aria-hidden className="mt-1 h-5 w-5 shrink-0 text-red-300" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-red-200">{t("Alarm saved on dashboard")}</p><p className="mt-1 break-words text-base font-semibold">{t(alert.message)}</p></div>
                <button type="button" aria-label={t("Dismiss receipt: {message}", { message: t(alert.message) })} onClick={() => {
                  phoneDismissedRef.current.add(alert.id);
                  setPhoneAlerts((current) => current.filter((item) => item.id !== alert.id));
                }} className="icon-btn shrink-0 border-white/15 bg-transparent text-slate-100"><X aria-hidden className="h-4 w-4" /></button>
              </div>
            </article>)}
          </div>
          <button type="button" onClick={() => {
            phoneAlerts.forEach((alert) => phoneDismissedRef.current.add(alert.id));
            setPhoneAlerts([]);
          }} className="btn btn-secondary pointer-events-auto shrink-0 border-white/15 bg-slate-800 text-slate-100">{t("Dismiss receipts — dashboard siren stays on")}</button>
        </section>, document.body,
      ) : null}
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

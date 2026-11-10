import { ApiError } from "./api-client";
import type { CameraSessionDTO, FrameDetection } from "./camera";

export interface CameraPreviewFrame {
  sessionId: number;
  version: string;
  src: string;
  width: number;
  height: number;
  capturedAt: string;
  detections: FrameDetection[];
}

interface PreviewEnvironment {
  fetch: typeof fetch;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  decode: (url: string, signal: AbortSignal) => Promise<{ width: number; height: number }>;
}

export function cameraFrameVersion(session: CameraSessionDTO): string | null {
  if (!session.frameUpdatedAt || !session.frameUrl) return null;
  const time = new Date(session.frameUpdatedAt).getTime();
  return Number.isFinite(time) ? String(time) : null;
}

export function snapshotFrameDetections(detections: FrameDetection[]): FrameDetection[] {
  return detections.map((item) => ({
    ...item, box: [...item.box], path: item.path?.map(([x, y]) => [x, y]),
  }));
}

function decodeImage(url: string, signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      if (error) { image.src = ""; reject(error); }
      else if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      } else reject(new Error("Camera frame could not be decoded."));
    };
    const abort = () => finish(new DOMException("Camera frame cancelled.", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    image.onerror = () => finish(new Error("Camera frame could not be decoded."));
    if (typeof image.decode !== "function") image.onload = () => finish();
    image.src = url;
    if (typeof image.decode === "function") void image.decode().then(() => finish(), finish);
  });
}

/** Fetch and decode the exact metadata version; never pair new boxes with old pixels. */
export async function loadCameraPreviewFrame(
  session: CameraSessionDTO,
  signal: AbortSignal,
  environment: PreviewEnvironment = {
    fetch: (...args) => fetch(...args),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    decode: decodeImage,
  },
): Promise<CameraPreviewFrame> {
  const version = cameraFrameVersion(session);
  if (!version || !session.frameUrl) throw new Error("This camera has no frame yet.");
  signal.throwIfAborted();
  const snapshot = {
    sessionId: session.id, version, capturedAt: session.frameUpdatedAt!,
    detections: snapshotFrameDetections(session.latestDetections),
  };
  const response = await environment.fetch(session.frameUrl, { cache: "no-store", signal });
  signal.throwIfAborted();
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(error?.error ?? "Could not load the camera image.", response.status, error?.code);
  }
  if (response.headers.get("X-Camera-Frame-Version") !== version) {
    throw new ApiError("A newer camera frame is available.", 409, "FRAME_SUPERSEDED");
  }
  const blob = await response.blob();
  signal.throwIfAborted();
  const src = environment.createObjectURL(blob);
  try {
    const dimensions = await environment.decode(src, signal);
    signal.throwIfAborted();
    if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error("Camera frame could not be decoded.");
    }
    return { ...snapshot, src, ...dimensions };
  } catch (cause) {
    environment.revokeObjectURL(src);
    throw cause;
  }
}

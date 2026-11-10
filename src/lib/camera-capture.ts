import type { CameraIngestPayload, IngestDetection } from "./camera";
import { luminanceFromRgba } from "./camera-motion";

export const MAX_PENDING_CAMERA_FRAMES = 32;
const ENCODE_TIMEOUT_MS = 8_000;

export interface CameraFrameSnapshot {
  canvas: HTMLCanvasElement;
  detections: IngestDetection[];
  capturedAt: string;
  capturedTime: number;
  aiEnabled: boolean;
  motion: number;
  geo: { lat: number; lng: number } | null;
}

export interface PendingCameraFrame {
  blob: Blob;
  meta: Omit<CameraIngestPayload, "frame">;
  trackIds: string[];
}

export interface LuminanceSample {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function sampleCameraLuminance(
  source: CanvasImageSource, sourceWidth: number, sourceHeight: number, canvas: HTMLCanvasElement,
): LuminanceSample | null {
  const scale = 64 / Math.max(sourceWidth, sourceHeight);
  const width = Math.max(24, Math.round(sourceWidth * scale));
  const height = Math.max(24, Math.round(sourceHeight * scale));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  return { data: luminanceFromRgba(context.getImageData(0, 0, width, height).data), width, height };
}

/**
 * Freeze pixels and metadata synchronously BEFORE JPEG encoding yields. The
 * detector can then move on without uploading its next frame with old boxes.
 */
export async function encodeCameraFrame(
  snapshot: CameraFrameSnapshot, slow: boolean, deviceLabel: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PendingCameraFrame> {
  options.signal?.throwIfAborted();
  if (snapshot.canvas.width <= 0 || snapshot.canvas.height <= 0) throw new Error("Camera frame has no pixels.");
  const active = snapshot.detections.some((item) => !item.coasting);
  const targetWidth = active ? slow ? 360 : 560 : slow ? 320 : 460;
  const width = Math.min(targetWidth, snapshot.canvas.width);
  const height = Math.max(1, Math.round(snapshot.canvas.height / snapshot.canvas.width * width));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the frame.");
  context.drawImage(snapshot.canvas, 0, 0, width, height);
  const meta: Omit<CameraIngestPayload, "frame"> = {
    frameWidth: width, frameHeight: height,
    detections: snapshot.detections.map((item) => ({
      ...item, box: [...item.box], path: item.path?.map(([x, y]) => [x, y]),
    })),
    capturedAt: snapshot.capturedAt, aiEnabled: snapshot.aiEnabled, motion: snapshot.motion,
    deviceLabel, quality: slow ? "low" : active ? "high" : "balanced",
    ...(snapshot.geo ? { lat: snapshot.geo.lat, lng: snapshot.geo.lng } : {}),
  };
  const blob = await new Promise<Blob>((resolve, reject) => {
    const signal = options.signal;
    let settled = false;
    const finish = (blob: Blob | null, error?: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (blob) resolve(blob);
      else reject(new Error("Could not encode the frame."));
    };
    const abort = () => finish(null, new DOMException("Frame encoding cancelled.", "AbortError"));
    // Some mobile browsers never invoke toBlob after camera suspension. A
    // timeout releases the upload loop; buffered events retain their pixels.
    const timer = window.setTimeout(() => finish(null, new Error("Camera frame encoding timed out.")), options.timeoutMs ?? ENCODE_TIMEOUT_MS);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    try { canvas.toBlob((blob) => finish(blob), "image/jpeg", active ? slow ? 0.4 : 0.6 : slow ? 0.34 : 0.46); }
    catch (cause) { finish(null, cause); }
  });
  return { blob, meta, trackIds: meta.detections.filter((item) => item.confirmed && !item.coasting).map((item) => item.trackId) };
}

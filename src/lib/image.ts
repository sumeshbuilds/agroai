/**
 * Browser-side photo preparation for plant scans.
 *
 * Phone cameras produce 3–8 MB images with EXIF rotation. We draw the photo to
 * a canvas (which applies the browser's EXIF handling), downscale the long edge
 * to 1280 px and re-encode as JPEG so the upload is small while fine lesions
 * stay readable. A quick blur/exposure check runs on the same canvas so the
 * farmer can retake a weak photo before waiting for the AI.
 */

import type { ImageQuality } from "./disease";

export interface PhotoQuality {
  label: ImageQuality;
  /** 0–100, higher is better. */
  score: number;
  /** 0–255 average luminance. */
  brightness: number;
  /** Normalised Laplacian variance; higher means sharper. */
  sharpness: number;
  issue: string | null;
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  quality: PhotoQuality;
}

const MAX_EDGE = 1280;
const TARGET_BYTES = 1_400_000;
const QUALITIES = [0.86, 0.76, 0.64];
const SAMPLE_EDGE = 240;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("This photo could not be read. Please choose a JPEG photo."));
    image.src = src;
  });
}

function encode(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

function blankQuality(issue: string | null): PhotoQuality {
  return {
    label: issue ? "fair" : "unknown",
    score: issue ? 50 : 0,
    brightness: 0,
    sharpness: 0,
    issue,
  };
}

/**
 * Estimates sharpness (Laplacian variance) and exposure from a small grayscale
 * sample. The thresholds are intentionally generous: this is a hint, not a
 * hard gate, because a close-up of a smooth leaf is naturally low-contrast.
 */
function measureQuality(canvas: HTMLCanvasElement): PhotoQuality {
  try {
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(canvas.width, canvas.height));
    const width = Math.max(8, Math.round(canvas.width * scale));
    const height = Math.max(8, Math.round(canvas.height * scale));

    const sample = document.createElement("canvas");
    sample.width = width;
    sample.height = height;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) return blankQuality(null);

    context.drawImage(canvas, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    const gray = new Float32Array(width * height);
    let brightnessSum = 0;
    for (let i = 0; i < gray.length; i += 1) {
      const offset = i * 4;
      const luminance =
        0.299 * data[offset] +
        0.587 * data[offset + 1] +
        0.114 * data[offset + 2];
      gray[i] = luminance;
      brightnessSum += luminance;
    }
    const brightness = brightnessSum / gray.length;

    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const laplacian =
          4 * gray[index] -
          gray[index - 1] -
          gray[index + 1] -
          gray[index - width] -
          gray[index + width];
        sum += laplacian;
        sumSquares += laplacian * laplacian;
        count += 1;
      }
    }
    const mean = count > 0 ? sum / count : 0;
    const variance = count > 0 ? sumSquares / count - mean * mean : 0;
    const sharpness = variance / (255 * 255);

    let issue: string | null = null;
    let label: ImageQuality = "good";

    if (brightness < 40) {
      label = "poor";
      issue = "This photo is too dark. Move into daylight and try again.";
    } else if (brightness > 220) {
      label = "poor";
      issue = "This photo is overexposed. Avoid direct glare or flash.";
    } else if (sharpness < 0.0007) {
      label = "poor";
      issue = "This photo looks blurry. Hold still and let the camera focus.";
    } else if (brightness < 55 || brightness > 205 || sharpness < 0.0016) {
      label = "fair";
      issue =
        brightness < 55
          ? "The photo is a little dark — daylight will give a clearer result."
          : brightness > 205
            ? "The photo is very bright — shade the leaf from direct sun."
            : "The photo is slightly soft. Get closer and hold the phone steady.";
    }

    let score = 100;
    score -= Math.abs(128 - brightness) * 0.2;
    score -= Math.max(0, 0.002 - sharpness) * 18_000;
    score = Math.round(Math.min(100, Math.max(0, score)));

    return { label, score, brightness, sharpness, issue };
  } catch {
    return blankQuality(null);
  }
}

export async function prepareScanImage(file: File): Promise<PreparedImage> {
  if (file.size === 0) {
    throw new Error("That photo is empty. Please take another one.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;

    if (naturalWidth < 24 || naturalHeight < 24) {
      throw new Error("That photo is too small. Please take a new photo.");
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Your browser cannot prepare photos. Please use another browser.");
    }

    // White backing keeps transparent PNGs readable to the vision model.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    let quality = measureQuality(canvas);

    // A tiny source image stays blocky even after resizing, which hides fine
    // spots. Warn even when the exposure and focus checks look acceptable.
    if (naturalWidth < 600 || naturalHeight < 600) {
      quality = {
        ...quality,
        label: quality.label === "poor" ? "poor" : "fair",
        issue:
          quality.issue ??
          "The photo is low resolution. Move closer so the affected part fills the frame.",
      };
    }

    for (const qualityLevel of QUALITIES) {
      const blob = await encode(canvas, qualityLevel);
      if (!blob) break;
      if (
        blob.size <= TARGET_BYTES ||
        qualityLevel === QUALITIES[QUALITIES.length - 1]
      ) {
        return { blob, width, height, quality };
      }
    }

    throw new Error("This photo could not be compressed. Please try another one.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

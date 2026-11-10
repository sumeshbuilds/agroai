/**
 * Browser-side photo preparation for plant scans.
 *
 * Phone cameras produce 3–8 MB images with EXIF rotation. We draw the photo to
 * a canvas (which applies the browser's EXIF handling), downscale the long edge
 * to 1000 px and re-encode as JPEG so the upload is small and the AI sees the
 * whole plant part rather than a cropped thumbnail.
 */

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

const MAX_EDGE = 1000;
const TARGET_BYTES = 1_200_000;
const QUALITIES = [0.82, 0.72, 0.62];

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

    for (const quality of QUALITIES) {
      const blob = await encode(canvas, quality);
      if (!blob) break;
      if (blob.size <= TARGET_BYTES || quality === QUALITIES[QUALITIES.length - 1]) {
        return { blob, width, height };
      }
    }

    throw new Error("This photo could not be compressed. Please try another one.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

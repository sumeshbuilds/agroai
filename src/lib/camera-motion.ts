export interface CameraMotion {
  /** Apparent movement of the scene in normalised frame coordinates. */
  dx: number;
  dy: number;
  confidence: number;
  /** Residual changed pixels after translation and exposure compensation. */
  motion: number;
  rawMotion: number;
  exposureDelta: number;
}

export const STILL_CAMERA: CameraMotion = {
  dx: 0, dy: 0, confidence: 0, motion: 0, rawMotion: 0, exposureDelta: 0,
};

export function luminanceFromRgba(data: Uint8ClampedArray): Uint8ClampedArray {
  const luminance = new Uint8ClampedArray(data.length / 4);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const index = pixel * 4;
    luminance[pixel] = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
  }
  return luminance;
}

/**
 * Small, robust translation search. Brightness changes and camera panning do
 * not count as object movement. This is not optical stabilisation and cannot
 * reconstruct a blurred frame, rotation, or a pan beyond the search window.
 */
export function estimateCameraMotion(
  previous: Uint8ClampedArray | null,
  current: Uint8ClampedArray,
  width: number,
  height: number,
): CameraMotion {
  if (!previous || previous.length !== current.length || current.length !== width * height || width < 24 || height < 24) {
    return { ...STILL_CAMERA };
  }
  const radius = Math.min(8, Math.floor(Math.min(width, height) / 5));
  const samples: number[] = [];
  let rawChanged = 0;
  let texture = 0;
  for (let y = radius; y < height - radius; y += 2) {
    for (let x = radius; x < width - radius; x += 2) {
      const index = y * width + x;
      const difference = current[index] - previous[index];
      samples.push(difference);
      if (Math.abs(difference) > 24) rawChanged += 1;
      texture += Math.abs(previous[index] - previous[index - 1]);
    }
  }
  samples.sort((a, b) => a - b);
  const exposureDelta = samples[Math.floor(samples.length / 2)] ?? 0;
  const errorAt = (dx: number, dy: number) => {
    let error = 0;
    for (let y = radius; y < height - radius; y += 2) {
      for (let x = radius; x < width - radius; x += 2) {
        const difference = current[y * width + x] - previous[(y - dy) * width + x - dx] - exposureDelta;
        // Limit moving foreground objects' influence on the global estimate.
        error += Math.min(40, Math.abs(difference));
      }
    }
    return error / Math.max(1, samples.length);
  };
  const zeroError = errorAt(0, 0);
  let bestError = zeroError;
  let bestX = 0;
  let bestY = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const error = errorAt(dx, dy) + Math.hypot(dx, dy) * 0.04;
      if (error < bestError) { bestError = error; bestX = dx; bestY = dy; }
    }
  }
  const improvement = (zeroError - bestError) / Math.max(1, zeroError);
  const reliable = texture / Math.max(1, samples.length) > 6 && improvement > 0.18 && bestError < 22;
  if (!reliable) { bestX = 0; bestY = 0; }
  let changed = 0;
  for (let y = radius; y < height - radius; y += 2) {
    for (let x = radius; x < width - radius; x += 2) {
      if (Math.abs(current[y * width + x] - previous[(y - bestY) * width + x - bestX] - exposureDelta) > 24) changed += 1;
    }
  }
  return {
    dx: bestX / width, dy: bestY / height,
    confidence: reliable ? Math.min(1, improvement) : 0,
    motion: changed / Math.max(1, samples.length),
    rawMotion: rawChanged / Math.max(1, samples.length), exposureDelta,
  };
}

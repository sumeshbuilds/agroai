/**
 * Pure low-bandwidth helpers for the phone-to-dashboard camera link.
 *
 * The phone adapts frame size, request timeout and upload interval from what it
 * has actually measured (not just the browser's `effectiveType` label), while
 * the dashboard backs off when metadata/frame polls fail. Keeping the arithmetic
 * here makes the behaviour testable without a browser or a live network.
 */

export interface LinkTuningInput {
  /** Minimum gap between uploads for the current activity level. */
  baseIntervalMs: number;
  /** Exponentially smoothed duration of the previous upload attempt. */
  uploadMs: number;
  /** Consecutive failed upload attempts. */
  failures: number;
  /** Browser reports 2G / data-saver. */
  slow: boolean;
}

/** A link is degraded when the browser says so, an upload failed, or a frame took >2.5 s. */
export function isDegradedLink(input: {
  slow: boolean;
  uploadMs: number;
  failures: number;
}): boolean {
  return input.slow || input.failures > 0 || input.uploadMs > 2_500;
}

/**
 * Abort a hung upload before it freezes the whole loop. Even on a slow link the
 * frame is downscaled heavily, so 14–18 s is plenty; measured time extends it
 * only up to 25 s.
 */
export function uploadTimeoutMs(input: {
  slow: boolean;
  uploadMs: number;
}): number {
  const measured = input.uploadMs > 0 ? input.uploadMs * 2.5 : 0;
  const base = input.slow ? 14_000 : 18_000;
  return Math.round(Math.min(25_000, Math.max(8_000, base, measured)));
}

/** 2 s, 4 s, 8 s, 16 s, 30 s … after consecutive failures. */
export function uploadBackoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(30_000, 2_000 * 2 ** Math.min(failures - 1, 4));
}

/**
 * Target roughly half of the measured link capacity: if a frame takes 4 s to
 * send, wait at least 8 s before sending the next one. The cap keeps the live
 * view from going completely stale.
 */
export function uploadCadenceMs(input: LinkTuningInput): number {
  const measured = input.uploadMs > 0 ? input.uploadMs * 2 : 0;
  const backoff = uploadBackoffMs(input.failures);
  const cap = input.slow ? 30_000 : 20_000;
  return Math.round(
    Math.min(cap, Math.max(input.baseIntervalMs, measured, backoff)),
  );
}

/**
 * Dashboard metadata poll interval. Slow/hidden/failed links poll less often;
 * a live session still refreshes fast enough to feel immediate on a good link.
 */
export function nextPollDelay(input: {
  hidden: boolean;
  online: boolean;
  failures: number;
  live: boolean;
  slow: boolean;
  hasFrame: boolean;
}): number {
  if (!input.online) return 10_000;
  if (input.hidden) return 15_000;

  const base = input.live
    ? input.slow
      ? 4_000
      : 1_500
    : input.hasFrame
      ? 6_000
      : 2_500;
  const backoff =
    input.failures > 0
      ? Math.min(15_000, 1_500 * 2 ** Math.min(input.failures, 4))
      : 0;

  return Math.max(base, backoff);
}

/** Session-list poll interval (much cheaper than the frame detail poll). */
export function nextSessionListDelay(input: {
  hidden: boolean;
  online: boolean;
  failures: number;
}): number {
  if (!input.online) return 15_000;
  if (input.hidden) return 20_000;
  if (input.failures <= 0) return 8_000;
  return Math.min(30_000, 8_000 + 4_000 * Math.min(input.failures, 4));
}

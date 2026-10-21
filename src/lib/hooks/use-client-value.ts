"use client";

import { useSyncExternalStore } from "react";

const subscribeToNothing = () => () => {};

/**
 * Reads a client-only value during render (browser APIs, the current time)
 * without an effect, falling back to `serverSnapshot` during SSR/prerender.
 *
 * Prefer this over `useEffect(() => setState(...), [])`, which triggers a
 * cascading render and is flagged by `react-hooks/set-state-in-effect`.
 */
export function useClientValue<T>(getSnapshot: () => T, serverSnapshot: T): T {
  return useSyncExternalStore(subscribeToNothing, getSnapshot, () => serverSnapshot);
}

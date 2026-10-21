"use client";

import { useCallback, useSyncExternalStore } from "react";

export type NotificationState =
  | NotificationPermission
  | "unsupported";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (typeof window !== "undefined" && "Notification" in window) {
    window.addEventListener("focus", callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined" && "Notification" in window) {
      window.removeEventListener("focus", callback);
    }
  };
}

function getPermissionSnapshot(): NotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function getPermissionServerSnapshot(): NotificationState {
  return "default";
}

/**
 * Thin wrapper around the browser Notification API. Local notifications are
 * enough for the MVP (no service worker / VAPID keys required).
 */
export function useNotifications() {
  const permission = useSyncExternalStore(
    subscribe,
    getPermissionSnapshot,
    getPermissionServerSnapshot,
  );

  const requestPermission = useCallback(async (): Promise<NotificationState> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    const result = await Notification.requestPermission();
    emit();
    return result;
  }, []);

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    if (Notification.permission !== "granted") return false;

    try {
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { permission, requestPermission, notify };
}

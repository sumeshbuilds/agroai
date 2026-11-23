"use client";

/**
 * Tiny IndexedDB-backed queue for intrusion snapshots captured while the phone
 * has no usable link. It never stores more than the newest 20 captures, so a
 * long outage cannot fill the phone's storage. `localStorage` is used only when
 * IndexedDB is unavailable (private mode / very old browser).
 *
 * The queue is intentionally data-URL based: a JPEG survives a reload, while a
 * Blob reference would not.
 */

import {
  SECURITY_OFFLINE_QUEUE_LIMIT,
  dataUrlToBlob,
  type OfflineCapture,
} from "./security-camera";
import type { CameraIngestPayload } from "./camera";

const DB_NAME = "agroai-security";
const DB_VERSION = 1;
const STORE = "captures";
const FALLBACK_KEY = "agroai.security.queue.v1";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (db: IDBDatabase | null) => {
      if (settled) return;
      settled = true;
      resolve(db);
    };
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("capturedAt", "capturedAt");
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });

  return dbPromise;
}

function readFallback(): OfflineCapture[] {
  try {
    const raw = window.localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineCapture[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFallback(items: OfflineCapture[]): void {
  try {
    window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: the in-memory event buffer remains.
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const result = await run(store);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Queue transaction failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Queue transaction aborted."));
    });
    return result;
  } catch {
    return null;
  }
}

export interface SecurityOfflineQueue {
  count(): Promise<number>;
  list(): Promise<OfflineCapture[]>;
  enqueue(capture: OfflineCapture): Promise<number>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

async function listAll(): Promise<OfflineCapture[]> {
  const rows = await withStore("readonly", (store) => requestResult(store.getAll()));
  const items = rows ?? readFallback();
  return items.sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
}

async function trimToLimit(limit: number): Promise<void> {
  const items = await listAll();
  const excess = items.slice(0, Math.max(0, items.length - limit));
  for (const item of excess) {
    await withStore("readwrite", (store) => requestResult(store.delete(item.id)));
    // Fallback is rewritten below when IndexedDB is unavailable.
  }
}

export const securityOfflineQueue: SecurityOfflineQueue = {
  async count() {
    return (await listAll()).length;
  },

  list: listAll,

  async enqueue(capture) {
    const trimmed = capture.dataUrl.length > 0 ? capture : null;
    if (!trimmed) return (await listAll()).length;

    const stored = await withStore("readwrite", (store) => requestResult(store.put(capture)));
    if (stored === null) {
      const items = [...readFallback(), capture]
        .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt))
        .slice(-SECURITY_OFFLINE_QUEUE_LIMIT);
      writeFallback(items);
      return items.length;
    }

    await trimToLimit(SECURITY_OFFLINE_QUEUE_LIMIT);
    return (await listAll()).length;
  },

  async remove(id) {
    const removed = await withStore("readwrite", (store) => requestResult(store.delete(id)));
    if (removed === null) {
      writeFallback(readFallback().filter((item) => item.id !== id));
    }
  },

  async clear() {
    const cleared = await withStore("readwrite", (store) => requestResult(store.clear()));
    if (cleared === null) writeFallback([]);
  },
};

/** Convert a queued capture into the multipart form values. */
export function queuedCaptureToUpload(capture: OfflineCapture): {
  blob: Blob;
  meta: Omit<CameraIngestPayload, "frame">;
  trackIds: string[];
} {
  const meta = (capture.meta ?? {}) as Omit<CameraIngestPayload, "frame">;
  const detections = Array.isArray(meta.detections) ? meta.detections : [];
  return {
    blob: dataUrlToBlob(capture.dataUrl),
    meta,
    trackIds: detections
      .map((item) => (item && typeof item === "object" ? (item as { trackId?: unknown }).trackId : null))
      .filter((value): value is string => typeof value === "string"),
  };
}

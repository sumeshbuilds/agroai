import type { CameraAlertDTO, CameraAlertPage, CameraSessionDTO, FrameDetection, IngestDetection } from "../../src/lib/camera";

export function alarm(id: number, overrides: Partial<CameraAlertDTO> = {}): CameraAlertDTO {
  return {
    id, sessionId: 1, sessionName: "North field camera", detectionId: id,
    label: "Person", emoji: "", category: "person", confidence: 0.89,
    message: `Human detected at North field camera (${id})`,
    source: "on-device", verified: false, reviewStatus: "pending",
    lat: null, lng: null, createdAt: "2026-11-10T09:00:00.000Z", acknowledgedAt: null,
    ...overrides,
  };
}

export function rawDetection(overrides: Partial<IngestDetection> = {}): IngestDetection {
  return {
    trackId: "p1-test-run", objectClass: "person", confidence: 0.89,
    box: [0.2, 0.15, 0.15, 0.5], confirmed: true, hits: 3,
    moving: false, coasting: false, path: [[0.275, 0.4]], ...overrides,
  };
}

export function frameDetection(overrides: Partial<FrameDetection> = {}): FrameDetection {
  return {
    trackId: "p1-test-run", label: "Person", emoji: "", category: "person", confidence: 0.89,
    box: [0.2, 0.15, 0.15, 0.5], confirmed: true, hits: 3,
    moving: false, coasting: false, path: [[0.275, 0.4]], source: "on-device", ...overrides,
  };
}

export function cameraSession(overrides: Partial<CameraSessionDTO> = {}): CameraSessionDTO {
  return {
    id: 1, name: "North field camera", token: "test-camera-token", status: "live", isLive: true,
    aiEnabled: true, deviceLabel: "Test phone", lat: null, lng: null, motion: 0,
    latestDetections: [frameDetection()], totalDetections: 1,
    frameWidth: 640, frameHeight: 360, frameUpdatedAt: "2026-11-10T09:00:00.000Z",
    lastSeenAt: "2026-11-10T09:00:00.000Z", startedAt: "2026-11-10T09:00:00.000Z",
    endedAt: null, createdAt: "2026-11-10T09:00:00.000Z", farm: null,
    frameUrl: "/api/camera/sessions/1/frame?v=1794301200000", ...overrides,
  };
}

/** Emulate the dismissal-filtered keyset API without a network or database. */
export function alarmPage(
  rows: CameraAlertDTO[],
  options: { afterId?: number; excludedIds?: number[]; beforeId?: number; limit?: number } = {},
): CameraAlertPage {
  const afterId = options.afterId ?? 0;
  const excludedIds = options.excludedIds ?? [];
  const unread = rows.filter((row) => !row.acknowledgedAt && row.id > afterId && !excludedIds.includes(row.id))
    .sort((a, b) => b.id - a.id);
  const available = unread.filter((row) => options.beforeId === undefined || row.id < options.beforeId);
  const alerts = available.slice(0, options.limit ?? 50);
  return {
    alerts, unread: unread.length, latestId: unread[0]?.id ?? null,
    nextCursor: available.length > alerts.length ? alerts[alerts.length - 1].id : null,
    afterId, excludedIds,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

import type { CameraAlertDTO, CameraAlertPage } from "./camera";
import { isAlarmId, MAX_ALARM_EXCLUSIONS } from "./camera-alert-request";

export interface AlarmInboxSnapshot {
  alerts: CameraAlertDTO[];
  unread: number;
  latestId: number;
  nextCursor: number | null;
  pending: { throughId: number; ids: number[] };
}

const EMPTY: AlarmInboxSnapshot = {
  alerts: [], unread: 0, latestId: 0, nextCursor: null,
  pending: { throughId: 0, ids: [] },
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const dateOrNull = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(new Date(value).getTime()) ? value : null;
const countOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const ids = (value: unknown): number[] => Array.isArray(value) ? value.filter(isAlarmId) : [];

/** Storage is untrusted: normalise nullable fields before rendering or notifying. */
function readAlert(value: unknown): CameraAlertDTO | null {
  const item = record(value);
  if (!item || !isAlarmId(item.id) || !isAlarmId(item.sessionId) ||
      typeof item.message !== "string" || !item.message.trim() ||
      (item.category !== "person" && item.category !== "animal")) return null;
  if (item.acknowledgedAt !== null && item.acknowledgedAt !== undefined) return null;
  const verified = item.verified === true;
  const source = item.source === "groq" ? "groq" : "on-device";
  return {
    id: item.id, sessionId: item.sessionId,
    sessionName: typeof item.sessionName === "string" ? item.sessionName : "Field camera",
    detectionId: isAlarmId(item.detectionId) ? item.detectionId : null,
    label: typeof item.label === "string" ? item.label : item.category === "person" ? "Person" : "Animal",
    emoji: typeof item.emoji === "string" ? item.emoji : "",
    category: item.category,
    confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.min(1, Math.max(0, item.confidence)) : null,
    message: item.message, source, verified,
    reviewStatus: item.reviewStatus === "pending" || item.reviewStatus === "confirmed" || item.reviewStatus === "unconfirmed"
      ? item.reviewStatus : verified ? "confirmed" : source === "groq" ? "unconfirmed" : "pending",
    lat: typeof item.lat === "number" && Number.isFinite(item.lat) && Math.abs(item.lat) <= 90 ? item.lat : null,
    lng: typeof item.lng === "number" && Number.isFinite(item.lng) && Math.abs(item.lng) <= 180 ? item.lng : null,
    createdAt: dateOrNull(item.createdAt), acknowledgedAt: null,
  };
}

/**
 * Local safety latch. Polls may update alarms, but may never silently remove
 * them. Tombstones fence off stale responses and failed acknowledgements.
 * The server remains the durable history; this small cache also survives an
 * offline reload in the same browser, scoped to the signed-in farmer.
 */
export class CameraAlarmInbox {
  private items = new Map<number, CameraAlertDTO>();
  private dismissed = new Set<number>();
  private throughId = 0;
  private pendingThroughId = 0;
  private pendingIds = new Set<number>();
  private remoteUnread = 0;
  private latestId = 0;
  // Inclusive id ranges already scanned. Separate ranges preserve BOTH older
  // history and new gaps when more than one page arrives between fresh polls.
  private scanned: Array<[number, number]> = [];
  private listeners = new Set<() => void>();
  private snapshot: AlarmInboxSnapshot = EMPTY;

  getSnapshot = (): AlarmInboxSnapshot => this.snapshot;
  getServerSnapshot = (): AlarmInboxSnapshot => EMPTY;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  isDismissed(id: number): boolean {
    return id <= this.throughId || this.dismissed.has(id);
  }

  getQueryScope(): { afterId: number; excludedIds: number[] } {
    // Keep saved tombstones in the filter too: a response started before an
    // acknowledgement completed must not restore its old total or cursor.
    const excludedIds = [...new Set([...this.pendingIds, ...this.dismissed])].slice(0, MAX_ALARM_EXCLUSIONS);
    return { afterId: this.throughId, excludedIds };
  }

  ingest(page: CameraAlertPage, beforeId?: number): void {
    if (!Array.isArray(page.alerts) || (page.nextCursor !== null && !isAlarmId(page.nextCursor)) ||
        (beforeId !== undefined && page.nextCursor !== null && page.nextCursor >= beforeId)) {
      throw new Error("Invalid camera alarm page.");
    }
    const alerts = page.alerts.flatMap((item) => { const alert = readAlert(item); return alert ? [alert] : []; });
    for (const alert of alerts) {
      if (!this.isDismissed(alert.id)) this.items.set(alert.id, alert);
      this.latestId = Math.max(this.latestId, alert.id);
    }
    this.latestId = Math.max(this.latestId, isAlarmId(page.latestId) ? page.latestId : 0);
    const afterId = page.afterId ?? 0;
    const excluded = new Set(ids(page.excludedIds));
    const matchesScope = afterId === this.throughId && [...excluded].every((id) => this.isDismissed(id)) &&
      this.getQueryScope().excludedIds.every((id) => excluded.has(id));
    if (matchesScope) {
      // Pending dismissals beyond the bounded URL filter still apply to the
      // GLOBAL total, even if those stopped rows are on another page.
      const unfilteredPending = [...this.pendingIds].filter((id) => !excluded.has(id)).length;
      const locallyStopped = unfilteredPending + alerts.filter((item) =>
        this.isDismissed(item.id) && !excluded.has(item.id) && !this.pendingIds.has(item.id),
      ).length;
      this.remoteUnread = Math.max(0, countOrZero(page.unread) - locallyStopped);
      const upper = beforeId === undefined ? this.latestId : beforeId - 1;
      const lower = page.nextCursor ?? afterId + 1;
      this.scan(lower, upper);
      // An empty global unread set also exhausts gaps above an older cursor.
      if (page.unread === 0) this.scan(afterId + 1, this.latestId);
    }
    // A stale, pre-dismissal response may add genuinely newer alarms, but its
    // unfiltered total/cursor must not undo the local stopped snapshot.
    this.publish();
  }

  dismiss(id: number): void {
    if (!isAlarmId(id) || this.isDismissed(id)) return;
    this.items.delete(id);
    this.dismissed.add(id);
    this.pendingIds.add(id);
    this.remoteUnread = Math.max(0, this.remoteUnread - 1);
    this.scan(id, id);
    this.publish();
  }

  dismissThrough(throughId: number): void {
    if (!isAlarmId(throughId)) return;
    this.throughId = Math.max(this.throughId, throughId);
    this.pendingThroughId = Math.max(this.pendingThroughId, throughId);
    this.latestId = Math.max(this.latestId, throughId);
    for (const id of this.items.keys()) if (id <= this.throughId) this.items.delete(id);
    for (const id of this.dismissed) if (id <= this.throughId) this.dismissed.delete(id);
    for (const id of this.pendingIds) if (id <= this.throughId) this.pendingIds.delete(id);
    this.remoteUnread = this.items.size;
    this.scanned = this.scanned.filter((range) => range[1] > this.throughId)
      .map(([low, high]) => [Math.max(low, this.throughId + 1), high]);
    this.publish();
  }

  savedThrough(throughId: number): void {
    if (!isAlarmId(throughId)) return;
    // A later click may have queued a larger snapshot while this was saving.
    if (this.pendingThroughId <= throughId) this.pendingThroughId = 0;
    for (const id of this.pendingIds) if (id <= throughId) this.pendingIds.delete(id);
    this.publish();
  }

  savedId(id: number): void {
    if (!isAlarmId(id)) return;
    this.pendingIds.delete(id);
    this.publish();
  }

  serialize(): string {
    return JSON.stringify({
      version: 2,
      alerts: this.snapshot.alerts,
      dismissed: [...this.dismissed],
      throughId: this.throughId,
      pending: this.snapshot.pending,
      latestId: this.latestId,
      unread: this.snapshot.unread,
    });
  }

  hydrate(raw: string | null): void {
    if (!raw) return;
    try {
      const value = record(JSON.parse(raw));
      if (!value || (value.version !== 1 && value.version !== 2)) return;
      const pending = record(value.pending);
      this.pendingThroughId = Math.max(this.pendingThroughId, isAlarmId(pending?.throughId) ? pending.throughId : 0);
      this.throughId = Math.max(this.throughId, isAlarmId(value.throughId) ? value.throughId : 0, this.pendingThroughId);
      for (const id of ids(value.dismissed)) if (id > this.throughId) this.dismissed.add(id);
      for (const id of ids(pending?.ids)) if (id > this.throughId) {
        this.pendingIds.add(id);
        this.dismissed.add(id); // A pending dismissal is also a safety tombstone.
      }
      for (const id of this.pendingIds) if (id <= this.throughId) this.pendingIds.delete(id);
      for (const id of this.items.keys()) if (this.isDismissed(id)) this.items.delete(id);
      for (const item of Array.isArray(value.alerts) ? value.alerts : []) {
        const alert = readAlert(item);
        if (alert && !this.isDismissed(alert.id)) this.items.set(alert.id, alert);
      }
      this.latestId = Math.max(this.latestId, this.throughId, isAlarmId(value.latestId) ? value.latestId : 0);
      for (const id of [...this.items.keys(), ...this.dismissed, ...this.pendingIds]) this.latestId = Math.max(this.latestId, id);
      this.remoteUnread = Math.max(this.remoteUnread, countOrZero(value.unread));
      this.publish();
    } catch {
      // Corrupt/older storage cannot prevent fresh server alarms from loading.
    }
  }

  private scan(low: number, high: number): void {
    if (low > high || high <= this.throughId) return;
    const merged: Array<[number, number]> = [];
    for (const range of [...this.scanned, [Math.max(low, this.throughId + 1), high] as [number, number]].sort((a, b) => a[0] - b[0])) {
      const prior = merged[merged.length - 1];
      if (prior && range[0] <= prior[1] + 1) prior[1] = Math.max(prior[1], range[1]);
      else merged.push([...range]);
    }
    this.scanned = merged;
  }

  private nextCursor(): number | null {
    let missing = this.latestId;
    for (let index = this.scanned.length - 1; index >= 0; index -= 1) {
      const [low, high] = this.scanned[index];
      if (missing > high) break;
      if (missing >= low) missing = low - 1;
    }
    return missing > this.throughId ? missing + 1 : null;
  }

  private publish(): void {
    const alerts = [...this.items.values()].sort((a, b) => b.id - a.id);
    const unread = this.latestId <= this.throughId ? 0 : Math.max(0, this.remoteUnread);
    this.snapshot = {
      alerts,
      unread: Math.max(alerts.length, unread),
      latestId: this.latestId,
      nextCursor: this.nextCursor(),
      pending: { throughId: this.pendingThroughId, ids: [...this.pendingIds] },
    };
    this.listeners.forEach((listener) => listener());
  }
}

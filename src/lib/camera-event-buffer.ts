import {
  encodeCameraFrame, MAX_PENDING_CAMERA_FRAMES,
  type CameraFrameSnapshot, type PendingCameraFrame,
} from "./camera-capture";

interface BufferedEvent {
  snapshot: CameraFrameSnapshot | null;
  slow: boolean;
  deviceLabel: string;
  frame: PendingCameraFrame | null;
  encoding: Promise<PendingCameraFrame> | null;
  trackIds: string[];
}

/** A bounded FIFO. Stops, flips and failed encodes/uploads never discard events. */
export class CameraEventBuffer {
  private events: BufferedEvent[] = [];
  private queuedTracks = new Set<string>();
  private postedTracks = new Set<string>();

  constructor(
    private encode = encodeCameraFrame,
    readonly capacity = MAX_PENDING_CAMERA_FRAMES,
  ) {}

  get size(): number { return this.events.length; }
  get full(): boolean { return this.size >= this.capacity; }
  hasTrack(id: string): boolean { return this.queuedTracks.has(id) || this.postedTracks.has(id); }

  /** Reserve the event synchronously, BEFORE JPEG encoding can yield. */
  enqueue(snapshot: CameraFrameSnapshot, slow: boolean, deviceLabel: string): boolean {
    const trackIds = snapshot.detections.filter((item) => item.confirmed && !item.coasting).map((item) => item.trackId);
    if (this.full || !trackIds.some((id) => !this.hasTrack(id))) return false;
    // The source canvas is already frozen. Copy mutable metadata as well.
    const frozen = {
      ...snapshot,
      geo: snapshot.geo ? { ...snapshot.geo } : null,
      detections: snapshot.detections.map((item) => ({
        ...item, box: [...item.box] as typeof item.box,
        path: item.path?.map(([x, y]): [number, number] => [x, y]),
      })),
    };
    const event: BufferedEvent = { snapshot: frozen, slow, deviceLabel, frame: null, encoding: null, trackIds };
    this.events.push(event);
    trackIds.forEach((id) => this.queuedTracks.add(id));
    // Compress promptly, even if the operator stops before the upload tick.
    // A failed encode is retained and surfaced/retried by next().
    void this.prepare(event).catch(() => undefined);
    return true;
  }

  /** Successful encodes are reused on retry; failed encodes retain their pixels. */
  async next(signal?: AbortSignal): Promise<PendingCameraFrame | null> {
    signal?.throwIfAborted();
    const event = this.events[0];
    if (!event) return null;
    const encoding = this.prepare(event);
    if (!signal) return encoding;
    // Cancel only this caller's wait. The reserved event keeps encoding and
    // survives stops/flips so a later upload can reuse the exact same frame.
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException("Camera event upload cancelled.", "AbortError"));
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      encoding.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }

  private async prepare(event: BufferedEvent): Promise<PendingCameraFrame> {
    if (event.frame) return event.frame;
    if (!event.encoding) {
      event.encoding = this.encode(event.snapshot!, event.slow, event.deviceLabel).then((frame) => {
        event.frame = frame;
        event.snapshot = null; // Release the larger canvas once it is compressed.
        return frame;
      }).finally(() => { event.encoding = null; });
    }
    return event.encoding;
  }

  /** Remove only the exact event whose upload succeeded. */
  complete(frame: PendingCameraFrame): void {
    if (this.events[0]?.frame !== frame) return;
    const event = this.events.shift()!;
    event.trackIds.forEach((id) => {
      this.queuedTracks.delete(id);
      this.postedTracks.add(id);
    });
  }

  /** Run-unique ids make old posted tracks unnecessary after a camera restart. */
  beginRun(): void { this.postedTracks.clear(); }
}

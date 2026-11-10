import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alarmAudioState, closeCameraNotification, notificationSupport, playAlarmTone,
  primeAlarmAudio, requestNotificationPermission, setAlarmVolume,
  showCameraNotification, sirenIsPlaying, startAlarmSiren, stopAlarmSiren,
  subscribeAlarmAudio,
} from "../../src/lib/alarm";
import { mockGlobals } from "./helpers";

interface FakeParam {
  value: number;
  events: string[];
}

function param(value = 0): FakeParam {
  return {
    value, events: [],
    setValueAtTime(this: FakeParam, next: number) { this.value = next; this.events.push("set"); return this; },
    setTargetAtTime(this: FakeParam, next: number) { this.value = next; this.events.push("target"); return this; },
    exponentialRampToValueAtTime(this: FakeParam, next: number) { this.value = next; this.events.push("ramp"); return this; },
    cancelScheduledValues(this: FakeParam) { this.events.push("cancel"); return this; },
    linearRampToValueAtTime(this: FakeParam, next: number) { this.value = next; return this; },
  } as FakeParam;
}

class FakeNode {
  connected: FakeNode[] = [];
  connect(node: FakeNode): FakeNode { this.connected.push(node); return node; }
  disconnect(): void { this.connected = []; }
}

class FakeGain extends FakeNode {
  gain = param(1);
}

class FakeOscillator extends FakeNode {
  type = "sine";
  frequency = param(440);
  starts: number[] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;
  start(at: number): void { this.starts.push(at); }
  stop(at?: number): void { this.stops.push(at ?? -1); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static blockNextResume = false;
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 100;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  failOscillator = false;
  resumeCalls = 0;
  private listeners = new Map<string, Array<() => void>>();
  constructor() { FakeAudioContext.instances.push(this); }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }
  emit(type: string): void { (this.listeners.get(type) ?? []).forEach((listener) => listener()); }
  createGain(): FakeGain { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createDynamicsCompressor(): FakeNode & {
    threshold: FakeParam; knee: FakeParam; ratio: FakeParam; attack: FakeParam; release: FakeParam;
  } {
    return Object.assign(new FakeNode(), {
      threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25),
    });
  }
  createOscillator(): FakeOscillator {
    if (this.failOscillator) throw new Error("No audio output");
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (FakeAudioContext.blockNextResume) {
      FakeAudioContext.blockNextResume = false;
      return new Promise<void>(() => undefined); // Simulates a browser refusing to resume.
    }
    this.state = "running";
    this.emit("statechange");
  }
  async close(): Promise<void> { this.state = "closed"; }
}

const latest = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];

test("a suspended autoplay context keeps the siren request and starts exactly one continuous siren", async (t) => {
  mockGlobals(t, {
    window: { AudioContext: FakeAudioContext, setTimeout, clearTimeout, isSecureContext: true },
  });
  stopAlarmSiren();
  const changes: string[] = [];
  const unsubscribe = subscribeAlarmAudio(() => changes.push(alarmAudioState()));
  t.after(() => { unsubscribe(); stopAlarmSiren(); });

  FakeAudioContext.blockNextResume = true;
  assert.equal(startAlarmSiren("person"), false);
  assert.equal(latest().state, "suspended");
  assert.equal(latest().oscillators.length, 0);
  assert.equal(alarmAudioState(), "locked");

  assert.equal(await primeAlarmAudio(), true);
  const context = latest();
  assert.equal(context.state, "running");
  assert.ok(context.resumeCalls >= 1);
  assert.equal(context.oscillators.length, 4);
  assert.ok(changes.some((value) => value === "running"));

  // The latched siren must not restart as a second stack, and nothing stops it
  // automatically. `start` is called once per node; `stop` only on a dismissal.
  assert.equal(startAlarmSiren("person"), true);
  context.emit("statechange");
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  assert.equal(context.oscillators.length, 4);
  assert.deepEqual(context.oscillators.map((node) => node.starts.length), [1, 1, 1, 1]);
  assert.deepEqual(context.oscillators.map((node) => node.stops.length), [0, 0, 0, 0]);
  assert.equal(sirenIsPlaying(), true);

  stopAlarmSiren();
  assert.equal(sirenIsPlaying(), false);
  assert.deepEqual(context.oscillators.map((node) => node.stops.length), [1, 1, 1, 1]);
  // Silence is faded in, not cut: the siren gain ramps down before disconnects.
  const sirenGain = context.gains[1];
  assert.ok(sirenGain.gain.events.includes("cancel"), JSON.stringify(context.gains.map((gain) => gain.gain.events)));
  assert.ok(sirenGain.gain.events.includes("ramp"));
  stopAlarmSiren();
  assert.deepEqual(context.oscillators.map((node) => node.stops.length), [1, 1, 1, 1]);
});

test("retuning between person and animal reuses the wail; stopping then starting builds a fresh one", async (t) => {
  mockGlobals(t, { window: { AudioContext: FakeAudioContext, setTimeout, clearTimeout } });
  if (latest().state === "closed") assert.equal(await primeAlarmAudio(), true);
  const context = latest();
  t.after(() => { stopAlarmSiren(); context.state = "closed"; });
  if (context.state !== "running") assert.equal(await primeAlarmAudio(), true);
  assert.equal(startAlarmSiren("person"), true);
  const before = context.oscillators.length;
  startAlarmSiren("animal");
  assert.equal(context.oscillators.length, before);
  assert.ok(context.oscillators[before - 4].frequency.value < 1_760);
  stopAlarmSiren();
  startAlarmSiren("animal");
  assert.ok(context.oscillators.length > before, "a new siren is built after an explicit stop");
  assert.equal(context.oscillators[context.oscillators.length - 1].stops.length, 0);
});

test("audio failure is contained: no crash, sound unavailable, and a tap can recover", async (t) => {
  mockGlobals(t, { window: { AudioContext: FakeAudioContext, setTimeout, clearTimeout } });
  if (latest().state === "closed") assert.equal(await primeAlarmAudio(), true);
  const context = latest();
  t.after(() => { stopAlarmSiren(); context.state = "closed"; context.failOscillator = false; });
  if (context.state !== "running") assert.equal(await primeAlarmAudio(), true);
  context.failOscillator = true;
  assert.doesNotThrow(() => startAlarmSiren("person"));
  assert.equal(alarmAudioState(), "unavailable");
  assert.equal(startAlarmSiren("animal"), false);

  context.failOscillator = false;
  assert.equal(await primeAlarmAudio(), true);
  assert.equal(alarmAudioState(), "running");
  assert.equal(sirenIsPlaying(), true);
});

test("volume is clamped, applied to the master chain, and the test tone never throws", async (t) => {
  mockGlobals(t, { window: { AudioContext: FakeAudioContext, setTimeout, clearTimeout } });
  if (latest().state === "closed") await primeAlarmAudio();
  const context = latest();
  t.after(() => { stopAlarmSiren(); context.state = "closed"; });
  if (context.state !== "running") await primeAlarmAudio();
  assert.equal(startAlarmSiren("person"), true);
  assert.ok(context.oscillators.some((node) => node.stops.length === 0));
  const master = context.gains[0];
  setAlarmVolume(2);
  assert.equal(master.gain.value, 1);
  setAlarmVolume(0.05);
  assert.equal(master.gain.value, 0.2);
  setAlarmVolume(Number.NaN);
  assert.equal(master.gain.value, 0.9);
  assert.doesNotThrow(() => playAlarmTone("person"));
  assert.ok(context.oscillators.some((node) => node.stops.length > 0));
});

test("unsupported audio and notification APIs are reported without throwing", async (t) => {
  mockGlobals(t, { window: { setTimeout, clearTimeout } });
  stopAlarmSiren();
  assert.equal(alarmAudioState(), "unavailable");
  assert.equal(startAlarmSiren(), false);
  assert.equal(await primeAlarmAudio(), false);
  assert.equal(notificationSupport(), false);
  assert.equal(await requestNotificationPermission(), false);
  assert.equal(await showCameraNotification({ title: "Alarm", body: "Person" }), false);
  assert.doesNotThrow(() => closeCameraNotification("camera-alert-1"));
});

test("notification permission is requested once and never required for the in-app alarm", async (t) => {
  let asked = 0;
  class FakeNotification {
    static permission: NotificationPermission = "default";
    static requestPermission = async () => {
      asked += 1;
      FakeNotification.permission = "granted";
      return "granted" as const;
    };
    static instances: FakeNotification[] = [];
    onclick: (() => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    constructor(public title: string, public options: NotificationOptions) { FakeNotification.instances.push(this); }
    close() { this.closed = true; this.onclose?.(); }
  }
  mockGlobals(t, {
    window: { Notification: FakeNotification, setTimeout, clearTimeout, isSecureContext: false, focus: () => undefined },
    Notification: FakeNotification,
    navigator: {},
  });
  FakeNotification.permission = "default";
  assert.equal(notificationSupport(), true);
  assert.equal(await requestNotificationPermission(), true);
  assert.equal(asked, 1);
  assert.equal(await requestNotificationPermission(), true);
  assert.equal(asked, 1, "an already granted permission is not re-prompted");
  assert.equal(await showCameraNotification({ title: "Human on your field", body: "Human detected", tag: "camera-alert-9" }), true);
  assert.equal(FakeNotification.instances.length, 1);
  assert.equal(FakeNotification.instances[0].options.requireInteraction, true);
  closeCameraNotification("camera-alert-9");
  assert.equal(FakeNotification.instances[0].closed, true);
  FakeNotification.permission = "denied";
  assert.equal(await requestNotificationPermission(), false);
  assert.equal(await showCameraNotification({ title: "Alarm", body: "Animal" }), false);
});

test("Android's constructor restriction falls back to the service-worker notification path", async (t) => {
  const shown: Array<{ title: string; tag?: string }> = [];
  const closed: string[] = [];
  const serviceWorker = {
    register: async () => ({ scope: "/" }),
    ready: Promise.resolve({
      showNotification: async (title: string, options: NotificationOptions) => { shown.push({ title, tag: options.tag }); },
    }),
    getRegistration: async () => ({
      getNotifications: async ({ tag }: { tag: string }) => [{ close: () => closed.push(tag) }],
    }),
  };
  class RestrictedNotification {
    static permission: NotificationPermission = "granted";
    static requestPermission = async () => "granted" as const;
    constructor() { throw new TypeError("Illegal constructor"); }
  }
  mockGlobals(t, {
    window: { Notification: RestrictedNotification, setTimeout, clearTimeout, isSecureContext: true, focus: () => undefined },
    Notification: RestrictedNotification,
    navigator: { serviceWorker },
  });
  assert.equal(await showCameraNotification({ title: "Animal on your field", body: "Wild boar detected", tag: "camera-alert-3" }), true);
  assert.deepEqual(shown, [{ title: "Animal on your field", tag: "camera-alert-3" }]);
  closeCameraNotification("camera-alert-3");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(closed, ["camera-alert-3"]);
});
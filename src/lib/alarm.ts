/** Browser alarms. A requested siren is latched until an explicit stop. */

export type AlarmAudioState = "running" | "locked" | "unavailable";

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;
let alarmOutput: GainNode | null = null;
let requestedCategory: "person" | "animal" | null = null;
let audioUnavailable = false;
let volume = 0.9;
const audioListeners = new Set<() => void>();

function emitAudioState(): void {
  audioListeners.forEach((listener) => listener());
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!ctor) return null;
  if (!audioContext || audioContext.state === "closed") {
    try {
      audioContext = new ctor();
      audioUnavailable = false;
      alarmOutput = null;
      siren = null;
      const context = audioContext;
      context.addEventListener("statechange", () => {
        if (context !== audioContext) return;
        if (context.state === "running" && requestedCategory) startAlarmSiren(requestedCategory);
        emitAudioState();
      });
      emitAudioState();
    } catch {
      return null;
    }
  }
  return audioContext;
}

/**
 * Shared master chain. The limiter bounds peaks; device volume still controls
 * physical loudness, and software cannot override mute or autoplay policies.
 */
function getAlarmOutput(context: AudioContext): GainNode {
  if (alarmOutput) return alarmOutput;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = context.createGain();
  master.gain.value = volume;
  master.connect(limiter).connect(context.destination);
  alarmOutput = master;
  return master;
}

export function alarmAudioState(): AlarmAudioState {
  if (typeof window === "undefined") return "unavailable";
  if (!window.AudioContext && !(window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) {
    return "unavailable";
  }
  if (audioUnavailable) return "unavailable";
  if (!audioContext) return "locked";
  return audioContext.state === "running" ? "running" : "locked";
}

export function subscribeAlarmAudio(listener: () => void): () => void {
  audioListeners.add(listener);
  return () => { audioListeners.delete(listener); };
}

/** 20–100%; muting is a separate, explicit control. */
export function setAlarmVolume(value: number): void {
  volume = Number.isFinite(value) ? Math.min(1, Math.max(0.2, value)) : 0.9;
  if (audioContext && alarmOutput) {
    alarmOutput.gain.setTargetAtTime(volume, audioContext.currentTime, 0.025);
  }
}

/** Call from a click/tap so later alarm tones are allowed by autoplay rules. */
export async function primeAlarmAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  try {
    audioUnavailable = false;
    if (context.state !== "running") await context.resume();
    if (context.state === "running" && requestedCategory) startAlarmSiren(requestedCategory);
    emitAudioState();
    return context.state === "running" && !audioUnavailable;
  } catch {
    return false;
  }
}

/**
 * Two rising beeps for a human, a lower double-beep for an animal. Used as the
 * audible confirmation when the operator arms the siren.
 */
export function playAlarmTone(category: "person" | "animal" = "animal"): void {
  const context = getAudioContext();
  if (!context) return;

  void context.resume().catch(() => undefined);

  const output = getAlarmOutput(context);
  const now = context.currentTime;
  const base = category === "person" ? 980 : 680;
  const pattern = category === "person" ? [0, 0.22, 0.44] : [0, 0.3];

  pattern.forEach((offset, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + offset;
    const duration = category === "person" ? 0.16 : 0.2;

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(
      index % 2 === 0 ? base : base * 1.28,
      start,
    );
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain).connect(output);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  });
}

type SirenHandle = {
  context: AudioContext;
  category: "person" | "animal";
  gain: GainNode;
  nodes: OscillatorNode[];
  modulation: GainNode[];
};

let siren: SirenHandle | null = null;

/**
 * Starts a continuous, loud two-tone wailing siren. It keeps looping until
 * `stopAlarmSiren()` is called (the operator dismisses every alarm or mutes
 * the sound). Safe to call repeatedly: only one siren plays at a time.
 */
export function startAlarmSiren(category: "person" | "animal" = "person"): boolean {
  requestedCategory = category;
  const context = getAudioContext();
  if (!context) return false;

  if (context.state !== "running") {
    // Retain the request. A later click/resume starts this same alarm instead
    // of leaving "siren on" pointing at suspended, inaudible oscillators.
    void context.resume().then(() => {
      if (requestedCategory && context.state === "running") startAlarmSiren(requestedCategory);
      emitAudioState();
    }).catch(() => undefined);
    return false;
  }

  try {
    return buildAlarmSiren(context, category);
  } catch {
    // Audio failure must not crash the dashboard or hide its alarm popups.
    stopAlarmSiren();
    requestedCategory = category;
    audioUnavailable = true;
    emitAudioState();
    return false;
  }
}

function buildAlarmSiren(context: AudioContext, category: "person" | "animal"): boolean {
  const output = getAlarmOutput(context);
  const now = context.currentTime;
  const isPerson = category === "person";
  const base = isPerson ? 1_760 : 1_420;
  const sweep = isPerson ? 520 : 420;

  if (siren) {
    if (siren.category !== category) {
      siren.nodes[0].frequency.setTargetAtTime(base, now, 0.04);
      siren.nodes[1].frequency.setTargetAtTime(base * 0.72, now, 0.04);
      siren.modulation[0].gain.setTargetAtTime(sweep, now, 0.04);
      siren.modulation[1].gain.setTargetAtTime(sweep * 0.65, now, 0.04);
      siren.category = category;
    }
    return true;
  }

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  // Louder than a demo beep on purpose: this is an intrusion alarm. The
  // limiter in `getAlarmOutput` keeps it from clipping.
  gain.gain.exponentialRampToValueAtTime(0.58, now + 0.09);
  gain.connect(output);

  // Two sweeping carriers make a more prominent alarm than the old quiet
  // single-oscillator tone. No timer stops or restarts the wail.
  const carrier = context.createOscillator();
  carrier.type = "square";
  carrier.frequency.setValueAtTime(base, now);

  const overtone = context.createOscillator();
  overtone.type = "sawtooth";
  overtone.frequency.setValueAtTime(base * 0.72, now);

  // LFOs sweep both carriers so it wails like a real alarm.
  const lfo = context.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(2.1, now);
  const lfoGain = context.createGain();
  lfoGain.gain.setValueAtTime(sweep, now);
  lfo.connect(lfoGain).connect(carrier.frequency);

  const overtoneLfo = context.createOscillator();
  overtoneLfo.type = "triangle";
  overtoneLfo.frequency.setValueAtTime(2.1, now);
  const overtoneLfoGain = context.createGain();
  overtoneLfoGain.gain.setValueAtTime(sweep * 0.65, now);
  overtoneLfo.connect(overtoneLfoGain).connect(overtone.frequency);

  carrier.connect(gain);
  overtone.connect(gain);

  siren = {
    context,
    category,
    gain,
    nodes: [carrier, overtone, lfo, overtoneLfo],
    modulation: [lfoGain, overtoneLfoGain],
  };
  siren.nodes.forEach((node) => node.start(now));
  return true;
}

/** Fades out and tears down the looping siren, if one is playing. */
export function stopAlarmSiren(): void {
  requestedCategory = null;
  if (!siren) return;
  const { context, gain, nodes, modulation } = siren;
  siren = null;

  const disconnect = () => {
    [...nodes, ...modulation, gain].forEach((node) => {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    });
  };

  try {
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    nodes.forEach((node) => {
      try {
        node.stop(now + 0.25);
      } catch {
        // Already stopped.
      }
    });
    window.setTimeout(disconnect, 400);
  } catch {
    nodes.forEach((node) => {
      try { node.stop(); } catch { /* Already stopped. */ }
    });
    disconnect();
  }
}

export function sirenIsPlaying(): boolean {
  return siren !== null && siren.context.state === "running";
}

export function notificationSupport(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationSupport()) return false;
  if (Notification.permission === "granted") {
    void getNotificationWorker();
    return true;
  }
  if (Notification.permission === "denied") return false;
  try {
    const granted = (await Notification.requestPermission()) === "granted";
    if (granted) void getNotificationWorker();
    return granted;
  } catch {
    return false;
  }
}

let notificationWorker: Promise<ServiceWorkerRegistration | null> | null = null;
const nativeNotifications = new Map<string, Notification>();

function getNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !window.isSecureContext || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  if (!notificationWorker) {
    notificationWorker = (async () => {
      let timer = 0;
      try {
        await navigator.serviceWorker.register("/alarm-notifications-sw.js", { updateViaCache: "none" });
        return await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((resolve) => { timer = window.setTimeout(() => resolve(null), 10_000); }),
        ]);
      } catch {
        return null;
      } finally {
        window.clearTimeout(timer);
      }
    })();
  }
  return notificationWorker;
}

/** Native popup where supported; the in-app popup never depends on permission. */
export async function showCameraNotification(input: {
  title: string;
  body: string;
  tag?: string;
}): Promise<boolean> {
  if (!notificationSupport() || Notification.permission !== "granted") return false;
  const options: NotificationOptions = {
    body: input.body,
    tag: input.tag,
    requireInteraction: true,
    silent: false,
    data: { url: "/watch" },
  };
  try {
    const notification = new Notification(input.title, options);
    if (input.tag) nativeNotifications.set(input.tag, notification);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    notification.onclose = () => {
      if (input.tag && nativeNotifications.get(input.tag) === notification) nativeNotifications.delete(input.tag);
    };
    return true;
  } catch {
    // Android Chrome requires the service-worker variant. This is NOT Web
    // Push: new alerts still require an open, connected app tab.
    const registration = await getNotificationWorker();
    if (!registration) return false;
    try {
      await registration.showNotification(input.title, options);
      return true;
    } catch {
      return false;
    }
  }
}

export function closeCameraNotification(tag: string): void {
  nativeNotifications.get(tag)?.close();
  nativeNotifications.delete(tag);
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      const notifications = await registration?.getNotifications({ tag });
      notifications?.forEach((notification) => notification.close());
    }).catch(() => undefined);
  }
}

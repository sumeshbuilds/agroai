/**
 * Tiny browser alarm helpers for the camera dashboard.
 * Audio + notifications are best-effort: browsers only allow them after a
 * user gesture, so the UI exposes an explicit "Arm sound" toggle.
 */

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!ctor) return null;
  if (!audioContext) audioContext = new ctor();
  return audioContext;
}

/** Call from a click/tap so later alarm tones are allowed by autoplay rules. */
export async function primeAlarmAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
}

/**
 * Two rising beeps for a human, a lower double-beep for an animal.
 * Short and quiet enough to demo in a room without being painful.
 */
export function playAlarmTone(category: "person" | "animal" = "animal"): void {
  const context = getAudioContext();
  if (!context) return;

  void context.resume().catch(() => undefined);

  const now = context.currentTime;
  const base = category === "person" ? 880 : 620;
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
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  });
}

export function notificationSupport(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationSupport()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function showCameraNotification(input: {
  title: string;
  body: string;
  tag?: string;
}): void {
  if (!notificationSupport() || Notification.permission !== "granted") return;
  try {
    new Notification(input.title, {
      body: input.body,
      tag: input.tag,
    });
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

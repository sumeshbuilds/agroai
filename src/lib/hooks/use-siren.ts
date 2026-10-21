"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Two-tone Web Audio siren used by the intrusion alert banner. A user gesture
 * (the map tap that caused the alert) is normally present, which lets the
 * browser start audio without being blocked.
 */
export function useSiren() {
  const contextRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    (durationMs = 6000) => {
      if (typeof window === "undefined") return;

      stop();

      const AudioCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioCtor) return;

      const context = contextRef.current ?? new AudioCtor();
      contextRef.current = context;

      if (context.state === "suspended") {
        void context.resume();
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(660, context.currentTime);

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.06);

      const seconds = durationMs / 1000;
      const cycle = 0.7;
      for (let t = 0; t < seconds; t += cycle) {
        oscillator.frequency.setValueAtTime(660, context.currentTime + t);
        oscillator.frequency.linearRampToValueAtTime(
          990,
          context.currentTime + t + cycle / 2,
        );
        oscillator.frequency.linearRampToValueAtTime(
          660,
          context.currentTime + t + cycle,
        );
      }

      oscillator.connect(gain).connect(context.destination);
      oscillator.start();

      const end = context.currentTime + seconds + 0.1;
      oscillator.stop(end);

      setIsPlaying(true);

      const timeout = window.setTimeout(() => setIsPlaying(false), durationMs);

      stopRef.current = () => {
        window.clearTimeout(timeout);
        try {
          oscillator.stop();
        } catch {
          // already stopped
        }
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // already disconnected
        }
      };
    },
    [stop],
  );

  useEffect(
    () => () => {
      stop();
      void contextRef.current?.close().catch(() => undefined);
      contextRef.current = null;
    },
    [stop],
  );

  return { play, stop, isPlaying };
}

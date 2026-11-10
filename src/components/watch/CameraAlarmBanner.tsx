"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BellRing, PawPrint, Radar, Settings2, Square, UserRound, Volume2, VolumeX, X } from "lucide-react";

import { useSessionFarmer } from "@/components/auth/session";
import { ApiError, api } from "@/lib/api-client";
import {
  alarmAudioState, closeCameraNotification, notificationSupport,
  primeAlarmAudio, requestNotificationPermission, setAlarmVolume,
  showCameraNotification, startAlarmSiren, stopAlarmSiren, subscribeAlarmAudio,
} from "@/lib/alarm";
import { CameraAlarmInbox } from "@/lib/camera-alarm-inbox";
import type { CameraAlertDTO } from "@/lib/camera";
import { formatRelative } from "@/lib/format";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { useI18n } from "@/lib/i18n";

const LEGACY_ARMED_KEY = "agroai.camera.alarm.armed";
const NOTIFY_WINDOW_MS = 5 * 60 * 1_000;
const permissionSnapshot = () => notificationSupport() ? Notification.permission : "unsupported" as const;

/** One manager in the dashboard layout, never one per page. */
export function CameraAlarmBanner({ intervalMs = 3_000 }: { intervalMs?: number }) {
  const farmer = useSessionFarmer();
  return farmer ? <FarmerCameraAlarms key={farmer.id} farmerId={farmer.id} intervalMs={intervalMs} /> : null;
}

function FarmerCameraAlarms({ farmerId, intervalMs }: { farmerId: number; intervalMs: number }) {
  const { t } = useI18n();
  const mounted = useClientValue(() => true, false);
  const armedKey = `${LEGACY_ARMED_KEY}.${farmerId}`;
  const volumeKey = `agroai.camera.alarm.volume.${farmerId}`;
  const inboxKey = `agroai.camera.alarm.inbox.${farmerId}`;
  const storedArmed = useClientValue(() => {
    try { return (localStorage.getItem(armedKey) ?? localStorage.getItem(LEGACY_ARMED_KEY)) !== "0"; }
    catch { return true; }
  }, true);
  const storedVolume = useClientValue(() => {
    try {
      const value = Number(localStorage.getItem(volumeKey) ?? 90);
      return Number.isFinite(value) ? Math.max(20, Math.min(100, value)) : 90;
    } catch { return 90; }
  }, 90);
  const [armedOverride, setArmedOverride] = useState<boolean | null>(null);
  const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
  const armed = armedOverride ?? storedArmed;
  const volume = volumeOverride ?? storedVolume;
  const audioState = useSyncExternalStore(subscribeAlarmAudio, alarmAudioState, () => "unavailable");
  const currentPermission = useClientValue(permissionSnapshot, "unsupported");
  const [permissionOverride, setPermissionOverride] = useState<ReturnType<typeof permissionSnapshot> | null>(null);
  const permission = permissionOverride ?? currentPermission;
  const [inbox] = useState(() => new CameraAlarmInbox());
  const state = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot, inbox.getServerSnapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testActive, setTestActive] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [ackError, setAckError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const activeRef = useRef(false);
  const armedRef = useRef(armed);
  const controllerRef = useRef<AbortController | null>(null);
  const ackControllerRef = useRef<AbortController | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const popupScrollRef = useRef<HTMLDivElement | null>(null);
  const latestVisibleIdRef = useRef(0);
  const epochRef = useRef(0);
  const savingRef = useRef(false);
  const seenRef = useRef(new Set<number>());

  useEffect(() => { armedRef.current = armed; }, [armed]);
  useEffect(() => { setAlarmVolume(volume / 100); }, [volume]);
  useEffect(() => {
    const latest = state.alerts[0]?.id ?? 0;
    if (latest > latestVisibleIdRef.current && popupScrollRef.current) popupScrollRef.current.scrollTop = 0;
    latestVisibleIdRef.current = latest;
  }, [state.alerts]);
  useEffect(() => {
    if (settingsOpen && popupScrollRef.current) popupScrollRef.current.scrollTop = popupScrollRef.current.scrollHeight;
  }, [settingsOpen]);

  useEffect(() => {
    activeRef.current = true;
    try { inbox.hydrate(localStorage.getItem(inboxKey)); } catch { /* Fresh polling still works. */ }
    // Restored alarms keep ringing, but must not re-fire OS notifications.
    inbox.getSnapshot().alerts.forEach((alert) => seenRef.current.add(alert.id));
    const unsubscribe = inbox.subscribe(() => {
      try { localStorage.setItem(inboxKey, inbox.serialize()); }
      catch { if (activeRef.current) setStorageError(true); }
    });
    return () => {
      activeRef.current = false;
      controllerRef.current?.abort();
      ackControllerRef.current?.abort();
      unsubscribe();
      stopAlarmSiren();
    };
  }, [inbox, inboxKey]);

  // Unlock silently on a gesture anywhere in the shell. Suspensions remain
  // visible in the UI; neither a saved preference nor permission proves audio
  // is actually running after a reload.
  useEffect(() => {
    const unlock = () => { if (armedRef.current) void primeAlarmAudio(); };
    const onVisible = () => {
      setPermissionOverride(permissionSnapshot());
      if (document.visibilityState === "visible") unlock();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    let permissionStatus: PermissionStatus | undefined;
    const onPermission = () => setPermissionOverride(permissionSnapshot());
    void navigator.permissions?.query({ name: "notifications" }).then((status) => {
      if (!activeRef.current) return;
      permissionStatus = status;
      status.addEventListener("change", onPermission);
    }).catch(() => undefined);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      permissionStatus?.removeEventListener("change", onPermission);
    };
  }, []);

  const notify = useCallback((items: CameraAlertDTO[]) => {
    for (const alert of items) {
      if (seenRef.current.has(alert.id)) continue;
      seenRef.current.add(alert.id);
      if (inbox.isDismissed(alert.id)) continue;
      const age = alert.createdAt ? Date.now() - new Date(alert.createdAt).getTime() : 0;
      if (!Number.isFinite(age) || age > NOTIFY_WINDOW_MS) continue;
      // Notification permission is independent of muting the siren. Do not
      // truncate a batch: every new alarm gets its own native popup attempt.
      void showCameraNotification({
        title: alert.category === "person" ? t("Human on your field") : t("Animal on your field"),
        body: t(alert.message), tag: `camera-alert-${alert.id}`,
      }).then(() => {
        if (!activeRef.current || inbox.isDismissed(alert.id)) closeCameraNotification(`camera-alert-${alert.id}`);
      });
    }
  }, [inbox, t]);

  const load = useCallback(async (older = false) => {
    if (controllerRef.current || !activeRef.current) return;
    const beforeId = older ? inbox.getSnapshot().nextCursor : undefined;
    if (older && !beforeId) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const epoch = epochRef.current;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    if (older) setLoadingOlder(true);
    const accept = () => activeRef.current && !controller.signal.aborted && epoch === epochRef.current;
    try {
      const page = await api.listCameraAlerts({ limit: 50, beforeId: beforeId ?? undefined, ...inbox.getQueryScope(), signal: controller.signal });
      if (!accept()) return;
      inbox.ingest(page, beforeId ?? undefined);
      setSignedOut(false);
      setPollError(false);
      notify(page.alerts);

      return true;
    } catch (cause) {
      if (!activeRef.current || epoch !== epochRef.current) return;
      if (cause instanceof ApiError && cause.status === 401) setSignedOut(true);
      else setPollError(true); // Never clear latched alarms on a network failure.
    } finally {
      window.clearTimeout(timeout);
      if (controllerRef.current === controller) controllerRef.current = null;
      if (activeRef.current && older) setLoadingOlder(false);
    }
  }, [inbox, notify]);

  useEffect(() => {
    if (signedOut) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      const freshLoaded = await load();
      // Catch up one older page per cycle, then return to fresh polling. An
      // unbounded backlog-draining loop must not monopolise the alarm manager.
      if (!stopped && freshLoaded) await load(true);
      if (!stopped) timer = window.setTimeout(() => void tick(), document.visibilityState === "visible" ? intervalMs : 8_000);
    };
    timer = window.setTimeout(() => void tick(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !controllerRef.current) {
        window.clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      controllerRef.current?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, load, signedOut]);

  const saveDismissals = useCallback(async () => {
    if (savingRef.current || !activeRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setAckError(false);
    const save = async (action: (signal: AbortSignal) => Promise<unknown>) => {
      const controller = new AbortController();
      ackControllerRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try { await action(controller.signal); }
      finally {
        window.clearTimeout(timeout);
        if (ackControllerRef.current === controller) ackControllerRef.current = null;
      }
      if (!activeRef.current || controller.signal.aborted) throw new Error("Acknowledgement cancelled.");
    };
    try {
      while (activeRef.current) {
        const pending = inbox.getSnapshot().pending;
        if (!pending.throughId && pending.ids.length === 0) break;
        if (pending.throughId) {
          await save((signal) => api.acknowledgeAllCameraAlerts(pending.throughId, { signal }));
          inbox.savedThrough(pending.throughId);
        }
        for (const id of pending.ids) {
          if (!activeRef.current) break;
          try { await save((signal) => api.acknowledgeCameraAlert(id, { signal })); }
          catch (cause) { if (!(cause instanceof ApiError && cause.status === 404)) throw cause; }
          inbox.savedId(id);
        }
      }
    } catch {
      if (activeRef.current) setAckError(true);
    } finally {
      savingRef.current = false;
      if (activeRef.current) setSaving(false);
    }
  }, [inbox]);

  useEffect(() => {
    const timer = window.setTimeout(() => void saveDismissals(), 0);
    const retry = () => { void saveDismissals(); void load(); };
    window.addEventListener("online", retry);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", retry); };
  }, [load, saveDismissals]);

  useEffect(() => {
    if (!ackError || saving) return;
    const timer = window.setTimeout(() => void saveDismissals(), 15_000);
    return () => window.clearTimeout(timer);
  }, [ackError, saving, saveDismissals]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        settingsButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const sirenCategory = state.alerts.some((alert) => alert.category === "person") ? "person" : "animal";
  useEffect(() => {
    if (testActive || (armed && state.alerts.length > 0)) startAlarmSiren(testActive ? "person" : sirenCategory);
    else stopAlarmSiren();
  }, [armed, sirenCategory, state.alerts.length, testActive]);

  const fencePoll = () => { epochRef.current += 1; controllerRef.current?.abort(); };
  const dismiss = (id: number) => {
    fencePoll();
    inbox.dismiss(id);
    closeCameraNotification(`camera-alert-${id}`);
    if (inbox.getSnapshot().alerts.length === 0 && !testActive) stopAlarmSiren();
    void saveDismissals();
  };
  const stopAll = () => {
    stopAlarmSiren();
    setTestActive(false);
    fencePoll();
    const throughId = inbox.getSnapshot().latestId;
    inbox.dismissThrough(throughId);
    seenRef.current.forEach((id) => { if (id <= throughId) closeCameraNotification(`camera-alert-${id}`); });
    void saveDismissals();
  };
  const toggleArmed = async () => {
    const next = !armed;
    armedRef.current = next;
    setArmedOverride(next);
    if (next) void primeAlarmAudio();
    else { stopAlarmSiren(); setTestActive(false); }
    try { localStorage.setItem(armedKey, next ? "1" : "0"); } catch { setStorageError(true); }
  };
  const enableNotifications = async () => {
    await requestNotificationPermission();
    if (activeRef.current) setPermissionOverride(permissionSnapshot());
  };
  const toggleTest = () => {
    if (testActive) { stopAlarmSiren(); setTestActive(false); }
    else { void primeAlarmAudio(); setTestActive(true); }
  };

  if (!mounted) return null;
  const active = state.alerts.length > 0;
  const soundLabel = !armed ? "Alarm sound muted" : audioState === "running" ? "Alarm sound ready" : audioState === "unavailable" ? "Sound unavailable" : "Tap to enable sound";

  return createPortal(
    <section aria-label={t("Field alarms")} className="pointer-events-none fixed inset-x-4 bottom-[calc(7.25rem+env(safe-area-inset-bottom))] z-[1100] flex max-h-[calc(100dvh-10rem-env(safe-area-inset-bottom))] flex-col items-end gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-96 md:max-h-[calc(100dvh-3rem)]">
      <div ref={popupScrollRef} style={{ overflowAnchor: "none" }} className="min-h-0 w-full space-y-2 overflow-y-auto overscroll-contain p-1">
      {active || state.nextCursor ? (
        <div role="log" aria-live="assertive" aria-relevant="additions text" aria-label={t("Camera alarm popups")} className="pointer-events-auto flex w-full flex-col gap-2">
          {state.alerts.map((alert) => (
            <article key={alert.id} data-alarm-id={alert.id} className="alarm-toast shrink-0 rounded-2xl bg-[var(--card)] p-3 shadow-[var(--shadow-floating)]">
              <div className="flex items-start gap-2">
                <span aria-hidden className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-700">{alert.category === "person" ? <UserRound className="h-5 w-5" /> : <PawPrint className="h-5 w-5" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-base font-semibold leading-snug text-danger-700">{t(alert.message)}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">{alert.confidence !== null ? `${Math.round(alert.confidence * 100)}% · ` : ""}{t(formatRelative(alert.createdAt))}</p>
                  {alert.reviewStatus === "unconfirmed" ? <p className="mt-1 text-sm font-semibold text-warn-700">{t("Needs human review")}</p> : alert.verified ? <p className="mt-1 text-sm text-leaf-700">{t("AI verified")}</p> : null}
                </div>
                <button type="button" onClick={() => dismiss(alert.id)} aria-label={t("Dismiss alarm: {message}", { message: t(alert.message) })} className="icon-btn shrink-0 border-transparent bg-transparent"><X aria-hidden className="h-4 w-4" /></button>
              </div>
            </article>
          ))}
          {state.nextCursor ? <button type="button" onClick={() => void load(true)} disabled={loadingOlder} className="btn btn-secondary shrink-0">{loadingOlder ? t("Loading older alarms…") : t("Load older alarms")}</button> : null}
        </div>
      ) : null}
      {settingsOpen ? (
        <div id="camera-alarm-settings" className="pointer-events-auto w-full rounded-2xl bg-[var(--card)] p-4 shadow-[var(--shadow-floating)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">{t("Alarm settings")}</h2>
            <button type="button" onClick={() => { setSettingsOpen(false); settingsButtonRef.current?.focus(); }} aria-label={t("Close alarm settings")} className="icon-btn"><X aria-hidden className="h-4 w-4" /></button>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t("Keep this app open and connected. Device volume, mute and browser restrictions still apply.")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void toggleArmed()} aria-pressed={armed} className="btn btn-secondary">
              {armed ? <VolumeX aria-hidden className="h-4 w-4" /> : <Volume2 aria-hidden className="h-4 w-4" />}
              {armed ? t("Mute siren") : t("Enable siren")}
            </button>
            <button type="button" onClick={() => void primeAlarmAudio()} disabled={audioState === "unavailable"} className="btn btn-secondary">{t("Unlock sound")}</button>
          </div>
          <label htmlFor="camera-alarm-volume" className="mt-4 flex justify-between gap-2 text-sm font-semibold">{t("Siren volume")}<span className="tabular-nums">{volume}%</span></label>
          <input id="camera-alarm-volume" type="range" min={20} max={100} step={5} value={volume} onChange={(event) => {
            const value = Number(event.target.value);
            setVolumeOverride(value);
            try { localStorage.setItem(volumeKey, String(value)); } catch { setStorageError(true); }
          }} className="mt-1 min-h-11 w-full accent-danger-600" />
          <button type="button" onClick={toggleTest} disabled={audioState === "unavailable"} className={`btn w-full ${testActive ? "btn-danger" : "btn-secondary"}`}>
            {testActive ? <Square aria-hidden className="h-4 w-4 fill-current" /> : <Volume2 aria-hidden className="h-4 w-4" />}
            {testActive ? t("Stop test") : t("Test continuous siren")}
          </button>
          <p className="mt-2 text-sm text-[var(--muted)]">{t("Sound test only — no camera alert is created. It continues until you stop it.")}</p>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <button type="button" onClick={() => void enableNotifications()} disabled={permission === "unsupported" || permission === "denied" || permission === "granted"} className="btn btn-secondary w-full">
              <BellRing aria-hidden className="h-4 w-4" />
              {t(permission === "granted" ? "Browser popups enabled" : permission === "denied" ? "Browser notifications blocked" : permission === "unsupported" ? "Browser notifications unavailable" : "Enable browser popups")}
            </button>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{t(permission === "denied" ? "Allow notifications in your browser settings. In-app alarm popups still work." : "In-app popups always appear, even without notification permission.")}</p>
          </div>
          {storageError ? <p role="status" className="mt-3 text-sm text-danger-700">{t("This browser could not save alarm settings. Keep the page open; check storage permissions before reloading.")}</p> : null}
        </div>
      ) : null}
      {testActive ? <p role="status" className="pointer-events-auto w-full rounded-xl bg-warn-100 px-4 py-3 text-sm font-semibold text-warn-700">{t("Siren test running — not a detection")}</p> : null}
      {ackError ? <div role="alert" className="pointer-events-auto w-full rounded-xl bg-warn-100 p-3 text-sm text-warn-700"><p>{t("Dismissal was not saved. Stopped alarms stay muted here; retry to save on other devices.")}</p><button type="button" onClick={() => void saveDismissals()} disabled={saving} className="btn btn-secondary mt-2">{saving ? t("Saving…") : t("Retry saving dismissal")}</button></div> : null}
      {pollError ? <p role="status" className="pointer-events-auto w-full rounded-xl bg-warn-100 px-3 py-2 text-sm text-warn-700">{t("Alarm connection lost. Existing alarms keep ringing; new alarms need a connection.")}</p> : null}
      {signedOut ? <div role="alert" className="pointer-events-auto w-full rounded-xl bg-warn-100 p-3 text-sm text-warn-700"><p>{t("Sign in again to receive new alarms. Existing alarms stay active until you stop them.")}</p><Link href="/login" className="btn btn-secondary mt-2">{t("Sign in")}</Link></div> : null}
      </div>
      {active && armed && audioState !== "running" ? <button type="button" onClick={() => void primeAlarmAudio()} disabled={audioState === "unavailable"} className="btn btn-danger pointer-events-auto w-full shrink-0">{t(audioState === "unavailable" ? "Sound unavailable — use another browser" : "Sound is blocked — tap to start the loud siren")}</button> : null}
      <div className="pointer-events-auto flex w-full shrink-0 flex-wrap items-center gap-2 rounded-2xl bg-[var(--card)] p-2 shadow-[var(--shadow-floating)]">
        {active || testActive ? <button type="button" onClick={stopAll} className="btn btn-danger flex-1" title={t("Stop the siren and acknowledge this alarm snapshot")}><Square aria-hidden className="h-4 w-4 fill-current" />{t("Stop siren")}</button> : null}
        <button ref={settingsButtonRef} type="button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} aria-controls={settingsOpen ? "camera-alarm-settings" : undefined} className="btn btn-secondary flex-1">
          <Settings2 aria-hidden className="h-4 w-4" />{t(active ? "Alarm settings" : soundLabel)}
          {active ? <span className="tabular-nums">({state.unread})</span> : null}
        </button>
        {active ? <Link href="/watch" aria-label={t("Open live watch")} className="icon-btn"><Radar aria-hidden className="h-4 w-4" /></Link> : null}
      </div>
    </section>, document.body,
  );
}

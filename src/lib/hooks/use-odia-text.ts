"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";

/**
 * Runtime Odia translations for AI-written text.
 *
 * The static UI goes through the dictionary. Sentences that only exist after a
 * model or a rule engine wrote them (plant-health advice, checklist details)
 * are translated here, in one batched request, and cached in localStorage so
 * switching language or reopening the page costs nothing.
 */

const CACHE_KEY = "agroai:odia-cache:v1";
const CACHE_LIMIT = 600;

type Cache = Record<string, string>;

function readCache(): Cache {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache) {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(cache);
    const trimmed =
      keys.length > CACHE_LIMIT
        ? Object.fromEntries(keys.slice(keys.length - CACHE_LIMIT).map((key) => [key, cache[key]]))
        : cache;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or blocked: translation still works for this session.
  }
}

/** Skips anything that is already Odia, numeric or very short. */
function needsTranslation(text: string): boolean {
  if (text.trim().length < 4) return false;
  if (/[\u0B00-\u0B7F]/.test(text)) return false;
  return /[A-Za-z]/.test(text);
}

export function useOdiaText(texts: Array<string | null | undefined>): (text: string) => string {
  const { lang } = useI18n();
  const [cache, setCache] = useState<Cache>({});
  const requested = useRef(new Set<string>());

  const wanted = useMemo(() => {
    if (lang !== "or") return [] as string[];
    const unique = new Set<string>();
    for (const text of texts) {
      if (!text) continue;
      const clean = text.trim();
      if (clean && needsTranslation(clean)) unique.add(clean);
    }
    return [...unique];
  }, [lang, texts]);

  // Hydrate from localStorage, then fetch anything still missing.
  useEffect(() => {
    if (lang !== "or" || wanted.length === 0) return;

    const timer = window.setTimeout(() => {
      const stored = readCache();
      const pending = wanted.filter(
        (text) => !stored[text] && !requested.current.has(text),
      );
      if (pending.length === 0) {
        setCache(stored);
        return;
      }
      pending.forEach((text) => requested.current.add(text));

      void fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texts: pending }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { translations?: Record<string, string> } | null) => {
          const fresh = payload?.translations ?? {};
          const merged = { ...stored, ...fresh };
          setCache(merged);
          writeCache(merged);
        })
        .catch(() => {
          // Keep the English text on screen; nothing breaks.
        });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [lang, wanted]);

  const say = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (lang !== "or" || !clean || !needsTranslation(clean)) return text;
      return cache[clean] ?? text;
    },
    [cache, lang],
  );

  return say;
}

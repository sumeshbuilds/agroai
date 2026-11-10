"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_LANG,
  LANG_COOKIE,
  htmlLang,
  translate,
  type Lang,
} from "./core";
import type { Vars } from "./dictionary";

interface I18nContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (text: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLang = DEFAULT_LANG,
  children,
}: {
  initialLang?: Lang;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    if (typeof document === "undefined") return;
    document.documentElement.lang = htmlLang(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const t = useCallback(
    (text: string, vars?: Vars) => translate(lang, text, vars),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return context;
}

import { ODIA, PATTERNS, type Vars } from "./dictionary";

export type Lang = "en" | "or";

export const LANG_COOKIE = "agroai_lang";
export const DEFAULT_LANG: Lang = "en";

export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  or: "ଓଡ଼ିଆ",
};

/** Accepts the cookie value and a few friendly aliases. */
export function normalizeLang(value: string | null | undefined): Lang {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "or" ||
    normalized === "odia" ||
    normalized === "oriya" ||
    normalized === "ଓଡ଼ିଆ"
    ? "or"
    : "en";
}

/** HTML `lang` attribute for the root element. */
export function htmlLang(lang: Lang): string {
  return lang === "or" ? "or" : "en";
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

/** Exact dictionary lookup only — used by pattern rules for fragments. */
function exact(lang: Lang, text: string, vars?: Vars): string {
  const value = lang === "or" ? (ODIA[text] ?? text) : text;
  return interpolate(value, vars);
}

/**
 * Translates a UI string. Falls back to the English source when a key is
 * missing, then tries the runtime patterns before giving up.
 */
export function translate(lang: Lang, text: string, vars?: Vars): string {
  if (!text) return text;

  if (lang === "en") return interpolate(text, vars);

  const direct = ODIA[text];
  if (direct !== undefined) return interpolate(direct, vars);

  for (const rule of PATTERNS) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    return rule.render(match, (fragment, fragmentVars) =>
      translate(lang, fragment, fragmentVars),
    );
  }

  return interpolate(text, vars);
}

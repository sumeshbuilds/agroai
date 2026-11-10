"use client";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * Compact EN / ଓଡ଼ିଆ switch. `variant="rail"` styles it for the dark desktop
 * navigation; the default suits the light mobile header and page toolbars.
 */
export function LanguageToggle({
  variant = "light",
  className,
}: {
  variant?: "light" | "rail";
  className?: string;
}) {
  const { lang, setLang, t } = useI18n();
  const rail = variant === "rail";

  return (
    <div
      role="group"
      aria-label={t("Switch language")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full p-0.5",
        rail
          ? "flex-col bg-white/10"
          : "border border-[var(--color-line-strong)] bg-[var(--card)]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        aria-label={t("English")}
        title={t("English")}
        className={cn(
          "rounded-full font-semibold transition-colors",
          rail ? "px-1.5 py-1 text-[0.6rem]" : "px-2.5 py-1 text-[0.6875rem]",
          lang === "en"
            ? rail
              ? "bg-[var(--color-leaf-100)] text-[var(--color-rail)]"
              : "bg-[var(--color-rail)] text-white"
            : rail
              ? "text-white/60 hover:text-white"
              : "text-[var(--color-ink-soft)] hover:text-[var(--foreground)]",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("or")}
        aria-pressed={lang === "or"}
        aria-label={t("Odia")}
        title={t("Odia")}
        className={cn(
          "rounded-full font-semibold transition-colors",
          rail ? "px-1.5 py-1 text-[0.6rem]" : "px-2.5 py-1 text-[0.6875rem]",
          lang === "or"
            ? rail
              ? "bg-[var(--color-leaf-100)] text-[var(--color-rail)]"
              : "bg-[var(--color-rail)] text-white"
            : rail
              ? "text-white/60 hover:text-white"
              : "text-[var(--color-ink-soft)] hover:text-[var(--foreground)]",
        )}
      >
        ଓଡ଼ିଆ
      </button>
    </div>
  );
}

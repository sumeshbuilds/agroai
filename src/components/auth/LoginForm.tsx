"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, TriangleAlert, UserRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !pin.trim()) {
      setError("Enter both your name and PIN.");
      return;
    }

    setLoading(true);
    try {
      await api.login({ name, pin });
      router.replace("/");
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Could not sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
      {error ? (
        <Callout tone="danger" icon={<TriangleAlert className="h-4 w-4" />}>
          {t(error)}
        </Callout>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          {t("Your name")}
        </span>
        <div className="relative">
          <UserRound
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-soft"
          />
          <input
            className="input pl-11"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("e.g. Ramesh Patel")}
            autoComplete="username"
            autoFocus
            maxLength={60}
          />
        </div>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">
          {t("PIN")}
        </span>
        <div className="relative">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-soft"
          />
          <input
            className="input pl-11 pr-12"
            type={showPin ? "text" : "password"}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="name1234"
            autoComplete="current-password"
            maxLength={32}
          />
          <button
            type="button"
            onClick={() => setShowPin((current) => !current)}
            className="icon-btn absolute right-1 top-1/2 -translate-y-1/2 border-transparent bg-transparent text-ink-soft"
            aria-label={showPin ? t("Hide PIN") : t("Show PIN")}
            aria-pressed={showPin}
          >
            {showPin ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </button>
        </div>
      </label>

      <Button type="submit" loading={loading} className="min-h-12 w-full">
        {t("Open my farm")}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Button>

      <p className="muted flex flex-col items-center justify-center text-center text-sm font-medium sm:flex-row sm:gap-1">
        <span>{t("New here?")}</span>
        <Link href="/onboarding" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap font-semibold text-accent-700 underline decoration-accent-300 underline-offset-4 hover:decoration-accent-700">
          {t("Create your farm account")}
        </Link>
      </p>
    </form>
  );
}

"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, KeyRound, TriangleAlert, UserRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ApiError, api } from "@/lib/api-client";

export function LoginForm() {
  const router = useRouter();
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <Callout tone="danger" icon={<TriangleAlert className="h-4 w-4" />}>
          {error}
        </Callout>
      ) : null}

      <label className="block">
        <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
          Your name
        </span>
        <div className="relative mt-1.5">
          <UserRound
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            className="input pl-10"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ramesh Patel"
            autoComplete="username"
            autoFocus
            maxLength={60}
          />
        </div>
      </label>

      <label className="block">
        <span className="muted text-xs font-semibold uppercase tracking-[0.08em]">
          PIN
        </span>
        <div className="relative mt-1.5">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            className="input pl-10 pr-12"
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
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/10"
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
          >
            {showPin ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </button>
        </div>
      </label>

      <Button type="submit" loading={loading} className="w-full">
        Sign in to my farm
        <ArrowRight aria-hidden className="h-4 w-4" />
      </Button>

      <p className="muted text-center text-sm">
        New here?{" "}
        <Link href="/onboarding" className="font-semibold text-brand-700 underline dark:text-brand-400">
          Create your farm account
        </Link>
      </p>
    </form>
  );
}

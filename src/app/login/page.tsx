import type { Metadata } from "next";
import Link from "next/link";
import { CloudSun, Leaf, ShieldCheck, Sprout } from "lucide-react";

import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center px-4 py-8 sm:px-6">
      <div className="card grid w-full overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section className="relative hidden flex-col justify-between gap-10 bg-brand-800 p-8 text-white lg:flex">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 top-10 h-48 w-48 rounded-full bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-brand-500/20"
          />

          <Link href="/" className="relative flex items-center gap-2.5 font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
              <Leaf className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="text-2xl tracking-tight">
              Agro<span className="text-brand-200">AI</span>
            </span>
          </Link>

          <div className="relative space-y-5">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight">
              Your farm, your weather, your crop — in one place.
            </h1>
            <ul className="space-y-3.5 text-sm text-white/85">
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <CloudSun aria-hidden className="h-4 w-4" />
                </span>
                Live 7-day forecast for your exact field centre.
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Sprout aria-hidden className="h-4 w-4" />
                </span>
                Day-by-day crop guide built from your sowing date.
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <ShieldCheck aria-hidden className="h-4 w-4" />
                </span>
                Pest risk siren that reads the crop stage and weather.
              </li>
            </ul>
          </div>

          <p className="relative text-xs text-white/60">
            Sign in with the name and PIN you created during onboarding.
          </p>
        </section>

        <section className="p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white">
              <Leaf className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              Agro<span className="text-brand-700 dark:text-brand-400">AI</span>
            </span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="muted mt-1.5 text-sm">
            Sign in with your name and PIN to see your farm dashboard.
          </p>

          <div className="mt-6">
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}

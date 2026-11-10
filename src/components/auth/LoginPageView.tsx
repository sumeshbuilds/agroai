"use client";

import Link from "next/link";
import { Leaf, Radar, Satellite, Sprout } from "lucide-react";

import { LoginForm } from "@/components/auth/LoginForm";
import { useI18n } from "@/lib/i18n";

const HIGHLIGHTS = [
  {
    icon: Satellite,
    title: "Map and monitor your land",
    body: "Trace field boundaries on satellite imagery and track live phone cameras across the plot.",
  },
  {
    icon: Radar,
    title: "Watch for animals and people",
    body: "A spare phone becomes your field camera — on-device alerts the moment something moves.",
  },
  {
    icon: Sprout,
    title: "Care at the right moment",
    body: "Growth-stage guidance and hyper-local weather distilled into a short weekly plan.",
  },
];

export function LoginPageView() {
  const { t } = useI18n();

  return (
    <main className="auth-page p-4 sm:p-6 lg:p-8">
      <div className="auth-frame grid w-full overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Branding panel (desktop) */}
        <section className="auth-brand hidden flex-col justify-between p-10 lg:flex">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="brand-mark h-11 w-11">
                <Leaf className="h-5 w-5" strokeWidth={2.4} />
              </span>
              <span className="text-lg font-semibold tracking-tight">
                AgroAI
              </span>
            </Link>
            <h2 className="mt-12 text-[2rem] font-medium leading-[1.2]">
              {t("The field workstation for your farm.")}
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-leaf-100/85">
              {t(
                "One calm screen for boundaries, cameras, weather and crop care — built for real work in the field, on weak connections.",
              )}
            </p>
          </div>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-leaf-300">
                  <item.icon className="h-4 w-4" strokeWidth={2.2} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t(item.title)}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-leaf-100/85">
                    {t(item.body)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-10 border-t border-white/10 pt-5 text-xs leading-relaxed text-leaf-300">
            {t(
              "Field data stays yours · on-device camera detection · free-first infrastructure",
            )}
          </p>
        </section>

        {/* Form panel */}
        <section className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
          <div className="lg:hidden">
            <Link href="/" className="inline-flex min-h-11 items-center gap-2">
              <span className="brand-mark h-10 w-10">
                <Leaf className="h-4 w-4" strokeWidth={2.4} />
              </span>
              <span className="text-[1.05rem] font-semibold tracking-tight">
                AgroAI
              </span>
            </Link>
          </div>

          <div className="mt-8 lg:mt-0">
            <h1 className="text-2xl font-semibold leading-tight">
              {t("Sign in to your farm")}
            </h1>
            <p className="muted mt-3 text-sm leading-relaxed">
              {t(
                "Use the name and PIN you set when the workstation was first prepared.",
              )}
            </p>
          </div>

          <div className="auth-form mt-7">
            <LoginForm />
          </div>

          <p className="muted mt-7 border-t border-[var(--color-line)] pt-5 text-xs leading-relaxed">
            {t(
              "New to AgroAI? Choose “Create your farm account” to draw your first field and set a PIN.",
            )}
          </p>
        </section>
      </div>
    </main>
  );
}

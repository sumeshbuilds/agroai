import Link from "next/link";

import { AgroMark, AgroWordmark } from "@/components/brand/AgroMark";

/**
 * Shared public footer. Kept in one place so the homepage and the Odisha page
 * carry identical internal links — crawlers follow the same path from either
 * entry point.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-line)] bg-paper-warm">
      <div className="landing-shell py-10 sm:py-12">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.7fr_0.7fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <AgroMark className="h-10 w-10" />
              <AgroWordmark className="text-[1.35rem] text-forest-deep" />
            </Link>
            <p className="mt-3 max-w-xs text-[0.78rem] leading-relaxed text-[var(--color-ink-soft)]">
              The field workstation for small farms: land security, plant
              guidance and a camera made from a spare phone.
            </p>
            <p className="mt-3 text-[0.72rem] font-semibold text-forest-deep">
              Agricultural startup in Odisha ·{" "}
              <Link
                href="/odisha"
                className="underline decoration-leaf-400 underline-offset-4 hover:decoration-forest-deep"
              >
                Kalinga pilot
              </Link>
            </p>
          </div>

          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
              The app
            </p>
            <ul className="mt-3 space-y-2 text-[0.78rem] font-medium text-forest-deep">
              <li><Link href="/onboarding" className="hover:underline">Create account</Link></li>
              <li><Link href="/login" className="hover:underline">Sign in</Link></li>
              <li><Link href="/#inside" className="hover:underline">Inside AgroAI</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
              Security
            </p>
            <ul className="mt-3 space-y-2 text-[0.78rem] font-medium text-forest-deep">
              <li><Link href="/#land-security" className="hover:underline">Land security</Link></li>
              <li><Link href="/#plant-security" className="hover:underline">Plant security</Link></li>
              <li><Link href="/#how-it-works" className="hover:underline">How it works</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-soft)]">
              Built for
            </p>
            <ul className="mt-3 space-y-2 text-[0.78rem] font-medium text-forest-deep">
              <li>Weak connections</li>
              <li>Outdoor sunlight</li>
              <li>Odia + English</li>
              <li>
                <Link href="/odisha" className="hover:underline">
                  Odisha &amp; Kalinga
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-3 border-t border-[var(--color-line)] pt-5 text-[0.68rem] leading-relaxed text-[var(--color-ink-soft)] sm:flex-row sm:items-end sm:justify-between">
          <p>
            © 2026 AgroAI · Pilot build in Kalahandi, Odisha. Field data stays
            scoped to the signed-in farmer.
          </p>
          <p className="max-w-md sm:text-right">
            Guidance is advisory, not a field measurement. Confirm treatment and
            pesticide decisions locally before acting.
          </p>
        </div>
      </div>
    </footer>
  );
}

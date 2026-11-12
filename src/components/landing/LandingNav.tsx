import Link from "next/link";
import { ArrowRight, LayoutDashboard, LogIn } from "lucide-react";

import { AgroMark } from "./AgroMark";

const LINKS = [
  { href: "#land-security", label: "Land security" },
  { href: "#plant-security", label: "Plant security" },
  { href: "#inside", label: "Inside AgroAI" },
  { href: "#how-it-works", label: "How it works" },
];

export function LandingNav({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line)] bg-paper-warm">
      <div className="landing-shell flex h-[4.5rem] items-center justify-between gap-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5"
          aria-label="AgroAI home"
        >
          <AgroMark className="h-10 w-10" />
          <span className="text-[1.3rem] font-bold tracking-[-0.03em] text-forest-deep">
            AgroAI
          </span>
        </Link>

        <nav aria-label="Landing page" className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[0.82rem] font-semibold text-[var(--color-ink-soft)] transition-colors hover:text-forest-deep"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {signedIn ? (
            <Link
              href="/dashboard"
              className="hidden min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.82rem] font-semibold text-forest-deep transition-colors hover:bg-black/[0.04] sm:inline-flex"
            >
              <LayoutDashboard aria-hidden className="h-3.5 w-3.5" />
              Open my farm
            </Link>
          ) : (
            <Link
              href="/login"
              className="hidden min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.82rem] font-semibold text-forest-deep transition-colors hover:bg-black/[0.04] sm:inline-flex"
            >
              <LogIn aria-hidden className="h-3.5 w-3.5" />
              Sign in
            </Link>
          )}
          <Link
            href={signedIn ? "/dashboard" : "/onboarding"}
            className="landing-cta inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[0.82rem] font-bold transition-colors"
          >
            <span className="hidden sm:inline">
              {signedIn ? "Open my farm" : "Create your farm account"}
            </span>
            <span className="sm:hidden">{signedIn ? "My farm" : "Start free"}</span>
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

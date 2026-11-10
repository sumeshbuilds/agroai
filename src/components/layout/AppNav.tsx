"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Leaf,
  Map as MapIcon,
  Radar,
  Sprout,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { useSessionFarmer } from "@/components/auth/session";
import { LanguageToggle } from "@/components/layout/LanguageToggle";
import { useI18n } from "@/lib/i18n";

const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/map", label: "Field map", icon: MapIcon },
  { href: "/watch", label: "Watch", icon: Radar },
  { href: "/crops", label: "Crops", icon: Sprout },
];

/** Desktop: the dark icon rail pinned to the left edge of the workstation. */
export function AppRail() {
  const pathname = usePathname();
  const farmer = useSessionFarmer();
  const { t } = useI18n();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      aria-label={t("Primary")}
      className="rail flex h-full w-[5.25rem] shrink-0 flex-col items-center gap-2 py-4"
    >
      <Link
        href="/"
        aria-label={t("AgroAI home")}
        title="AgroAI"
        className="brand-mark mb-5 h-12 w-12"
      >
        <Leaf className="h-5 w-5" strokeWidth={2.4} />
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={t(label)}
              data-active={active}
              className="rail-btn rail-link"
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
              <span className="text-[0.625rem] font-medium leading-none">{t(label)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1">
        <LanguageToggle variant="rail" className="mb-2" />
        {farmer ? (
          <span
            className="mb-2 inline-flex h-10 w-10 items-center justify-center"
            title={t("Signed in as {name}", { name: farmer.name })}
            aria-label={t("Signed in as {name}", { name: farmer.name })}
          >
            <i className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold uppercase text-leaf-100 not-italic ring-1 ring-white/15">
              {farmer.name.slice(0, 2)}
            </i>
          </span>
        ) : null}
        <SignOutButton rail />
      </div>
    </aside>
  );
}

/** Mobile: compact top bar + the floating dock. */
export function AppMobile() {
  const pathname = usePathname();
  const { t } = useI18n();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-[var(--color-line)] bg-[var(--background)] px-4">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2 text-[1.05rem] font-semibold tracking-tight"
        >
          <span className="brand-mark h-9 w-9">
            <Leaf className="h-4 w-4" strokeWidth={2.4} />
          </span>
          AgroAI
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <SignOutButton compact />
        </div>
      </header>

      <nav
        aria-label={t("Primary")}
        className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[1000]"
      >
        <div className="dock mx-auto grid w-full max-w-sm grid-cols-4 gap-1 p-1.5">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className="dock-link"
              >
                <Icon className="h-5 w-5" strokeWidth={1.8} />
                {t(label)}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Leaf,
  Map as MapIcon,
  Sprout,
  UserRound,
  Video,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { useSessionFarmer } from "@/components/auth/session";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Farm Map", icon: MapIcon },
  { href: "/crops", label: "Crops", icon: Sprout },
  { href: "/watch", label: "Live Watch", icon: Video },
];

export function AppNav() {
  const pathname = usePathname();
  const farmer = useSessionFarmer();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-[1000] border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="flex h-16 w-full items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <Leaf className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.4} />
            </span>
            <span className="text-[1.35rem] leading-none">
              Agro
              <span className="text-brand-700 dark:text-brand-400">AI</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-150",
                  isActive(href)
                    ? "bg-brand-700 text-white shadow-sm"
                    : "muted hover:bg-[var(--card-muted)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {farmer ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-[var(--card-muted)] px-3 py-2 text-sm font-semibold sm:inline-flex">
                <UserRound className="h-4 w-4 text-brand-700 dark:text-brand-400" />
                <span className="max-w-32 truncate">{farmer.name}</span>
              </span>
            ) : null}
            <SignOutButton compact />
          </div>
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[1000] border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur md:hidden"
      >
        <div className="grid w-full grid-cols-4">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
                isActive(href)
                  ? "text-brand-700 dark:text-brand-400"
                  : "muted",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

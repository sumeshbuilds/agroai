"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Leaf,
  Map as MapIcon,
  Siren,
  Sprout,
} from "lucide-react";

import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Farm Map", icon: MapIcon },
  { href: "/crops", label: "Crops", icon: Sprout },
  { href: "/simulate", label: "Alerts", icon: Siren },
];

export function AppNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-[1000] border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-extrabold tracking-tight"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white shadow-sm">
              <Leaf className="h-5 w-5" />
            </span>
            <span className="text-lg">
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
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
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
        </div>
      </header>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[1000] border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-4">
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

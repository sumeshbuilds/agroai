"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/** Compact workbench heading for interior pages. */
export function SectionHeading({
  title,
  subtitle,
  icon,
  action,
}: SectionHeadingProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-[var(--color-line)] pb-6">
      <div className="flex min-w-0 flex-[1_1_22rem] items-start gap-3.5">
        {icon ? (
          <span className="title-icon">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="muted mt-2 max-w-[65ch] text-sm leading-relaxed">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function EmptyHint({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn btn-primary">
      {label}
    </Link>
  );
}

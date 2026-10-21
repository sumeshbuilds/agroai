import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function SectionHeading({
  title,
  subtitle,
  icon,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {subtitle ? <p className="muted text-sm">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

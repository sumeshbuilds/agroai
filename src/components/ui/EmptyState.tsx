import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "card flex flex-col items-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
          {icon}
        </span>
      ) : null}
      <h3 className="text-lg font-bold">{title}</h3>
      {description ? (
        <p className="muted max-w-md text-sm leading-relaxed">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

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
        "card flex flex-col items-center gap-4 px-6 py-12 text-center sm:py-14",
        className,
      )}
    >
      {icon ? (
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-leaf-100 text-leaf-700">
          {icon}
        </span>
      ) : null}
      <h3 className="max-w-md text-xl font-semibold leading-snug">{title}</h3>
      {description ? (
        <p className="muted max-w-[46ch] text-sm leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

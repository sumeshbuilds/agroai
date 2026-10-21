import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type CalloutTone = "info" | "warn" | "danger" | "success";

const toneClasses: Record<CalloutTone, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warn: "border-warn-500/40 bg-warn-500/10 text-warn-700 dark:text-amber-300",
  danger:
    "border-danger-500/40 bg-danger-500/10 text-danger-700 dark:text-red-300",
  success:
    "border-brand-500/40 bg-brand-500/10 text-brand-800 dark:text-brand-300",
};

export function Callout({
  tone = "info",
  title,
  icon,
  children,
  className,
}: {
  tone?: CalloutTone;
  title?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-sm",
        toneClasses[tone],
        className,
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="space-y-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

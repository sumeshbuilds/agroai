import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type CalloutTone = "info" | "warn" | "danger" | "success";

const toneClasses: Record<CalloutTone, string> = {
  info: "border-info-300/60 bg-info-100 text-info-700",
  warn: "border-warn-500/25 bg-warn-100 text-warn-700",
  danger:
    "border-danger-500/25 bg-danger-100 text-danger-700",
  success:
    "border-leaf-500/25 bg-leaf-100 text-leaf-700",
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
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm",
        toneClasses[tone],
        className,
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="min-w-0 space-y-1 break-words">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

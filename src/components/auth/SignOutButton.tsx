"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export function SignOutButton({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await api.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold transition-colors hover:border-danger-500/60 hover:text-danger-700 dark:hover:text-danger-500 disabled:opacity-60",
        compact ? "h-9" : "min-h-10",
        className,
      )}
      title="Sign out"
    >
      <LogOut className="h-4 w-4" />
      <span className={compact ? "sr-only" : ""}>
        {loading ? "Signing out…" : "Sign out"}
      </span>
    </button>
  );
}

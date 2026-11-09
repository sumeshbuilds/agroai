"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export function SignOutButton({
  className,
  compact = false,
  rail = false,
}: {
  className?: string;
  compact?: boolean;
  rail?: boolean;
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

  if (rail) {
    return (
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={loading}
        title={loading ? "Signing out…" : "Sign out"}
        aria-label="Sign out"
        className={cn(
          "rail-btn disabled:opacity-50",
          loading ? "opacity-50" : "",
          className,
        )}
      >
        <LogOut className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.1} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={loading}
      className={cn(
        "btn btn-secondary hover:border-danger-500/60 hover:text-danger-600 disabled:opacity-60",
        compact ? "h-11 w-11 px-0" : "min-h-11",
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

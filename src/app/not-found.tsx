import Link from "next/link";
import { Sprout } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        <Sprout className="h-8 w-8" />
      </span>
      <h1 className="text-2xl font-extrabold">Field not found</h1>
      <p className="muted max-w-sm">
        This page is not part of AgroAI. Head back to your dashboard.
      </p>
      <Link href="/" className="btn btn-primary">
        Back to dashboard
      </Link>
    </main>
  );
}

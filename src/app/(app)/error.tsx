"use client";

import { LoadError } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";

/**
 * Segment error boundary: a throwing page (bad stats JSON, a chart blow-up)
 * used to replace the whole document with Next's global error, which detaches
 * the shell — including Sign out. Catching here keeps the sidebar.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div className="animate-fade-up space-y-4">
      <h1 className="text-xl font-bold tracking-tight md:text-2xl">{t("error.loadFailed")}</h1>
      <LoadError onRetry={reset} />
    </div>
  );
}

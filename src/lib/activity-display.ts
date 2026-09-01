import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Activity `meta.detail` is a stable English machine record (tests + stored JSON).
 * Map known system lines at display time; leave anything else as written.
 */
export function formatActivityDetail(detail: string, t: Translate): string {
  if (detail === "Workflow added note") return t("activity.workflowAddedNote");
  if (detail === "AI draft") return t("activity.aiDraft");
  return detail;
}

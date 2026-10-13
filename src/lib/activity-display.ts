import type { MessageKey } from "@/lib/i18n";
import { formatCompact } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

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

/** An `owner_changed` entry: both sides by name, a missing side read as unassigned. */
export function formatOwnerChange(meta: { from?: unknown; to?: unknown }, t: Translate): string {
  const name = (v: unknown) => (typeof v === "string" && v ? v : t("common.unassigned"));
  return t("activity.ownerChangedDetail", { from: name(meta.from), to: name(meta.to) });
}

type ValueChangeMeta =
  | { field: "amount"; from: number | null; to: number | null; fromCurrency: string; toCurrency: string }
  | { field: "expectedCloseDate" | "delivery"; label?: string; from: number | null; to: number | null };

/**
 * `meta.changes` on a deal timeline entry, read as "label: old → new" and
 * joined with "; ". Money is compact in its own currency; dates follow the
 * reader's locale; a missing value reads "—". Anything else reads as "".
 */
export function formatValueChanges(changes: unknown, t: Translate, locale: Locale): string {
  if (!Array.isArray(changes)) return "";
  return (changes as ValueChangeMeta[])
    .map((c) => {
      if (c.field === "amount") {
        const from = formatCompact(c.from, c.fromCurrency, locale);
        const to = formatCompact(c.to, c.toCurrency, locale);
        return `${t("col.amount")}: ${from} → ${to}`;
      }
      const label = c.field === "expectedCloseDate" ? t("col.closeDate") : (c.label ?? "");
      const date = (v: number | null) => (v == null ? "—" : formatDate(v, locale));
      return `${label}: ${date(c.from)} → ${date(c.to)}`;
    })
    .join("; ");
}

import { formatDate } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import type { CustomObjectFieldDef } from "@/lib/types";

export { recordTitle } from "@/lib/custom-object-display";

export function formatFieldValue(
  field: CustomObjectFieldDef,
  value: unknown,
  labels?: { yes?: string; no?: string; locale?: Locale },
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "checkbox") {
    const on = value === true || value === 1 || value === "true";
    return on ? (labels?.yes ?? "Yes") : (labels?.no ?? "No");
  }
  if (field.type === "date") {
    const n = typeof value === "number" ? value : Date.parse(String(value));
    return Number.isFinite(n) ? formatDate(n, labels?.locale) : String(value);
  }
  return String(value);
}

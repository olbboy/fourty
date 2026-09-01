import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Import-API `error` is a stable English machine record (tests + JSON body).
 * Map known lines at display time; anything else uses the generic fallback.
 */
export function formatImportError(error: unknown, t: Translate): string {
  if (error === "Empty file") return t("page.import.empty");
  if (error === "No data rows found — is the first row a header?") return t("page.import.noRows");
  const tooMany = typeof error === "string" ? /^Too many rows \(max (\d+)\)$/.exec(error) : null;
  if (tooMany) return t("page.import.tooMany", { max: tooMany[1] });
  if (typeof error === "string" && (error === "Unauthorized" || error.startsWith("Forbidden"))) {
    return t("page.import.forbidden");
  }
  return t("page.import.failed");
}

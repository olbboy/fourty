import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export { roleLabel as fieldPermsRoleLabel } from "@/lib/role-display";

/**
 * Field-permissions API `error` is a stable English machine record.
 * Map known auth failures; anything else uses the caller’s generic fallback.
 */
export function formatFieldPermsError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (typeof error === "string" && (error === "Unauthorized" || error.startsWith("Forbidden"))) {
    return t("settings.fieldPermsForbidden");
  }
  return t(fallback);
}

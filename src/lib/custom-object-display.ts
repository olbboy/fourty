import type { MessageKey } from "@/lib/i18n";
import { FIELD_CHANGE_INVALID_RE } from "./field-def-guard";

/** Enough of a field def to pick a record title — first text field, else first field. */
export type RecordTitleField = { key: string; type: string };

/**
 * Display name for a custom-object record. Shared by the detail page, Agent
 * grounding, and (later) search hits. Lives in this leaf module so client
 * components never import `@/lib/custom-objects` (db).
 */
export function recordTitle(
  data: Record<string, unknown>,
  fields: RecordTitleField[],
  untitled = "Untitled",
): string {
  const firstText = fields.find((f) => f.type === "text");
  const first = firstText ?? fields[0];
  if (!first) return untitled;
  const v = data[first.key];
  if (v === null || v === undefined || v === "") return untitled;
  return String(v);
}

/** http(s) only — never turn a leftover `javascript:` value into a live link. */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Custom-object API `error` is a stable English machine record (tests + JSON
 * body). Map known lines at display time; anything else uses the caller's
 * generic fallback.
 */
export function formatCustomObjectError(error: unknown, t: Translate, fallback: MessageKey): string {
  if (error === "Object not found") return t("settings.objectNotFound");
  if (error === "Field not found") return t("settings.fieldNotFound");
  if (error === "That api name is reserved by a built-in object") return t("settings.objectApiReserved");
  if (error === "An object with this api name already exists") return t("settings.objectApiExists");
  if (error === "A field with this key already exists") return t("settings.fieldKeyExists");
  if (typeof error === "string") {
    const invalid = FIELD_CHANGE_INVALID_RE.exec(error);
    if (invalid) return t("settings.fieldChangeInvalid", { detail: invalid[1] || "—" });
  }
  return t(fallback);
}

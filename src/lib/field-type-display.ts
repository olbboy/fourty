import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url"] as const;

const FIELD_TYPE_KEYS: Record<(typeof FIELD_TYPES)[number], MessageKey> = {
  text: "settings.fieldTypeText",
  number: "settings.fieldTypeNumber",
  date: "settings.fieldTypeDate",
  select: "settings.fieldTypeSelect",
  checkbox: "settings.fieldTypeCheckbox",
  url: "settings.fieldTypeUrl",
};

/** Field `type` is a stable English machine token; map it at display time. */
export function fieldTypeLabel(type: string, t: Translate): string {
  const key = FIELD_TYPE_KEYS[type as (typeof FIELD_TYPES)[number]];
  return key ? t(key) : type;
}

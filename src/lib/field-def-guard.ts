import type { FieldDef } from "./records";

/**
 * Stable English machine record for a field-definition change that would leave
 * existing records invalid. Shared by custom-field and custom-object routes so
 * the 409 body, the i18n mapper, and the tests cannot drift apart.
 */
export const FIELD_CHANGE_INVALID_PREFIX =
  "Can't change this field — an existing record would be invalid";

export const FIELD_CHANGE_INVALID_RE = new RegExp(
  `^${FIELD_CHANGE_INVALID_PREFIX}(?::\\s*(.*))?$`,
);

export function fieldChangeInvalidMessage(detail: string): string {
  return `${FIELD_CHANGE_INVALID_PREFIX}: ${detail}`;
}

/** Prospective defs after patching one field by key (retype / options / required). */
export function patchedFieldDefs(
  defs: FieldDef[],
  key: string,
  patch: Partial<Pick<FieldDef, "type" | "options" | "required">>,
): FieldDef[] {
  return defs.map((f) =>
    f.key === key
      ? {
          ...f,
          type: patch.type ?? f.type,
          options: patch.options ?? f.options,
          required: patch.required ?? f.required,
        }
      : f,
  );
}

/** Prospective defs after appending a newly created field. */
export function defsWithNewField(defs: FieldDef[], field: FieldDef): FieldDef[] {
  return [...defs, field];
}

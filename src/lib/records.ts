/**
 * Field-def-driven validation + coercion for record `data` blobs (Gate C1).
 * Shared by custom-object records (and available for custom fields on fixed
 * objects). Turns a stored field definition into a runtime check so writes to a
 * no-code object are validated the same way a hand-written zod schema validates
 * a fixed object — closing the "custom fields not validated on write" gap.
 */

export type FieldType = "text" | "number" | "date" | "select" | "checkbox" | "url";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  required: boolean;
};

export type ValidateResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/**
 * Validate + coerce `input` against `fields`. Unknown keys are dropped (schema is
 * authoritative). Required blanks and type mismatches return a 400-style error
 * message naming the field.
 */
export function validateRecord(fields: FieldDef[], input: Record<string, unknown>): ValidateResult {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = input[f.key];
    if (isBlank(raw)) {
      if (f.required) return { ok: false, error: `${f.label} is required` };
      continue;
    }
    switch (f.type) {
      case "number": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) return { ok: false, error: `${f.label} must be a number` };
        out[f.key] = n;
        break;
      }
      case "checkbox": {
        out[f.key] = raw === true || raw === "true" || raw === 1 || raw === "1";
        break;
      }
      case "date": {
        const n = typeof raw === "number" ? raw : Date.parse(String(raw));
        if (!Number.isFinite(n)) return { ok: false, error: `${f.label} must be a date` };
        out[f.key] = n;
        break;
      }
      case "select": {
        const s = String(raw);
        if (f.options.length > 0 && !f.options.includes(s)) {
          return { ok: false, error: `${f.label} must be one of: ${f.options.join(", ")}` };
        }
        out[f.key] = s;
        break;
      }
      case "url": {
        const s = String(raw);
        try {
          const u = new URL(s);
          if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
        } catch {
          return { ok: false, error: `${f.label} must be a valid http(s) URL` };
        }
        out[f.key] = s;
        break;
      }
      default: {
        // text
        if (typeof raw === "object") return { ok: false, error: `${f.label} must be text` };
        out[f.key] = String(raw);
      }
    }
  }
  return { ok: true, data: out };
}

/** A slug for an object api_name / field key: lowercase, digits, underscores. */
export const API_NAME_RE = /^[a-z][a-z0-9_]*$/;

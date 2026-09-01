import { eq } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Field-level permissions (Gate D1, ADR-011). A per-(object, field, role) rule can
 * hide a field from reads or block writes to it. Absence of a rule = allowed
 * (backward compatible); **admin is never restricted**. Enforced in the REST
 * handlers for the core objects via loadFieldPolicy() → redact()/blockedWrites(),
 * plus dashboard/report lists and amount-derived KPI aggregates. Must run
 * inside withWorkspace() so the policy query is RLS-scoped.
 */
export const FIELD_PERM_OBJECTS = ["contacts", "companies", "deals"] as const;
export type FieldPermObject = (typeof FIELD_PERM_OBJECTS)[number];

export type FieldPolicy = {
  /** key `${object}.${field}` → capabilities. Missing key = fully allowed. */
  rules: Map<string, { read: boolean; write: boolean }>;
};

/**
 * Load the effective field policy for `role`, or `null` when the role is
 * unrestricted (admin). One query per request; cheap (few rows per workspace).
 */
export async function loadFieldPolicy(role: string): Promise<FieldPolicy | null> {
  if (role === "admin") return null; // admins bypass field-level restrictions
  const rows = await db
    .select()
    .from(tables.fieldPermissions)
    .where(eq(tables.fieldPermissions.role, role));
  const rules = new Map<string, { read: boolean; write: boolean }>();
  for (const r of rows) {
    rules.set(`${r.object}.${r.field}`, { read: r.canRead === 1, write: r.canWrite === 1 });
  }
  return { rules };
}

/** True unless a deny-read rule exists for this field. */
export function canReadField(policy: FieldPolicy | null, object: string, field: string): boolean {
  if (!policy) return true;
  const rule = policy.rules.get(`${object}.${field}`);
  return rule ? rule.read : true;
}

/** Remove fields the role may not read from a serialized record. */
export function redact<T extends Record<string, unknown>>(
  policy: FieldPolicy | null,
  object: string,
  row: T,
): T {
  if (!policy) return row;
  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (!canReadField(policy, object, key)) delete out[key];
  }
  return out;
}

/** Field keys in `input` the role may not write (empty = all writable). */
export function blockedWrites(
  policy: FieldPolicy | null,
  object: string,
  inputKeys: string[],
): string[] {
  if (!policy) return [];
  return inputKeys.filter((key) => {
    const rule = policy.rules.get(`${object}.${key}`);
    return rule ? !rule.write : false;
  });
}

export type FieldAccessMaps = {
  hidden: Record<FieldPermObject, string[]>;
  blockedWrites: Record<FieldPermObject, string[]>;
};

function emptyAccessMaps(): FieldAccessMaps {
  return {
    hidden: { contacts: [], companies: [], deals: [] },
    blockedWrites: { contacts: [], companies: [], deals: [] },
  };
}

/** Effective hide/freeze lists for a role — what the signed-in UI needs. */
export function fieldAccessForPolicy(policy: FieldPolicy | null): FieldAccessMaps {
  const out = emptyAccessMaps();
  if (!policy) return out;
  for (const [key, caps] of policy.rules) {
    const dot = key.indexOf(".");
    const object = key.slice(0, dot) as FieldPermObject;
    const field = key.slice(dot + 1);
    if (!(object in out.hidden)) continue;
    if (!caps.read) out.hidden[object].push(field);
    if (!caps.write) out.blockedWrites[object].push(field);
  }
  return out;
}

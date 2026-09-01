export type FieldAccessObject = "contacts" | "companies" | "deals";

export type ObjectFieldAccess = {
  ready: boolean;
  /** `/me` failed. `ready` stays false so the UI does not fail open. */
  failed: boolean;
  hidden: Set<string>;
  blockedWrites: Set<string>;
};

export type FieldAccessResponse = {
  hidden?: Partial<Record<FieldAccessObject, string[]>>;
  blockedWrites?: Partial<Record<FieldAccessObject, string[]>>;
};

/** Drop keys the role may not write so a defaulted form value is not a write. */
export function stripBlockedWrites<T extends Record<string, unknown>>(
  body: T,
  blocked: Iterable<string>,
): T {
  const block = blocked instanceof Set ? blocked : new Set(blocked);
  if (block.size === 0) return body;
  const out = { ...body };
  for (const key of block) delete out[key];
  return out;
}

/** False until `/me` loads, and false when the field is hidden or write-blocked. */
export function canEditField(access: ObjectFieldAccess, field: string): boolean {
  return access.ready && !access.hidden.has(field) && !access.blockedWrites.has(field);
}

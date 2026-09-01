/** Case-insensitive email identity for contact dedupe (ADR-016, Tier 2). */
export function normalizeEmail(email: string | null | undefined): string | null {
  const s = email?.trim().toLowerCase();
  return s ? s : null;
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return left !== null && left === right;
}

/** Fold case and inner whitespace so "Ada  Lovelace" and "ada lovelace" are one name. */
export function normalizePersonName(name: string | null | undefined): string | null {
  const s = name?.trim().replace(/\s+/g, " ").toLowerCase();
  return s ? s : null;
}

export type NameCompany = {
  firstName?: string | null;
  lastName?: string | null;
  companyId?: string | null;
};

/**
 * Both sides must have a first and last name. A missing last name is not a
 * match — "Ada" at a company is too weak to flag as a duplicate.
 */
export function namesMatch(a: NameCompany, b: NameCompany): boolean {
  const af = normalizePersonName(a.firstName);
  const al = normalizePersonName(a.lastName);
  const bf = normalizePersonName(b.firstName);
  const bl = normalizePersonName(b.lastName);
  return af !== null && al !== null && af === bf && al === bl;
}

/** Same folded name at the same company. Company-less contacts never match this way. */
export function nameAndCompanyMatch(a: NameCompany, b: NameCompany): boolean {
  return Boolean(a.companyId) && a.companyId === b.companyId && namesMatch(a, b);
}

export type DuplicateHit<T extends { id: string; email?: string | null } & NameCompany> = {
  contact: T;
  byEmail: boolean;
  byNameCompany: boolean;
};

type Identity = { id: string; email?: string | null } & NameCompany;

/** Other contacts that share this email, or this name at this company. */
export function pickDuplicateContacts<T extends Identity>(
  self: Identity,
  candidates: T[],
): DuplicateHit<T>[] {
  const hits = new Map<string, DuplicateHit<T>>();
  for (const other of candidates) {
    if (other.id === self.id) continue;
    const byEmail = emailsMatch(self.email, other.email);
    const byNameCompany = nameAndCompanyMatch(self, other);
    if (!byEmail && !byNameCompany) continue;
    const prev = hits.get(other.id);
    if (prev) {
      prev.byEmail ||= byEmail;
      prev.byNameCompany ||= byNameCompany;
    } else {
      hits.set(other.id, { contact: other, byEmail, byNameCompany });
    }
  }
  return [...hits.values()];
}

/**
 * The first name+company hit, unless the caller already acknowledged that
 * exact record (submit-again to create anyway). Email hits are not returned:
 * those are refused by the write path, not warned.
 */
export function unackedNameCompanyDuplicate<T extends Identity>(
  self: Identity,
  candidates: T[],
  acknowledgedId: string | null,
): DuplicateHit<T> | null {
  const hit = pickDuplicateContacts(self, candidates).find((h) => h.byNameCompany) ?? null;
  if (!hit) return null;
  if (acknowledgedId === hit.contact.id) return null;
  return hit;
}

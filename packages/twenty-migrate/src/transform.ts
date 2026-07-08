/**
 * Pure Twenty → Fourty record transforms. Twenty's GraphQL model nests fields
 * (name.firstName, emails.primaryEmail) and stores money in "micros" and dates as
 * ISO strings; these functions flatten that into Fourty's REST shapes. No I/O —
 * every mapping is unit-tested against fixtures in tests/twenty-migrate.test.ts.
 */

// ── Twenty source shapes (subset we read) ────────────────────────────────────
export type TwentyPerson = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  emails?: { primaryEmail?: string | null } | null;
  phones?: { primaryPhoneNumber?: string | null } | null;
  jobTitle?: string | null;
  city?: string | null;
  companyId?: string | null;
  linkedinLink?: { primaryLinkUrl?: string | null } | null;
};

export type TwentyCompany = {
  id: string;
  name?: string | null;
  domainName?: { primaryLinkUrl?: string | null } | null;
  employees?: number | null;
  address?: { addressCity?: string | null; addressCountry?: string | null } | null;
  linkedinLink?: { primaryLinkUrl?: string | null } | null;
  annualRecurringRevenue?: { amountMicros?: number | null; currencyCode?: string | null } | null;
};

export type TwentyOpportunity = {
  id: string;
  name?: string | null;
  amount?: { amountMicros?: number | null; currencyCode?: string | null } | null;
  closeDate?: string | null;
  stage?: string | null;
  companyId?: string | null;
  pointOfContactId?: string | null;
};

// ── Fourty REST input shapes (what we POST) ──────────────────────────────────
export type FourtyContactInput = {
  firstName: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  companyId?: string | null;
  linkedin?: string | null;
};

export type FourtyCompanyInput = {
  name: string;
  domain?: string | null;
  size?: string | null;
  city?: string | null;
  country?: string | null;
  linkedin?: string | null;
  annualRevenue?: number | null;
};

export type FourtyDealInput = {
  name: string;
  amount: number;
  currency: string;
  expectedCloseDate?: number | null;
  companyId?: string | null;
  contactId?: string | null;
};

/** Twenty money micros → whole units (Twenty stores amount * 1_000_000). */
export function microsToUnits(micros: number | null | undefined): number {
  return typeof micros === "number" ? Math.round((micros / 1_000_000) * 100) / 100 : 0;
}

/** ISO date (or date-only) → epoch millis, or null. */
export function isoToMillis(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function transformPerson(p: TwentyPerson): FourtyContactInput {
  const firstName = p.name?.firstName?.trim() || p.emails?.primaryEmail?.split("@")[0] || "Unknown";
  return {
    firstName,
    lastName: p.name?.lastName?.trim() || "",
    email: p.emails?.primaryEmail || null,
    phone: p.phones?.primaryPhoneNumber || null,
    jobTitle: p.jobTitle || null,
    city: p.city || null,
    companyId: p.companyId || null, // remapped by the migrator
    linkedin: p.linkedinLink?.primaryLinkUrl || null,
  };
}

/** Map Twenty's employee count to Fourty's size bucket string. */
export function employeesToSize(employees: number | null | undefined): string | null {
  if (typeof employees !== "number" || employees <= 0) return null;
  if (employees <= 10) return "1-10";
  if (employees <= 50) return "11-50";
  if (employees <= 200) return "51-200";
  if (employees <= 1000) return "201-1000";
  return "1000+";
}

export function transformCompany(c: TwentyCompany): FourtyCompanyInput {
  return {
    name: c.name?.trim() || "Untitled company",
    domain: c.domainName?.primaryLinkUrl || null,
    size: employeesToSize(c.employees),
    city: c.address?.addressCity || null,
    country: c.address?.addressCountry || null,
    linkedin: c.linkedinLink?.primaryLinkUrl || null,
    annualRevenue: c.annualRecurringRevenue?.amountMicros
      ? microsToUnits(c.annualRecurringRevenue.amountMicros)
      : null,
  };
}

export function transformOpportunity(o: TwentyOpportunity): FourtyDealInput {
  return {
    name: o.name?.trim() || "Untitled opportunity",
    amount: microsToUnits(o.amount?.amountMicros),
    currency: o.amount?.currencyCode || "USD",
    expectedCloseDate: isoToMillis(o.closeDate),
    companyId: o.companyId || null, // remapped by the migrator
    contactId: o.pointOfContactId || null, // remapped by the migrator
  };
}

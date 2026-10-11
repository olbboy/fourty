import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { tables } from "@/db";
import { canReadField, type FieldPolicy } from "@/lib/field-permissions";

/** Sorts accepted by both the Companies list and filtered export. */
export const COMPANY_SORTS = [
  "updatedAt_desc",
  "updatedAt_asc",
  "name_asc",
  "name_desc",
  "annualRevenue_desc",
  "annualRevenue_asc",
] as const;

export type CompanySort = (typeof COMPANY_SORTS)[number];
export type EffectiveCompanySort = CompanySort | "id_asc";
export type CompanySearchField = "name" | "domain" | "industry";

export type CompanyQuery = {
  q?: string;
  industry?: string;
  sort: CompanySort;
  sortProvided: boolean;
  offset: number;
  limit: number;
};

export type CompanyQueryValidation =
  | { ok: true; value: CompanyQuery }
  | { ok: false; field: "offset" | "limit" | "sort"; message: string };

export type CompanyQueryPolicy =
  | {
      ok: true;
      searchFields: CompanySearchField[];
      effectiveSort: EffectiveCompanySort;
    }
  | { ok: false; status: 403; message: string };

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const MAX_SELECTED_IDS = 500;

function parseNonNegativeInteger(
  params: URLSearchParams,
  key: "offset" | "limit",
  fallback: number,
  max?: number,
): { ok: true; value: number } | { ok: false; field: "offset" | "limit"; message: string } {
  if (!params.has(key)) return { ok: true, value: fallback };
  const raw = params.get(key) ?? "";
  if (!/^\d+$/.test(raw)) {
    return { ok: false, field: key, message: `${key} must be a non-negative integer` };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || (key === "limit" && value < 1)) {
    return {
      ok: false,
      field: key,
      message: key === "limit" ? `limit must be an integer between 1 and ${MAX_LIMIT}` : "offset is too large",
    };
  }
  return { ok: true, value: max === undefined ? value : Math.min(value, max) };
}

/** Normalize the shared Companies list/export query without touching the DB. */
export function normalizeCompanyQuery(params: URLSearchParams): CompanyQueryValidation {
  const offset = parseNonNegativeInteger(params, "offset", 0);
  if (!offset.ok) return offset;
  const limit = parseNonNegativeInteger(params, "limit", DEFAULT_LIMIT, MAX_LIMIT);
  if (!limit.ok) return limit;

  const sortProvided = params.has("sort");
  const rawSort = params.get("sort") ?? "updatedAt_desc";
  if (!COMPANY_SORTS.includes(rawSort as CompanySort)) {
    return { ok: false, field: "sort", message: "sort is not supported" };
  }

  const q = params.get("q")?.trim() || undefined;
  const industry = params.get("industry")?.trim() || undefined;
  return {
    ok: true,
    value: {
      q,
      industry,
      sort: rawSort as CompanySort,
      sortProvided,
      offset: offset.value,
      limit: limit.value,
    },
  };
}

function sortField(sort: CompanySort): "updatedAt" | "name" | "annualRevenue" {
  if (sort.startsWith("updatedAt")) return "updatedAt";
  if (sort.startsWith("annualRevenue")) return "annualRevenue";
  return "name";
}

/** Apply field policy to search, filter and sort before building SQL. */
export function companyQueryPolicy(query: CompanyQuery, policy: FieldPolicy | null): CompanyQueryPolicy {
  const searchFields = (["name", "domain", "industry"] as const).filter((field) =>
    canReadField(policy, "companies", field),
  );

  // A q that has no readable search target must not degrade into an unfiltered
  // query, because that would expose row existence through result count.
  if (query.q && searchFields.length === 0) {
    return { ok: false, status: 403, message: "Forbidden: company query is not readable" };
  }
  if (query.industry && !canReadField(policy, "companies", "industry")) {
    return { ok: false, status: 403, message: "Forbidden: company query is not readable" };
  }

  const requestedField = sortField(query.sort);
  if (!canReadField(policy, "companies", requestedField)) {
    // The legacy request had no sort parameter. An unreadable default timestamp
    // sort falls back to a stable id order; an explicit hidden sort is denied.
    if (!query.sortProvided && query.sort === "updatedAt_desc") {
      return { ok: true, searchFields, effectiveSort: "id_asc" };
    }
    return { ok: false, status: 403, message: "Forbidden: company query is not readable" };
  }
  return { ok: true, searchFields, effectiveSort: query.sort };
}

function searchPredicate(field: CompanySearchField, pattern: string): SQL {
  switch (field) {
    case "name":
      return ilike(tables.companies.name, pattern);
    case "domain":
      return ilike(tables.companies.domain, pattern);
    case "industry":
      return ilike(tables.companies.industry, pattern);
  }
}

/** Build the shared Companies WHERE clause after `companyQueryPolicy` passes. */
export function companyWhere(
  query: CompanyQuery,
  searchFields: readonly CompanySearchField[] = ["name", "domain", "industry"],
): SQL | undefined {
  const clauses: SQL[] = [];
  if (query.q) {
    const pattern = `%${query.q.replace(/[%_]/g, "")}%`;
    const predicates = searchFields.map((field) => searchPredicate(field, pattern));
    // Keep this fail-closed if a caller accidentally skips policy validation.
    clauses.push(predicates.length ? or(...predicates)! : sql`false`);
  }
  if (query.industry) clauses.push(eq(tables.companies.industry, query.industry));
  return clauses.length ? and(...clauses) : undefined;
}

/** Build deterministic order clauses with `id` as the tie-breaker. */
export function companyOrderBy(sort: EffectiveCompanySort): SQL[] {
  const tieBreaker = asc(tables.companies.id);
  switch (sort) {
    case "id_asc":
      return [tieBreaker];
    case "updatedAt_desc":
      return [desc(tables.companies.updatedAt), tieBreaker];
    case "updatedAt_asc":
      return [asc(tables.companies.updatedAt), tieBreaker];
    case "name_asc":
      return [asc(tables.companies.name), tieBreaker];
    case "name_desc":
      return [desc(tables.companies.name), tieBreaker];
    case "annualRevenue_desc":
      return [desc(tables.companies.annualRevenue), tieBreaker];
    case "annualRevenue_asc":
      return [asc(tables.companies.annualRevenue), tieBreaker];
  }
}

/**
 * Read selected IDs from `ids` or repeated `id` query parameters. Commas are
 * accepted so a browser can encode a checkbox selection in one parameter.
 */
export function parseSelectedCompanyIds(params: URLSearchParams): string[] {
  const raw = [...params.getAll("ids"), ...params.getAll("id")];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw.flatMap((part) => part.split(","))) {
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length > MAX_SELECTED_IDS) throw new RangeError("selected company export is limited to 500 IDs");
  }
  return ids;
}

export const COMPANY_QUERY_LIMITS = { defaultLimit: DEFAULT_LIMIT, maxLimit: MAX_LIMIT, maxSelectedIds: MAX_SELECTED_IDS } as const;

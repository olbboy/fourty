import type { CompanyExportScope, CompanyListQuery, CompanySort } from "@/lib/types";

export const COMPANY_UI_LIMIT = 50;

const COMPANY_SORTS = new Set<CompanySort>([
  "updatedAt_desc",
  "updatedAt_asc",
  "name_asc",
  "name_desc",
  "annualRevenue_desc",
  "annualRevenue_asc",
]);

function nonNegativeInteger(value: string | null): number {
  if (value === null || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function parseCompanyListQuery(params: URLSearchParams): CompanyListQuery {
  const rawSort = params.get("sort");
  return {
    q: params.get("q")?.trim() ?? "",
    industry: params.get("industry")?.trim() ?? "",
    sort: rawSort && COMPANY_SORTS.has(rawSort as CompanySort) ? (rawSort as CompanySort) : null,
    offset: nonNegativeInteger(params.get("offset")),
    // The list surface owns a fixed page size. Keep arbitrary deep-link limits
    // from causing a larger request before the URL is canonicalized.
    limit: COMPANY_UI_LIMIT,
  };
}

export function toCompanyApiParams(query: CompanyListQuery, includePaging = true): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.industry) params.set("industry", query.industry);
  if (query.sort) params.set("sort", query.sort);
  if (includePaging) {
    if (query.offset > 0) params.set("offset", String(query.offset));
    params.set("limit", String(query.limit));
  }
  return params;
}

/** A stable list key that intentionally excludes preview URL state. */
export function companyListQueryKey(query: CompanyListQuery, workspaceKey = ""): string {
  return `${workspaceKey}|${toCompanyApiParams(query).toString()}`;
}

export function buildCompanyExportUrl(
  scope: CompanyExportScope,
  query: CompanyListQuery,
  selectedIds: readonly string[],
): string {
  const params = new URLSearchParams({ scope });
  if (scope === "selected") {
    params.set("ids", selectedIds.join(","));
  } else if (scope === "filtered") {
    const filters = toCompanyApiParams(query, false);
    filters.forEach((value, key) => params.set(key, value));
  }
  return `/api/export/companies?${params.toString()}`;
}

import { getTableColumns, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { companyOrderBy, companyWhere, type CompanyQuery, type CompanyQueryPolicy } from "./company-query";
import { canReadField, redact, type FieldPolicy } from "./field-permissions";

type CompanyRow = typeof tables.companies.$inferSelect;
type AllowedQuery = Extract<CompanyQueryPolicy, { ok: true }>;

/** Rows, total and q-scoped facets share one PostgreSQL statement snapshot. */
export async function companyList(query: CompanyQuery, allowed: AllowedQuery, policy: FieldPolicy | null) {
  const where = companyWhere(query, allowed.searchFields) ?? sql`true`;
  const facetWhere = companyWhere({ ...query, industry: undefined }, allowed.searchFields) ?? sql`true`;
  const readableIndustry = canReadField(policy, "companies", "industry");
  // Schema-owned keys become JSON keys; no request text enters SQL identifiers.
  const fields = sql.join(Object.entries(getTableColumns(tables.companies)).flatMap(([key, column]) => [
    sql`${key}::text`, sql`${column}`,
  ]), sql`, `);
  const order = sql.join(companyOrderBy(allowed.effectiveSort), sql`, `);
  const facets = readableIndustry
    ? sql`coalesce((select jsonb_agg(industry order by industry) from
        (select distinct ${tables.companies.industry} as industry from ${tables.companies}
         where ${facetWhere} and ${tables.companies.industry} is not null) as industries), '[]'::jsonb)`
    : sql`null`;
  const result = await db.execute<{ companies: CompanyRow[]; total: number; industries: string[] | null }>(sql`
    with matches as materialized (
      select * from ${tables.companies} where ${where}
    ), page_rows as (
      select jsonb_build_object(${fields}) as record, row_number() over (order by ${order}) as ordinal
      from matches as companies
      order by ${order} limit ${query.limit} offset ${query.offset}
    )
    select coalesce((select jsonb_agg(record order by ordinal) from page_rows), '[]'::jsonb) as companies,
           (select count(*)::int from matches) as total,
           ${facets} as industries
  `);
  const row = result.rows[0];
  return {
    companies: row.companies.map((company) => redact(policy, "companies", {
      ...company, custom: JSON.parse(company.custom),
    })),
    page: { offset: query.offset, limit: query.limit, total: row.total, hasMore: query.offset + query.limit < row.total },
    ...(readableIndustry ? { facets: { industries: row.industries ?? [] } } : {}),
  };
}

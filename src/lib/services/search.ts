import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { loadFieldPolicy, redact } from "@/lib/field-permissions";
import { can } from "@/lib/permissions";
import { customRecordStringIlike, escapeLikeLiteral, fieldsOf, listObjects } from "@/lib/custom-objects";
import { recordTitle } from "@/lib/custom-object-display";

export type SearchMode = "prefix" | "contains";

export type CustomSearchHit = {
  id: string;
  object: string;
  data: Record<string, unknown>;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type CrmSearchHits = {
  contacts: Record<string, unknown>[];
  companies: Record<string, unknown>[];
  deals: Record<string, unknown>[];
  records: CustomSearchHit[];
};

function emptyHits(): CrmSearchHits {
  return { contacts: [], companies: [], deals: [], records: [] };
}

/** True when `q` is only LIKE wildcards — those queries must not match everything. */
function isWildcardOnlyQuery(q: string): boolean {
  return !q.trim().replace(/[%_]/g, "");
}

function likePattern(term: string, mode: SearchMode): string {
  const escaped = escapeLikeLiteral(term);
  return mode === "prefix" ? `${escaped}%` : `%${escaped}%`;
}

/**
 * Shared CRM search (REST command palette + MCP `search` + GraphQL `search`).
 * Match mode differs on purpose: palette is infix, MCP/GraphQL are prefix-only
 * so a near-miss is never a hit. Rows are full records so GraphQL can nest
 * `company` / `contact` the same way `contact(id)` does.
 */
export async function searchCrm(
  q: string,
  opts: { mode: SearchMode; limit: number; role: string },
): Promise<CrmSearchHits> {
  const term = q.trim();
  if (isWildcardOnlyQuery(term)) return emptyHits();
  const like = likePattern(term, opts.mode);
  const limit = Math.min(25, Math.max(1, Number(opts.limit) || 10));
  const policy = await loadFieldPolicy(opts.role);

  const contacts = await db
    .select()
    .from(tables.contacts)
    .where(
      or(
        ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, like),
        ilike(tables.contacts.firstName, like),
        ilike(tables.contacts.lastName, like),
        ilike(tables.contacts.email, like),
      ),
    )
    .limit(limit);

  const companies = await db
    .select()
    .from(tables.companies)
    .where(or(ilike(tables.companies.name, like), ilike(tables.companies.domain, like)))
    .limit(limit);

  const deals = await db
    .select()
    .from(tables.deals)
    .where(ilike(tables.deals.name, like))
    .limit(limit);

  return {
    contacts: contacts.map((r) => redact(policy, "contacts", { ...r })),
    companies: companies.map((r) => redact(policy, "companies", { ...r })),
    deals: deals.map((r) => redact(policy, "deals", { ...r })),
    records: await searchCustomRecords(term, opts.mode, limit, opts.role),
  };
}

/**
 * Match top-level JSON *string* values (not keys, numbers, dates, or bools).
 * Filtering in SQL before LIMIT so a prefix query cannot be starved by infix
 * JSON-text hits. Dates are millis — matching them as text would make `1` a
 * near-match-all.
 */
async function matchingCustomRows(objectId: string, pattern: string, limit: number) {
  const rows = await db
    .select()
    .from(tables.customRecords)
    .where(
      and(
        eq(tables.customRecords.objectId, objectId),
        customRecordStringIlike(pattern),
      ),
    )
    .orderBy(desc(tables.customRecords.updatedAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }));
}

async function searchCustomRecords(
  term: string,
  mode: SearchMode,
  limit: number,
  role: string,
): Promise<CustomSearchHit[]> {
  if (!can(role, "objects", "read")) return [];
  const objects = await listObjects();
  const hits: CustomSearchHit[] = [];
  const pattern = likePattern(term, mode);
  for (const obj of objects) {
    if (hits.length >= limit) break;
    const fields = await fieldsOf(obj.id);
    const rows = await matchingCustomRows(obj.id, pattern, limit - hits.length);
    for (const row of rows) {
      hits.push({
        id: row.id,
        object: obj.apiName,
        data: row.data,
        title: recordTitle(row.data, fields, "Untitled"),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }
  }
  return hits;
}

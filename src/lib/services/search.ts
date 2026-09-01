import { ilike, or, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { loadFieldPolicy, redact } from "@/lib/field-permissions";
import { can } from "@/lib/permissions";
import { fieldsOf, listObjects, listRecords } from "@/lib/custom-objects";
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

function likePattern(term: string, mode: SearchMode): string {
  return mode === "prefix" ? `${term}%` : `%${term}%`;
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
  const term = q.replace(/[%_]/g, "").trim();
  if (!term) return emptyHits();
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

async function searchCustomRecords(
  term: string,
  mode: SearchMode,
  limit: number,
  role: string,
): Promise<CustomSearchHit[]> {
  if (!can(role, "objects", "read")) return [];
  const objects = await listObjects();
  const hits: CustomSearchHit[] = [];
  const needle = term.toLowerCase();
  for (const obj of objects) {
    if (hits.length >= limit) break;
    const fields = await fieldsOf(obj.id);
    const rows = await listRecords(obj.id, { q: term, limit });
    for (const row of rows) {
      const title = recordTitle(row.data, fields, "Untitled");
      if (mode === "prefix") {
        const prefixHit =
          title.toLowerCase().startsWith(needle) ||
          fields.some((f) => {
            const v = row.data[f.key];
            return typeof v === "string" && v.toLowerCase().startsWith(needle);
          });
        if (!prefixHit) continue;
      }
      hits.push({
        id: row.id,
        object: obj.apiName,
        data: row.data,
        title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

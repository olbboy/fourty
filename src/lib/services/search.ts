import { and, desc, eq, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { canReadField, loadFieldPolicy, redact } from "@/lib/field-permissions";
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

/** A record found by the words of one of its notes, with those words in context. */
export type NoteHit = { entityType: "contact" | "company" | "deal"; entityId: string; excerpt: string };

export type CrmSearchHits = {
  contacts: Record<string, unknown>[];
  companies: Record<string, unknown>[];
  deals: Record<string, unknown>[];
  records: CustomSearchHit[];
  /** Contains mode only: which of the hits above came from a note. */
  notes?: NoteHit[];
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
 * The digit strings a phone query is compared by, or null when it is not one
 * (it has letters, or fewer than four digits). Spaces, dots, dashes, brackets
 * and the plus sign are dropped on both sides. A Vietnamese number matches
 * whether it is written nationally (0903…) or with the country code (+84 903…).
 */
export function phoneCandidates(term: string): string[] | null {
  if (/\p{L}/u.test(term)) return null;
  const digits = term.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const forms = new Set([digits]);
  if (digits.startsWith("0")) forms.add(`84${digits.replace(/^0+/, "")}`);
  if (digits.startsWith("84") && digits.length >= 9) forms.add(`0${digits.slice(2)}`);
  return [...forms];
}

function phoneWhere(term: string, mode: SearchMode): SQL | null {
  const forms = phoneCandidates(term);
  if (!forms) return null;
  const stored = sql`regexp_replace(coalesce(${tables.contacts.phone}, ''), '[^0-9]', '', 'g')`;
  // Contains: the number without its leading zeros may sit anywhere in a
  // stored "+84 …"; prefix keeps MCP's rule that a hit starts where you typed.
  const patterns = mode === "prefix" ? forms.map((f) => `${f}%`) : forms.map((f) => `%${f.replace(/^0+/, "")}%`);
  return or(...patterns.map((p) => sql`${stored} like ${p}`))!;
}

/** Build a search predicate from fields the caller can actually read. */
function readableTextWhere(
  policy: Awaited<ReturnType<typeof loadFieldPolicy>>,
  object: "contacts" | "companies" | "deals",
  pattern: string,
  phone: SQL | null = null,
): SQL | null {
  const predicates: SQL[] = [];

  if (object === "contacts") {
    const firstNameReadable = canReadField(policy, object, "firstName");
    const lastNameReadable = canReadField(policy, object, "lastName");
    if (firstNameReadable && lastNameReadable) {
      predicates.push(ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern));
      predicates.push(ilike(tables.contacts.firstName, pattern));
      predicates.push(ilike(tables.contacts.lastName, pattern));
    } else {
      if (firstNameReadable) predicates.push(ilike(tables.contacts.firstName, pattern));
      if (lastNameReadable) predicates.push(ilike(tables.contacts.lastName, pattern));
    }
    if (canReadField(policy, object, "email")) predicates.push(ilike(tables.contacts.email, pattern));
    if (phone && canReadField(policy, object, "phone")) predicates.push(phone);
  } else if (object === "companies") {
    if (canReadField(policy, object, "name")) predicates.push(ilike(tables.companies.name, pattern));
    if (canReadField(policy, object, "domain")) predicates.push(ilike(tables.companies.domain, pattern));
  } else if (canReadField(policy, object, "name")) {
    predicates.push(ilike(tables.deals.name, pattern));
  }

  return predicates.length ? or(...predicates)! : null;
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

  const contacts = canReadField(policy, "contacts", "id")
    ? await db
        .select()
        .from(tables.contacts)
        .where(readableTextWhere(policy, "contacts", like, phoneWhere(term, opts.mode)) ?? sql`false`)
        .limit(limit)
    : [];

  const companies = canReadField(policy, "companies", "id")
    ? await db
        .select()
        .from(tables.companies)
        .where(readableTextWhere(policy, "companies", like) ?? sql`false`)
        .limit(limit)
    : [];

  const deals = canReadField(policy, "deals", "id") && canReadField(policy, "deals", "name")
    ? await db
        .select()
        .from(tables.deals)
        .where(readableTextWhere(policy, "deals", like) ?? sql`false`)
        .limit(limit)
    : [];

  const hits: CrmSearchHits = {
    contacts: contacts.map((r) => redact(policy, "contacts", { ...r })),
    companies: companies.map((r) => redact(policy, "companies", { ...r })),
    deals: deals.map((r) => redact(policy, "deals", { ...r })),
    records: await searchCustomRecords(term, opts.mode, limit, opts.role),
  };
  // What notes say is free text: only the palette's infix search reads it.
  if (opts.mode === "contains") await addNoteHits(hits, term, limit, policy);
  return hits;
}

const NOTE_TABLES = { contact: tables.contacts, company: tables.companies, deal: tables.deals } as const;
const NOTE_OBJECTS = { contact: "contacts", company: "companies", deal: "deals" } as const;

/**
 * Records whose notes contain the words, appended after the records found by
 * their own fields (each record once). The caller must be able to read the
 * record, and for a deal its name, exactly as for a direct hit.
 */
async function addNoteHits(
  hits: CrmSearchHits,
  term: string,
  limit: number,
  policy: Awaited<ReturnType<typeof loadFieldPolicy>>,
): Promise<void> {
  const notes = await db
    .select({ entityType: tables.notes.entityType, entityId: tables.notes.entityId, body: tables.notes.body })
    .from(tables.notes)
    .where(and(inArray(tables.notes.entityType, ["contact", "company", "deal"]), ilike(tables.notes.body, likePattern(term, "contains"))))
    .orderBy(desc(tables.notes.createdAt))
    .limit(limit * 3);
  hits.notes = [];
  for (const kind of ["contact", "company", "deal"] as const) {
    const object = NOTE_OBJECTS[kind];
    if (!canReadField(policy, object, "id") || (kind === "deal" && !canReadField(policy, "deals", "name"))) continue;
    const list = hits[object];
    const have = list.map((r) => String(r.id));
    const wanted = [...new Set(notes.filter((n) => n.entityType === kind).map((n) => n.entityId))].slice(0, Math.max(0, limit - list.length));
    if (!wanted.length) continue;
    const table = NOTE_TABLES[kind] as typeof tables.deals;
    const rows = await db
      .select()
      .from(table)
      .where(have.length ? and(inArray(table.id, wanted), notInArray(table.id, have)) : inArray(table.id, wanted));
    for (const row of rows) {
      list.push(redact(policy, object, { ...row }));
      const note = notes.find((n) => n.entityType === kind && n.entityId === row.id)!;
      hits.notes.push({ entityType: kind, entityId: row.id, excerpt: excerptAround(note.body, term) });
    }
  }
}

/** About 80 characters of a note around the first place the words appear. */
export function excerptAround(body: string, term: string, width = 80): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  if (flat.length <= width || at < 0) return flat.length <= width ? flat : `${flat.slice(0, width)}…`;
  const start = Math.max(0, at - Math.floor((width - term.length) / 2));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
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

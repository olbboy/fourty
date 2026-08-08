import { and, eq, sql } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * The fact-field catalogue (ADR-018 §7): which fields a research pass may have
 * an opinion about, and which real column each one is.
 *
 * Every entry maps to a column in `src/db/schema.ts` and nothing else. **There
 * is no `employer` string field and there must never be one** — it would drift
 * from `companies` within a quarter. An employer observation is a `company_id`
 * fact, and it only becomes a link when it resolves to a company we already
 * have (see `resolveCompanyValue`).
 */

export const FACT_ENTITIES = ["contact", "company"] as const;
export type FactEntity = (typeof FACT_ENTITIES)[number];

export type FactFieldSpec = {
  /** The drizzle column key, which is also the field-permission field name. */
  column: string;
  /** What a rep sees above the suggestion. */
  label: string;
  /** A field holding another record's id rather than a value. */
  reference?: "company";
};

const CATALOGUE: Record<FactEntity, Record<string, FactFieldSpec>> = {
  contact: {
    job_title: { column: "jobTitle", label: "Job title" },
    company_id: { column: "companyId", label: "Company", reference: "company" },
    linkedin: { column: "linkedin", label: "LinkedIn" },
  },
  company: {
    linkedin: { column: "linkedin", label: "LinkedIn" },
  },
};

/** `cf:<customFieldId>` addresses a custom field; everything else is a column. */
export const CUSTOM_FIELD_PREFIX = "cf:";

export type ResolvedField =
  | { kind: "column"; entity: FactEntity; field: string; spec: FactFieldSpec }
  | { kind: "custom"; entity: FactEntity; field: string; defId: string; key: string; label: string };

/** The permission object name (`contacts` / `companies`) for an entity. */
export function permissionObject(entity: FactEntity): string {
  return entity === "contact" ? "contacts" : "companies";
}

/** The table a fact about `entity` writes to. */
export function tableFor(entity: FactEntity) {
  return entity === "contact" ? tables.contacts : tables.companies;
}

/**
 * Resolve a field name against the catalogue. Custom fields are looked up so a
 * `cf:` fact can never address a definition that does not exist, or one that
 * belongs to the other entity.
 */
export async function resolveField(entity: FactEntity, field: string): Promise<ResolvedField | null> {
  if (field.startsWith(CUSTOM_FIELD_PREFIX)) {
    const defId = field.slice(CUSTOM_FIELD_PREFIX.length);
    const [def] = await db
      .select()
      .from(tables.customFieldDefs)
      .where(and(eq(tables.customFieldDefs.id, defId), eq(tables.customFieldDefs.entity, entity)))
      .limit(1);
    if (!def) return null;
    return { kind: "custom", entity, field, defId, key: def.key, label: def.label };
  }
  const spec = CATALOGUE[entity]?.[field];
  return spec ? { kind: "column", entity, field, spec } : null;
}

/** Every field name a fact may address on `entity`, for error messages. */
export function knownFields(entity: FactEntity): string[] {
  return [...Object.keys(CATALOGUE[entity] ?? {}), `${CUSTOM_FIELD_PREFIX}<customFieldId>`];
}

/** The field-permission field name — the column, or the custom field's key. */
export function permissionField(resolved: ResolvedField): string {
  return resolved.kind === "column" ? resolved.spec.column : resolved.key;
}

export function fieldLabel(resolved: ResolvedField): string {
  return resolved.kind === "column" ? resolved.spec.label : resolved.label;
}

type TargetRow = { id: string; custom: string } & Record<string, unknown>;

/** Read the record a fact is about. Null when it is gone or in another tenant. */
export async function loadTarget(entity: FactEntity, id: string): Promise<TargetRow | null> {
  const table = tableFor(entity);
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return (row as TargetRow | undefined) ?? null;
}

/** What the record currently holds for this field — `null` when it is empty. */
export function currentValue(resolved: ResolvedField, row: TargetRow): string | null {
  const raw =
    resolved.kind === "column"
      ? row[resolved.spec.column]
      : (JSON.parse(row.custom) as Record<string, unknown>)[resolved.key];
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

/**
 * Write the field. Custom values live in the row's `custom` JSON blob, so they
 * are merged rather than replaced — a fact about one custom field must not drop
 * the others.
 */
export async function writeValue(
  resolved: ResolvedField,
  row: TargetRow,
  value: string | null,
): Promise<void> {
  const table = tableFor(resolved.entity);
  const patch: Record<string, unknown> =
    resolved.kind === "column"
      ? { [resolved.spec.column]: value }
      : {
          custom: JSON.stringify({
            ...(JSON.parse(row.custom) as Record<string, unknown>),
            [resolved.key]: value,
          }),
        };
  await db
    .update(table)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(table.id, row.id));
}

export type CompanyResolution =
  | { resolved: true; companyId: string }
  | { resolved: false; reason: string };

/**
 * Turn an employer observation into a `company_id`, or refuse.
 *
 * A wrong `company_id` is worse than an empty one, so v1 resolves an id we
 * already hold or an **exact domain match**, and nothing else. A name that looks
 * right is not a match: four people named Marchetti work at Fernhill, and
 * "Fernhill" alone does not say which Fernhill. An unresolved employer stays a
 * text proposal for a human, who settles it in three seconds.
 */
export async function resolveCompanyValue(value: string): Promise<CompanyResolution> {
  const trimmed = value.trim();
  const [byId] = await db
    .select({ id: tables.companies.id })
    .from(tables.companies)
    .where(eq(tables.companies.id, trimmed))
    .limit(1);
  if (byId) return { resolved: true, companyId: byId.id };

  const domain = normalizeDomain(trimmed);
  if (domain) {
    // Two rows sharing a domain is ambiguous, and picking one of them is how a
    // contact ends up attached to the wrong subsidiary. A human settles it.
    const matches = await db
      .select({ id: tables.companies.id })
      .from(tables.companies)
      .where(sql`lower(${tables.companies.domain}) = ${domain}`)
      .limit(2);
    if (matches.length === 1) return { resolved: true, companyId: matches[0].id };
    if (matches.length > 1) {
      return { resolved: false, reason: `More than one company uses ${domain}. A rep picks the right one.` };
    }
  }
  return {
    resolved: false,
    reason: domain
      ? `No company with domain ${domain}. A rep links this one.`
      : "An employer name is not a company link — only an exact domain match is.",
  };
}

/** `https://www.Fernhill.example/x` and `Fernhill.example` are the same domain. */
function normalizeDomain(value: string): string | null {
  const cleaned = value
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .trim();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned) ? cleaned : null;
}

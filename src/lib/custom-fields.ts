import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { applyCustomFieldValues, type FieldDef, type ValidateResult } from "./records";

export type CustomEntity = "contact" | "company" | "deal";

const CUSTOM_TABLE = {
  contact: tables.contacts,
  company: tables.companies,
  deal: tables.deals,
} as const;

export function isCustomEntity(v: string): v is CustomEntity {
  return v === "contact" || v === "company" || v === "deal";
}

export async function customFieldById(id: string) {
  return (await db.select().from(tables.customFieldDefs).where(eq(tables.customFieldDefs.id, id)).limit(1))[0];
}

export async function customFieldDefsOf(entity: CustomEntity): Promise<FieldDef[]> {
  const rows = await db
    .select()
    .from(tables.customFieldDefs)
    .where(eq(tables.customFieldDefs.entity, entity))
    .orderBy(asc(tables.customFieldDefs.order));
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    type: r.type as FieldDef["type"],
    options: JSON.parse(r.options) as string[],
    required: r.required === 1,
  }));
}

export function parseCustomBlob(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * The first validation error among an entity's existing `custom` blobs under a
 * prospective field set, or null when every record still validates.
 *
 * Same job as firstInvalidRecord for no-code objects: refuse a retype / newly
 * required field / narrowed select that would leave javascript: (or any other
 * invalid value) sitting in stored contacts, companies, or deals.
 */
export async function firstInvalidCustom(
  entity: CustomEntity,
  defs: FieldDef[],
): Promise<string | null> {
  const rows = await db.select({ custom: CUSTOM_TABLE[entity].custom }).from(CUSTOM_TABLE[entity]);
  for (const row of rows) {
    const check = applyCustomFieldValues(defs, parseCustomBlob(row.custom));
    if (!check.ok) return check.error;
  }
  return null;
}

/**
 * Coerce a `custom` blob against the entity's field defs. Leftover keys from
 * deleted defs stay — Settings delete says they remain in the record.
 */
export async function encodeCustom(
  entity: CustomEntity,
  input: Record<string, unknown>,
): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const result: ValidateResult = applyCustomFieldValues(await customFieldDefsOf(entity), input);
  if (!result.ok) return result;
  return { ok: true, json: JSON.stringify(result.data) };
}

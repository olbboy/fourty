import { and, asc, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "./id";
import { validateRecord, type FieldDef } from "./records";

/**
 * Shared access helpers for custom objects (Gate C1). Must run inside a
 * withWorkspace() context so RLS scopes every query to the active workspace.
 * Reused by the REST routes, GraphQL, and the MCP server so there is one path.
 */

export type CustomObject = typeof tables.customObjects.$inferSelect;

export async function listObjects(): Promise<CustomObject[]> {
  return db.select().from(tables.customObjects).orderBy(asc(tables.customObjects.nameSingular));
}

export async function objectByApiName(apiName: string): Promise<CustomObject | undefined> {
  return (
    await db
      .select()
      .from(tables.customObjects)
      .where(eq(tables.customObjects.apiName, apiName))
      .limit(1)
  )[0];
}

export async function objectById(id: string): Promise<CustomObject | undefined> {
  return (
    await db.select().from(tables.customObjects).where(eq(tables.customObjects.id, id)).limit(1)
  )[0];
}

/** Field definitions for an object, ordered, coerced to the runtime FieldDef shape. */
export async function fieldsOf(objectId: string): Promise<FieldDef[]> {
  const rows = await db
    .select()
    .from(tables.customObjectFields)
    .where(eq(tables.customObjectFields.objectId, objectId))
    .orderBy(asc(tables.customObjectFields.order));
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    type: r.type as FieldDef["type"],
    options: JSON.parse(r.options) as string[],
    required: r.required === 1,
  }));
}

/** Raw field rows (for management endpoints that expose ids/order). */
export function fieldRowsOf(objectId: string) {
  return db
    .select()
    .from(tables.customObjectFields)
    .where(eq(tables.customObjectFields.objectId, objectId))
    .orderBy(asc(tables.customObjectFields.order));
}

export async function fieldById(objectId: string, fieldId: string) {
  return (
    await db
      .select()
      .from(tables.customObjectFields)
      .where(
        and(
          eq(tables.customObjectFields.objectId, objectId),
          eq(tables.customObjectFields.id, fieldId),
        ),
      )
      .limit(1)
  )[0];
}

// ── Record CRUD (shared by REST routes, GraphQL, MCP) ───────────────────────

export type RecordRow = { id: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };

function shape(row: typeof tables.customRecords.$inferSelect): RecordRow {
  return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, data: JSON.parse(row.data) };
}

export async function listRecords(objectId: string, limit = 200): Promise<RecordRow[]> {
  const rows = await db
    .select()
    .from(tables.customRecords)
    .where(eq(tables.customRecords.objectId, objectId))
    .orderBy(desc(tables.customRecords.updatedAt))
    .limit(Math.min(limit, 500));
  return rows.map(shape);
}

export async function getRecord(objectId: string, id: string): Promise<RecordRow | undefined> {
  const row = (
    await db
      .select()
      .from(tables.customRecords)
      .where(and(eq(tables.customRecords.objectId, objectId), eq(tables.customRecords.id, id)))
      .limit(1)
  )[0];
  return row ? shape(row) : undefined;
}

export type RecordWrite = { ok: true; record: RecordRow } | { ok: false; error: string };

export async function createRecord(objectId: string, input: Record<string, unknown>): Promise<RecordWrite> {
  const validated = validateRecord(await fieldsOf(objectId), input);
  if (!validated.ok) return validated;
  const now = Date.now();
  const id = newId();
  await db.insert(tables.customRecords).values({
    id,
    objectId,
    data: JSON.stringify(validated.data),
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, record: { id, createdAt: now, updatedAt: now, data: validated.data } };
}

export async function updateRecord(
  objectId: string,
  id: string,
  input: Record<string, unknown>,
): Promise<RecordWrite | undefined> {
  const existing = await getRecord(objectId, id);
  if (!existing) return undefined;
  // Merge then validate the whole record so `required` holds across partial updates.
  const merged = { ...existing.data, ...input };
  const validated = validateRecord(await fieldsOf(objectId), merged);
  if (!validated.ok) return validated;
  const now = Date.now();
  await db
    .update(tables.customRecords)
    .set({ data: JSON.stringify(validated.data), updatedAt: now })
    .where(eq(tables.customRecords.id, id));
  return { ok: true, record: { id, createdAt: existing.createdAt, updatedAt: now, data: validated.data } };
}

export async function deleteRecord(objectId: string, id: string): Promise<boolean> {
  const existing = await getRecord(objectId, id);
  if (!existing) return false;
  await db.delete(tables.customRecords).where(eq(tables.customRecords.id, id));
  return true;
}

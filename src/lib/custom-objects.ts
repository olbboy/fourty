import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { audit } from "./audit";
import { logActivity } from "./activity";
import { newId } from "./id";
import { validateRecord, type FieldDef } from "./records";
export { recordTitle } from "./custom-object-display";

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

/**
 * The first validation error among an object's existing records under a
 * prospective field set, or null when every record still validates.
 *
 * Used to refuse a field-definition change (a retype, changed select options, or
 * a newly-required field) that would leave stored records invalid — including a
 * `javascript:` string left behind in a text field being retyped to `url`.
 * Writes are validated one record at a time (validateRecord runs on write), so
 * without this a definition change would silently keep stale or unsafe values
 * until each record's next edit.
 */
export async function firstInvalidRecord(
  objectId: string,
  defs: FieldDef[],
): Promise<string | null> {
  const rows = await db
    .select({ data: tables.customRecords.data })
    .from(tables.customRecords)
    .where(eq(tables.customRecords.objectId, objectId));
  for (const row of rows) {
    const check = validateRecord(defs, JSON.parse(row.data) as Record<string, unknown>);
    if (!check.ok) return check.error;
  }
  return null;
}

// ── Record CRUD (shared by REST routes, GraphQL, MCP) ───────────────────────

export type RecordRow = { id: string; createdAt: number; updatedAt: number; data: Record<string, unknown> };

function shape(row: typeof tables.customRecords.$inferSelect): RecordRow {
  return { id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, data: JSON.parse(row.data) };
}

export type ListRecordsOpts = { limit?: number; q?: string; sort?: string };

const LIST_DEFAULT = 200;
const LIST_MAX = 500;
/** Field keys are identifiers, not expressions — reject anything that isn't. */
const FIELD_SORT = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export async function listRecords(objectId: string, opts: ListRecordsOpts = {}): Promise<RecordRow[]> {
  const where: SQL[] = [eq(tables.customRecords.objectId, objectId)];
  const term = opts.q?.trim();
  if (term) {
    const pattern = `%${term.replace(/[%_]/g, "")}%`;
    where.push(ilike(tables.customRecords.data, pattern));
  }

  const rows = await db
    .select()
    .from(tables.customRecords)
    .where(and(...where))
    .orderBy(await orderFor(objectId, opts.sort))
    .limit(Math.min(Number(opts.limit) || LIST_DEFAULT, LIST_MAX));
  return rows.map(shape);
}

async function orderFor(objectId: string, sort: string | undefined): Promise<SQL> {
  if (sort === "createdAt") return desc(tables.customRecords.createdAt);
  if (!sort || sort === "updatedAt" || !FIELD_SORT.test(sort)) {
    return desc(tables.customRecords.updatedAt);
  }
  const field = (await fieldsOf(objectId)).find((f) => f.key === sort);
  if (!field) return desc(tables.customRecords.updatedAt);
  // Parameterised `->>` so a field key cannot become an expression.
  if (field.type === "number" || field.type === "date") {
    return sql`NULLIF(${tables.customRecords.data}::jsonb ->> ${sort}, '')::numeric`;
  }
  return sql`${tables.customRecords.data}::jsonb ->> ${sort}`;
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

/**
 * Who wrote, and how. Required so REST / GraphQL / MCP cannot skip the
 * timeline or audit that belongs on every custom-record mutation.
 */
export type RecordWriteCtx = {
  apiName: string;
  actorId?: string | null;
  meta?: Record<string, unknown>;
};

export async function createRecord(
  objectId: string,
  input: Record<string, unknown>,
  ctx: RecordWriteCtx,
): Promise<RecordWrite> {
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
  await logActivity({ type: "created", entityType: ctx.apiName, entityId: id, actorId: ctx.actorId });
  await audit(ctx.actorId, "record.created", {
    objectType: ctx.apiName,
    objectId: id,
    meta: ctx.meta,
  });
  return { ok: true, record: { id, createdAt: now, updatedAt: now, data: validated.data } };
}

export async function updateRecord(
  objectId: string,
  id: string,
  input: Record<string, unknown>,
  ctx: RecordWriteCtx,
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
  await logActivity({ type: "updated", entityType: ctx.apiName, entityId: id, actorId: ctx.actorId });
  await audit(ctx.actorId, "record.updated", {
    objectType: ctx.apiName,
    objectId: id,
    meta: ctx.meta,
  });
  return { ok: true, record: { id, createdAt: existing.createdAt, updatedAt: now, data: validated.data } };
}

export async function deleteRecord(objectId: string, id: string, ctx: RecordWriteCtx): Promise<boolean> {
  const existing = await getRecord(objectId, id);
  if (!existing) return false;
  await db.delete(tables.customRecords).where(eq(tables.customRecords.id, id));
  // notes and activities point at the record through a polymorphic key, so
  // the database cannot cascade this for us.
  await db
    .delete(tables.notes)
    .where(and(eq(tables.notes.entityType, ctx.apiName), eq(tables.notes.entityId, id)));
  await db
    .delete(tables.tasks)
    .where(and(eq(tables.tasks.entityType, ctx.apiName), eq(tables.tasks.entityId, id)));
  await db
    .delete(tables.activities)
    .where(and(eq(tables.activities.entityType, ctx.apiName), eq(tables.activities.entityId, id)));
  await audit(ctx.actorId, "record.deleted", {
    objectType: ctx.apiName,
    objectId: id,
    meta: ctx.meta,
  });
  return true;
}

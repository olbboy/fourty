import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";

/**
 * The Trash (D3, CONTEXT.md). Deleting a contact, company, deal or task copies
 * the row, its notes, its timeline and what it was detached from into `trash`,
 * then removes it from its own table exactly as a delete always did. Restoring
 * copies it back. Nothing else in the app has to know deleted rows exist: they
 * are simply not in the tables every list, report and search reads.
 *
 * Runs inside the caller's workspace transaction (RLS scopes every statement).
 */

export type TrashKind = "contact" | "company" | "deal" | "task";

/** The RBAC object a kind of record belongs to (restoring needs "create" on it). */
export const TRASH_OBJECT: Record<TrashKind, "contacts" | "companies" | "deals" | "tasks"> = {
  contact: "contacts",
  company: "companies",
  deal: "deals",
  task: "tasks",
};

export const TRASH_DAYS = 30;
const TRASH_MS = TRASH_DAYS * 86_400_000;

type Row = Record<string, unknown>;
type Payload = {
  record: Row;
  notes: Row[];
  activities: Row[];
  /** Deal contact rows this record was part of (as the deal, or as the contact). */
  dealContacts?: Row[];
  /** A deal's Line items. */
  dealLines?: Row[];
  /** Its tasks not yet done (Q113): no reminder for a record that is gone. Done ones stay as history. */
  openTasks?: Row[];
  /** Ids this record was unhooked from on delete, re-hooked on restore when still free. */
  detached: { contacts?: string[]; deals?: string[] };
};

export type TrashItem = {
  id: string;
  entityType: TrashKind;
  entityId: string;
  label: string;
  deletedBy: string | null;
  deletedAt: number;
  expiresAt: number;
};

const tableOf = (kind: TrashKind) =>
  ({ contact: tables.contacts, company: tables.companies, deal: tables.deals, task: tables.tasks })[kind];

function labelOf(kind: TrashKind, row: Row): string {
  if (kind === "contact") {
    const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
    return name || String(row.email ?? row.id);
  }
  return String((kind === "task" ? row.title : row.name) ?? row.id);
}

/**
 * Delete a record by moving it to the Trash. Returns false when there is no
 * such record. Notes, timeline and tasks not yet done go with it; a company's
 * contacts and deals are detached (kept, with no company), remembered so a
 * restore re-attaches them.
 */
export async function trashRecord(kind: TrashKind, id: string, deletedBy: string | null): Promise<boolean> {
  const table = tableOf(kind);
  const record = (await db.select().from(table).where(eq(table.id, id)).limit(1))[0] as Row | undefined;
  if (!record) return false;

  const hasTimeline = kind !== "task";
  const notes = hasTimeline ? await db.select().from(tables.notes).where(eq(tables.notes.entityId, id)) : [];
  const activities = hasTimeline ? await db.select().from(tables.activities).where(eq(tables.activities.entityId, id)) : [];
  const linkColumn = kind === "deal" ? tables.dealContacts.dealId : kind === "contact" ? tables.dealContacts.contactId : null;
  const dealContacts = linkColumn ? await db.select().from(tables.dealContacts).where(eq(linkColumn, id)) : [];
  const dealLines = kind === "deal" ? await db.select().from(tables.dealLines).where(eq(tables.dealLines.dealId, id)) : [];
  const openTaskWhere = and(eq(tables.tasks.entityType, kind), eq(tables.tasks.entityId, id), isNull(tables.tasks.completedAt));
  const openTasks = hasTimeline ? await db.select().from(tables.tasks).where(openTaskWhere) : [];
  const detached: Payload["detached"] = {};
  if (kind === "company") {
    detached.contacts = (await db.select({ id: tables.contacts.id }).from(tables.contacts).where(eq(tables.contacts.companyId, id))).map((r) => r.id);
    detached.deals = (await db.select({ id: tables.deals.id }).from(tables.deals).where(eq(tables.deals.companyId, id))).map((r) => r.id);
  }

  const payload: Payload = { record, notes, activities, dealContacts, dealLines, openTasks, detached };
  await db.insert(tables.trash).values({
    id: newId(),
    entityType: kind,
    entityId: id,
    label: labelOf(kind, record),
    payload: JSON.stringify(payload),
    deletedBy,
    deletedAt: Date.now(),
  });

  await db.delete(table).where(eq(table.id, id));
  if (linkColumn) await db.delete(tables.dealContacts).where(eq(linkColumn, id));
  // Quotes stay where they are: their numbers are never reused, and a restored
  // deal finds them again. Purging the deal for good drops them (below).
  if (kind === "deal") await db.delete(tables.dealLines).where(eq(tables.dealLines.dealId, id));
  if (openTasks.length) await db.delete(tables.tasks).where(openTaskWhere);
  if (kind === "company") {
    await db.update(tables.contacts).set({ companyId: null }).where(eq(tables.contacts.companyId, id));
    await db.update(tables.deals).set({ companyId: null }).where(eq(tables.deals.companyId, id));
  }
  if (hasTimeline) {
    // notes and activities point at the record through a polymorphic key, so
    // the database cannot cascade this for us.
    await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
    await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
  }
  return true;
}

/** A deal gone for good takes its quotes with it. */
async function dropQuotesOf(items: { entityType: string; entityId: string }[]): Promise<void> {
  const deals = items.filter((i) => i.entityType === "deal").map((i) => i.entityId);
  if (deals.length) await db.delete(tables.quotes).where(inArray(tables.quotes.dealId, deals));
}

/**
 * Drop what has waited longer than 30 days. The worker runs it for every
 * workspace each minute, so a deleted record's copy does not outlive its 30
 * days in a workspace where nobody opens the Trash; reading the Trash runs it
 * too, so nothing expired shows while the worker lags.
 */
export async function purgeExpiredTrash(now = Date.now()): Promise<void> {
  const gone = await db
    .delete(tables.trash)
    .where(lt(tables.trash.deletedAt, now - TRASH_MS))
    .returning({ entityType: tables.trash.entityType, entityId: tables.trash.entityId });
  await dropQuotesOf(gone);
}

/** What is in the Trash, most recently deleted first. */
export async function listTrash(): Promise<TrashItem[]> {
  await purgeExpiredTrash();
  const rows = await db.select().from(tables.trash).orderBy(sql`${tables.trash.deletedAt} desc`);
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType as TrashKind,
    entityId: r.entityId,
    label: r.label,
    deletedBy: r.deletedBy,
    deletedAt: r.deletedAt,
    expiresAt: r.deletedAt + TRASH_MS,
  }));
}

export async function trashItem(trashId: string): Promise<TrashItem | undefined> {
  return (await listTrash()).find((item) => item.id === trashId);
}

export type RestoreResult =
  | { ok: true; entityType: TrashKind; entityId: string }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Put a trashed record back with its notes, timeline and open tasks. A contact whose email
 * another contact took meanwhile is refused (409). A deal whose stage was
 * removed meanwhile lands in its pipeline's first open stage (or the default
 * pipeline's, if that is gone too).
 */
export async function restoreTrash(trashId: string): Promise<RestoreResult> {
  await purgeExpiredTrash();
  const item = (await db.select().from(tables.trash).where(eq(tables.trash.id, trashId)).limit(1))[0];
  if (!item) return { ok: false, status: 404, error: "Not in the trash" };
  const kind = item.entityType as TrashKind;
  const payload = JSON.parse(item.payload) as Payload;
  const record = { ...payload.record };

  if (kind === "contact" && typeof record.email === "string" && record.email) {
    const taken = await db.select({ id: tables.contacts.id }).from(tables.contacts).where(eq(tables.contacts.email, record.email)).limit(1);
    if (taken.length) return { ok: false, status: 409, error: "Another contact has this email now" };
  }
  if (kind === "deal") Object.assign(record, await placeForDeal(record));

  const table = tableOf(kind);
  await db.insert(table).values(record as never);
  if (payload.notes.length) await db.insert(tables.notes).values(payload.notes as never).onConflictDoNothing();
  if (payload.activities.length) await db.insert(tables.activities).values(payload.activities as never).onConflictDoNothing();
  await restoreDealContacts(payload.dealContacts ?? []);
  if (payload.dealLines?.length) await db.insert(tables.dealLines).values(payload.dealLines as never).onConflictDoNothing();
  if (payload.openTasks?.length) await db.insert(tables.tasks).values(payload.openTasks as never).onConflictDoNothing();
  if (kind === "company") {
    const id = item.entityId;
    if (payload.detached.contacts?.length) {
      await db
        .update(tables.contacts)
        .set({ companyId: id })
        .where(and(inArray(tables.contacts.id, payload.detached.contacts), isNull(tables.contacts.companyId)));
    }
    if (payload.detached.deals?.length) {
      await db
        .update(tables.deals)
        .set({ companyId: id })
        .where(and(inArray(tables.deals.id, payload.detached.deals), isNull(tables.deals.companyId)));
    }
  }
  await db.delete(tables.trash).where(eq(tables.trash.id, trashId));
  return { ok: true, entityType: kind, entityId: item.entityId };
}

/** Put back the deal-contact links whose deal and contact both still exist. */
async function restoreDealContacts(rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const dealIds = [...new Set(rows.map((r) => String(r.dealId)))];
  const contactIds = [...new Set(rows.map((r) => String(r.contactId)))];
  const deals = new Set((await db.select({ id: tables.deals.id }).from(tables.deals).where(inArray(tables.deals.id, dealIds))).map((r) => r.id));
  const contacts = new Set(
    (await db.select({ id: tables.contacts.id }).from(tables.contacts).where(inArray(tables.contacts.id, contactIds))).map((r) => r.id),
  );
  const alive = rows.filter((r) => deals.has(String(r.dealId)) && contacts.has(String(r.contactId)));
  if (alive.length) await db.insert(tables.dealContacts).values(alive as never).onConflictDoNothing();
}

/** A deal's stage and pipeline as they can be restored now. */
async function placeForDeal(record: Row): Promise<Row> {
  const stage = (
    await db.select().from(tables.stages).where(eq(tables.stages.id, String(record.stageId))).limit(1)
  )[0];
  if (stage) return {};
  const firstOpen = async (pipelineId: string) =>
    (
      await db
        .select()
        .from(tables.stages)
        .where(and(eq(tables.stages.pipelineId, pipelineId), eq(tables.stages.type, "open")))
        .orderBy(asc(tables.stages.order))
        .limit(1)
    )[0];
  let target: Awaited<ReturnType<typeof firstOpen>> | undefined = await firstOpen(String(record.pipelineId));
  if (!target) {
    const fallback = (await db.select().from(tables.pipelines).orderBy(sql`${tables.pipelines.isDefault} desc`).limit(1))[0];
    target = fallback ? await firstOpen(fallback.id) : undefined;
  }
  return target ? { stageId: target.id, pipelineId: target.pipelineId, stageEnteredAt: Date.now(), closedAt: null } : {};
}

/** Remove a trashed record for good. */
export async function purgeTrash(trashId: string): Promise<boolean> {
  const gone = await db
    .delete(tables.trash)
    .where(eq(tables.trash.id, trashId))
    .returning({ entityType: tables.trash.entityType, entityId: tables.trash.entityId });
  await dropQuotesOf(gone);
  return gone.length > 0;
}

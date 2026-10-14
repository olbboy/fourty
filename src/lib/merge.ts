import { and, eq, inArray } from "drizzle-orm";
import { getAssignee } from "@/lib/actions/assignees";
import { db, tables } from "@/db";
import { blockedWrites, type FieldPolicy } from "@/lib/field-permissions";
import { trashRecord } from "@/lib/trash";

/**
 * Merge (CONTEXT.md): fold a duplicate contact or company into the one that
 * stays. Runs inside the caller's workspace transaction, after the caller has
 * checked both records exist and may be changed: nothing here refuses, so a
 * merge never stops half-way.
 */

type Row = Record<string, unknown>;
const blank = (v: unknown) => v === null || v === undefined || v === "";

/**
 * The fields of `keep` that are empty and filled on `dupe`, limited to those
 * the caller may write. Custom values are filled key by key the same way, and
 * tags (lists) are joined, so neither record's tags are lost. An owner is
 * taken over only while they are still a member.
 */
async function fillFrom(keep: Row, dupe: Row, fields: string[], object: "contacts" | "companies", policy: FieldPolicy | null): Promise<Row> {
  const writable = fields.filter((f) => blockedWrites(policy, object, [f]).length === 0);
  const patch: Row = {};
  for (const field of writable) if (blank(keep[field]) && !blank(dupe[field])) patch[field] = dupe[field];
  if (typeof patch.ownerId === "string" && !(await getAssignee(patch.ownerId))) delete patch.ownerId;
  if (blockedWrites(policy, object, ["custom"]).length === 0) {
    const mine = JSON.parse(String(keep.custom || "{}")) as Row;
    const theirs = JSON.parse(String(dupe.custom || "{}")) as Row;
    const merged: Row = { ...mine };
    for (const [key, value] of Object.entries(theirs)) {
      if (blank(value)) continue;
      if (blank(mine[key])) merged[key] = value;
      else if (Array.isArray(mine[key]) && Array.isArray(value)) merged[key] = [...new Set([...(mine[key] as unknown[]), ...value])];
    }
    if (JSON.stringify(merged) !== JSON.stringify(mine)) patch.custom = JSON.stringify(merged);
  }
  return patch;
}

/** Point the polymorphic rows (tasks, notes, timeline, agent work, facts) of one record at another. */
async function repoint(entityType: "contact" | "company", from: string, to: string): Promise<void> {
  for (const table of [tables.tasks, tables.notes, tables.activities, tables.agentTasks, tables.recordFacts, tables.aiConversations] as const) {
    const t = table as typeof tables.notes;
    await db.update(t).set({ entityId: to }).where(and(eq(t.entityType, entityType), eq(t.entityId, from)));
  }
}

const CONTACT_FIELDS = ["email", "phone", "jobTitle", "companyId", "source", "linkedin", "city", "country", "ownerId"];

/** Fold contact `dupeId` into `keepId`; returns the fields filled in. */
export async function mergeContacts(keep: Row, dupe: Row, policy: FieldPolicy | null, actorId: string | null): Promise<string[]> {
  const keepId = String(keep.id);
  const dupeId = String(dupe.id);
  const patch = await fillFrom(keep, dupe, CONTACT_FIELDS, "contacts", policy);
  // An email moves rather than repeats: free it on the duplicate first.
  if ("email" in patch) await db.update(tables.contacts).set({ email: null }).where(eq(tables.contacts.id, dupeId));
  if (Object.keys(patch).length) await db.update(tables.contacts).set({ ...patch, updatedAt: Date.now() }).where(eq(tables.contacts.id, keepId));

  await db.update(tables.deals).set({ contactId: keepId }).where(eq(tables.deals.contactId, dupeId));
  // Where the one that stays just became the primary contact, it is no
  // longer one of the deal's other people as well.
  const nowPrimary = db.select({ id: tables.deals.id }).from(tables.deals).where(eq(tables.deals.contactId, keepId));
  await db.delete(tables.dealContacts).where(and(eq(tables.dealContacts.contactId, keepId), inArray(tables.dealContacts.dealId, nowPrimary)));
  // A role on a deal moves over unless the one that stays is already on it.
  const roles = await db.select().from(tables.dealContacts).where(eq(tables.dealContacts.contactId, dupeId));
  if (roles.length) {
    const dealIds = roles.map((r) => r.dealId);
    const primaryOf = new Map(
      (await db.select({ id: tables.deals.id, contactId: tables.deals.contactId }).from(tables.deals).where(inArray(tables.deals.id, dealIds))).map(
        (d) => [d.id, d.contactId],
      ),
    );
    const alreadyOn = new Set(
      (
        await db
          .select({ dealId: tables.dealContacts.dealId })
          .from(tables.dealContacts)
          .where(and(eq(tables.dealContacts.contactId, keepId), inArray(tables.dealContacts.dealId, dealIds)))
      ).map((r) => r.dealId),
    );
    for (const role of roles) {
      if (primaryOf.get(role.dealId) === keepId || alreadyOn.has(role.dealId)) {
        await db.delete(tables.dealContacts).where(eq(tables.dealContacts.id, role.id));
      } else {
        await db.update(tables.dealContacts).set({ contactId: keepId }).where(eq(tables.dealContacts.id, role.id));
      }
    }
  }
  await repoint("contact", dupeId, keepId);
  await db.update(tables.emailMessages).set({ contactId: keepId }).where(eq(tables.emailMessages.contactId, dupeId));
  await db.update(tables.calendarEvents).set({ contactId: keepId }).where(eq(tables.calendarEvents.contactId, dupeId));
  await trashRecord("contact", dupeId, actorId);
  return Object.keys(patch);
}

const COMPANY_FIELDS = ["domain", "industry", "size", "website", "linkedin", "city", "country", "annualRevenue", "ownerId"];

/** Fold company `dupeId` into `keepId`; returns the fields filled in. */
export async function mergeCompanies(keep: Row, dupe: Row, policy: FieldPolicy | null, actorId: string | null): Promise<string[]> {
  const keepId = String(keep.id);
  const dupeId = String(dupe.id);
  const patch = await fillFrom(keep, dupe, COMPANY_FIELDS, "companies", policy);
  if (Object.keys(patch).length) await db.update(tables.companies).set({ ...patch, updatedAt: Date.now() }).where(eq(tables.companies.id, keepId));
  await db.update(tables.contacts).set({ companyId: keepId }).where(eq(tables.contacts.companyId, dupeId));
  await db.update(tables.deals).set({ companyId: keepId }).where(eq(tables.deals.companyId, dupeId));
  await repoint("company", dupeId, keepId);
  await trashRecord("company", dupeId, actorId);
  return Object.keys(patch);
}

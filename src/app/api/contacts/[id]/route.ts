import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { audit } from "@/lib/audit";
import { dispatchEvent } from "@/lib/workflows/engine";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { contactPatch } from "@/lib/validators";
import { loadFieldPolicy, redact, blockedWrites } from "@/lib/field-permissions";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const { id } = await params;
  const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
  if (!row) return apiError("Contact not found", 404);
  const policy = await loadFieldPolicy(auth.role);
  return json({ contact: redact(policy, "contacts", { ...row, custom: JSON.parse(row.custom) }) });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "contacts", "update");
  if (denied) return denied;
  const { id } = await params;
  const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
  if (!existing) return apiError("Contact not found", 404);

  const body = await parseBody(req, contactPatch);
  if (!body.ok) return body.response;

  const policy = await loadFieldPolicy(auth.role);
  const blocked = blockedWrites(policy, "contacts", body.keys);
  if (blocked.length) return apiError(`Not permitted to set field(s): ${blocked.join(", ")}`, 403);

  const { custom, ...fields } = body.data;
  const changed = Object.keys(fields).filter(
    (k) => (fields as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k],
  );
  await db.update(tables.contacts)
    .set({
      ...fields,
      ...(custom !== undefined
        ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
        : {}),
      updatedAt: Date.now(),
    })
    .where(eq(tables.contacts.id, id));

  if (changed.length > 0 || custom !== undefined) {
    await logActivity({
      type: "updated",
      entityType: "contact",
      entityId: id,
      actorId: auth.user?.id,
      meta: { fields: changed },
    });
  }
  await recomputeContactScore(id);
  await audit(auth.user?.id, "contact.updated", { objectType: "contact", objectId: id, meta: { fields: changed } });
  const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!;
  await dispatchEvent({
    event: "contact.updated",
    entityType: "contact",
    entityId: id,
    snapshot: { ...row, custom: undefined, changedFields: changed.join(",") },
  });
  return json({ contact: redact(policy, "contacts", { ...row, custom: JSON.parse(row.custom) }) });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "contacts", "delete");
  if (denied) return denied;
  const { id } = await params;
  const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
  if (!existing) return apiError("Contact not found", 404);
  await db.delete(tables.contacts).where(eq(tables.contacts.id, id));
  await db.delete(tables.notes)
    .where(eq(tables.notes.entityId, id));
  await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
  await audit(auth.user?.id, "contact.deleted", { objectType: "contact", objectId: id });
  return json({ ok: true });
  });
}

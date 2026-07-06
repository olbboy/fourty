import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { contactPatch } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).get();
  if (!row) return apiError("Contact not found", 404);
  return json({ contact: { ...row, custom: JSON.parse(row.custom) } });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).get();
  if (!existing) return apiError("Contact not found", 404);

  const body = await parseBody(req, contactPatch);
  if (!body.ok) return body.response;

  const { custom, ...fields } = body.data;
  const changed = Object.keys(fields).filter(
    (k) => (fields as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k],
  );
  db.update(tables.contacts)
    .set({
      ...fields,
      ...(custom !== undefined
        ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
        : {}),
      updatedAt: Date.now(),
    })
    .where(eq(tables.contacts.id, id))
    .run();

  if (changed.length > 0 || custom !== undefined) {
    logActivity({
      type: "updated",
      entityType: "contact",
      entityId: id,
      actorId: auth.user?.id,
      meta: { fields: changed },
    });
  }
  recomputeContactScore(id);
  const row = db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).get()!;
  dispatchEvent({
    event: "contact.updated",
    entityType: "contact",
    entityId: id,
    snapshot: { ...row, custom: undefined, changedFields: changed.join(",") },
  });
  return json({ contact: { ...row, custom: JSON.parse(row.custom) } });
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).get();
  if (!existing) return apiError("Contact not found", 404);
  db.delete(tables.contacts).where(eq(tables.contacts.id, id)).run();
  db.delete(tables.notes)
    .where(eq(tables.notes.entityId, id))
    .run();
  db.delete(tables.activities).where(eq(tables.activities.entityId, id)).run();
  return json({ ok: true });
}

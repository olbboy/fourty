import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { companyPatch } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
  if (!row) return apiError("Company not found", 404);
  return json({ company: { ...row, custom: JSON.parse(row.custom) } });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
  if (!existing) return apiError("Company not found", 404);

  const body = await parseBody(req, companyPatch);
  if (!body.ok) return body.response;
  const { custom, ...fields } = body.data;
  const changed = Object.keys(fields).filter(
    (k) => (fields as Record<string, unknown>)[k] !== (existing as Record<string, unknown>)[k],
  );
  await db.update(tables.companies)
    .set({
      ...fields,
      ...(custom !== undefined
        ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
        : {}),
      updatedAt: Date.now(),
    })
    .where(eq(tables.companies.id, id));
  if (changed.length > 0 || custom !== undefined) {
    await logActivity({
      type: "updated",
      entityType: "company",
      entityId: id,
      actorId: auth.user?.id,
      meta: { fields: changed },
    });
  }
  const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!;
  return json({ company: { ...row, custom: JSON.parse(row.custom) } });
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
  if (!existing) return apiError("Company not found", 404);
  await db.delete(tables.companies).where(eq(tables.companies.id, id));
  // detach children rather than cascade-delete
  await db.update(tables.contacts)
    .set({ companyId: null })
    .where(eq(tables.contacts.companyId, id));
  await db.update(tables.deals).set({ companyId: null }).where(eq(tables.deals.companyId, id));
  await db.delete(tables.notes).where(eq(tables.notes.entityId, id));
  await db.delete(tables.activities).where(eq(tables.activities.entityId, id));
  return json({ ok: true });
}

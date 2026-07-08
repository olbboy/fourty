import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { objectById, fieldRowsOf } from "@/lib/custom-objects";

type Params = { params: Promise<{ id: string }> };

const patch = z.object({
  nameSingular: z.string().min(1).max(60).optional(),
  namePlural: z.string().min(1).max(60).optional(),
  icon: z.string().max(40).optional(),
  description: z.string().max(500).nullable().optional(),
});

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async () => {
    const { id } = await params;
    const object = await objectById(id);
    if (!object) return apiError("Object not found", 404);
    const fields = (await fieldRowsOf(id)).map((f) => ({ ...f, options: JSON.parse(f.options) }));
    return json({ object, fields });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-objects", "update");
    if (denied) return denied;
    const { id } = await params;
    const object = await objectById(id);
    if (!object) return apiError("Object not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    await db.update(tables.customObjects).set(body.data).where(eq(tables.customObjects.id, id));
    await audit(auth.user?.id, "custom_object.updated", { objectType: "custom_object", objectId: id });
    const row = (
      await db.select().from(tables.customObjects).where(eq(tables.customObjects.id, id)).limit(1)
    )[0]!;
    return json({ object: row });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-objects", "delete");
    if (denied) return denied;
    const { id } = await params;
    const object = await objectById(id);
    if (!object) return apiError("Object not found", 404);
    // Drop the object with its fields and every record (all workspace-scoped).
    await db.delete(tables.customRecords).where(eq(tables.customRecords.objectId, id));
    await db.delete(tables.customObjectFields).where(eq(tables.customObjectFields.objectId, id));
    await db.delete(tables.customObjects).where(eq(tables.customObjects.id, id));
    await audit(auth.user?.id, "custom_object.deleted", { objectType: "custom_object", objectId: id });
    return json({ ok: true });
  });
}

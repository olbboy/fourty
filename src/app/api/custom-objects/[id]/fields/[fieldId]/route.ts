import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { fieldById } from "@/lib/custom-objects";

type Params = { params: Promise<{ id: string; fieldId: string }> };

const patch = z.object({
  label: z.string().min(1).max(120).optional(),
  type: z.enum(["text", "number", "date", "select", "checkbox", "url"]).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-objects", "update");
    if (denied) return denied;
    const { id, fieldId } = await params;
    if (!(await fieldById(id, fieldId))) return apiError("Field not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    const { options, order, required, ...rest } = body.data;
    await db
      .update(tables.customObjectFields)
      .set({
        ...rest,
        ...(options !== undefined ? { options: JSON.stringify(options) } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(required !== undefined ? { required: required ? 1 : 0 } : {}),
      })
      .where(eq(tables.customObjectFields.id, fieldId));
    await audit(auth.user?.id, "custom_object_field.updated", { objectType: "custom_object", objectId: id });
    return json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-objects", "update");
    if (denied) return denied;
    const { id, fieldId } = await params;
    if (!(await fieldById(id, fieldId))) return apiError("Field not found", 404);
    await db
      .delete(tables.customObjectFields)
      .where(
        and(
          eq(tables.customObjectFields.objectId, id),
          eq(tables.customObjectFields.id, fieldId),
        ),
      );
    await audit(auth.user?.id, "custom_object_field.deleted", { objectType: "custom_object", objectId: id });
    return json({ ok: true });
  });
}

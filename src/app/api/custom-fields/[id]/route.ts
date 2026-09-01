import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  customFieldById,
  customFieldDefsOf,
  firstInvalidCustom,
  isCustomEntity,
} from "@/lib/custom-fields";
import { fieldChangeInvalidMessage, patchedFieldDefs } from "@/lib/field-def-guard";

type Params = { params: Promise<{ id: string }> };

const patch = z.object({
  label: z.string().min(1).max(120).optional(),
  type: z.enum(["text", "number", "date", "select", "checkbox", "url"]).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-fields", "update");
    if (denied) return denied;
    const { id } = await params;
    const field = await customFieldById(id);
    if (!field) return apiError("Field not found", 404);
    if (!isCustomEntity(field.entity)) return apiError("Field not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    const { options, order, required, ...rest } = body.data;

    // Changing how a field validates must not leave existing custom blobs
    // invalid — including a javascript: value stranded in a text field being
    // retyped to url. Refuse the change; the caller fixes the records first.
    if (body.data.type !== undefined || options !== undefined || required !== undefined) {
      const nextDefs = patchedFieldDefs(await customFieldDefsOf(field.entity), field.key, {
        type: body.data.type,
        options,
        required,
      });
      const invalid = await firstInvalidCustom(field.entity, nextDefs);
      if (invalid) {
        return json({ error: fieldChangeInvalidMessage(invalid) }, { status: 409 });
      }
    }

    await db
      .update(tables.customFieldDefs)
      .set({
        ...rest,
        ...(options !== undefined ? { options: JSON.stringify(options) } : {}),
        ...(order !== undefined ? { order } : {}),
        ...(required !== undefined ? { required: required ? 1 : 0 } : {}),
      })
      .where(eq(tables.customFieldDefs.id, id));
    await audit(auth.user?.id, "custom_field.updated", { objectType: "custom_field", objectId: id });
    return json({ ok: true });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "custom-fields", "delete");
  if (denied) return denied;
  const { id } = await params;
  const existing = (await db
    .select()
    .from(tables.customFieldDefs)
    .where(eq(tables.customFieldDefs.id, id))
    .limit(1))[0];
  if (!existing) return apiError("Field not found", 404);
  await db.delete(tables.customFieldDefs).where(eq(tables.customFieldDefs.id, id));
  await audit(auth.user?.id, "custom_field.deleted", { objectType: "custom_field", objectId: id });
  return json({ ok: true });
  });
}

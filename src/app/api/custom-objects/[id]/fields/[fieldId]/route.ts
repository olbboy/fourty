import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";
import { fieldById, fieldsOf, firstInvalidRecord } from "@/lib/custom-objects";
import { fieldChangeInvalidMessage, patchedFieldDefs } from "@/lib/field-def-guard";

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
    const field = await fieldById(id, fieldId);
    if (!field) return apiError("Field not found", 404);
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    const { options, order, required, ...rest } = body.data;

    // Changing how a field validates (its type, select options, or required flag)
    // must not leave existing records invalid — including a `javascript:` value
    // stranded in a text field being retyped to `url`. Refuse the change when any
    // stored record would break, rather than mutating data silently; the caller
    // fixes the offending records first.
    if (body.data.type !== undefined || options !== undefined || required !== undefined) {
      const nextDefs = patchedFieldDefs(await fieldsOf(id), field.key, {
        type: body.data.type,
        options,
        required,
      });
      const invalid = await firstInvalidRecord(id, nextDefs);
      if (invalid) {
        return json({ error: fieldChangeInvalidMessage(invalid) }, { status: 409 });
      }
    }

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

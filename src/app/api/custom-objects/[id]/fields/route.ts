import { z } from "zod";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";
import { API_NAME_RE } from "@/lib/records";
import { objectById, fieldRowsOf } from "@/lib/custom-objects";

type Params = { params: Promise<{ id: string }> };

const input = z.object({
  key: z.string().min(1).max(60).regex(API_NAME_RE, "lowercase letters, digits, underscores; must start with a letter"),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "number", "date", "select", "checkbox", "url"]).default("text"),
  options: z.array(z.string()).optional().default([]),
  required: z.boolean().optional().default(false),
});

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async () => {
    const { id } = await params;
    if (!(await objectById(id))) return apiError("Object not found", 404);
    const fields = (await fieldRowsOf(id)).map((f) => ({ ...f, options: JSON.parse(f.options) }));
    return json({ fields });
  });
}

export async function POST(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "custom-objects", "update");
    if (denied) return denied;
    const { id } = await params;
    if (!(await objectById(id))) return apiError("Object not found", 404);
    const body = await parseBody(req, input);
    if (!body.ok) return body.response;
    const existing = await fieldRowsOf(id);
    if (existing.some((f) => f.key === body.data.key)) {
      return json({ error: "A field with this key already exists" }, { status: 409 });
    }
    const fieldId = newId();
    await db.insert(tables.customObjectFields).values({
      id: fieldId,
      objectId: id,
      key: body.data.key,
      label: body.data.label,
      type: body.data.type,
      options: JSON.stringify(body.data.options),
      required: body.data.required ? 1 : 0,
      order: existing.length,
      createdAt: Date.now(),
    });
    await audit(auth.user?.id, "custom_object_field.created", { objectType: "custom_object", objectId: id });
    return json({ field: { ...body.data, id: fieldId, objectId: id } }, { status: 201 });
  });
}

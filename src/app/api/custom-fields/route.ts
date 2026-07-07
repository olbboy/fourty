import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";
import { audit } from "@/lib/audit";

const input = z.object({
  entity: z.enum(["contact", "company", "deal"]),
  key: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "lowercase letters, digits, underscores; must start with a letter"),
  label: z.string().min(1).max(120),
  type: z.enum(["text", "number", "date", "select", "checkbox", "url"]).default("text"),
  options: z.array(z.string()).optional().default([]),
  required: z.boolean().optional().default(false),
});

export async function GET(req: Request) {
  return withAuth(req, async (auth) => {
  const entity = new URL(req.url).searchParams.get("entity");
  const rows = await db
    .select()
    .from(tables.customFieldDefs)
    .where(entity ? eq(tables.customFieldDefs.entity, entity) : undefined)
    .orderBy(asc(tables.customFieldDefs.order));
  return json({ fields: rows.map((r) => ({ ...r, options: JSON.parse(r.options) })) });
  });
}

export async function POST(req: Request) {
  return withAuth(req, async (auth) => {
  const denied = authorize(auth, "custom-fields", "create");
  if (denied) return denied;
  const body = await parseBody(req, input);
  if (!body.ok) return body.response;
  const existing = await db
    .select()
    .from(tables.customFieldDefs)
    .where(eq(tables.customFieldDefs.entity, body.data.entity));
  if (existing.some((f) => f.key === body.data.key)) {
    return json({ error: "A field with this key already exists" }, { status: 409 });
  }
  const id = newId();
  await db.insert(tables.customFieldDefs)
    .values({
      id,
      entity: body.data.entity,
      key: body.data.key,
      label: body.data.label,
      type: body.data.type,
      options: JSON.stringify(body.data.options),
      required: body.data.required ? 1 : 0,
      order: existing.length,
      createdAt: Date.now(),
    });
  await audit(auth.user?.id, "custom_field.created", { objectType: "custom_field", objectId: id });
  const row = (await db
    .select()
    .from(tables.customFieldDefs)
    .where(eq(tables.customFieldDefs.id, id))
    .limit(1))[0]!;
  return json({ field: { ...row, options: JSON.parse(row.options) } }, { status: 201 });
  });
}

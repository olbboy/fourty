import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

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

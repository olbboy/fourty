import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = db
    .select()
    .from(tables.customFieldDefs)
    .where(eq(tables.customFieldDefs.id, id))
    .get();
  if (!existing) return apiError("Field not found", 404);
  db.delete(tables.customFieldDefs).where(eq(tables.customFieldDefs.id, id)).run();
  return json({ ok: true });
}

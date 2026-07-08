import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { withAuth, authorize, json, apiError, parseBody } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const patch = z.object({
  name: z.string().min(1).max(80).optional(),
  config: z
    .object({
      filters: z.record(z.string(), z.unknown()).optional(),
      sort: z.string().max(60).optional(),
      columns: z.array(z.string().max(60)).max(40).optional(),
    })
    .optional(),
});

async function load(id: string) {
  return (await db.select().from(tables.savedViews).where(eq(tables.savedViews.id, id)).limit(1))[0];
}

export async function GET(req: Request, { params }: Params) {
  return withAuth(req, async () => {
    const { id } = await params;
    const row = await load(id);
    if (!row) return apiError("View not found", 404);
    return json({ view: { ...row, config: JSON.parse(row.config), shared: row.userId === null } });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "saved-views", "update");
    if (denied) return denied;
    const { id } = await params;
    const row = await load(id);
    if (!row) return apiError("View not found", 404);
    // A personal view can only be edited by its owner; shared views by any writer.
    if (row.userId && row.userId !== (auth.user?.id ?? null)) {
      return apiError("Not your view", 403);
    }
    const body = await parseBody(req, patch);
    if (!body.ok) return body.response;
    await db
      .update(tables.savedViews)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.config !== undefined ? { config: JSON.stringify(body.data.config) } : {}),
      })
      .where(eq(tables.savedViews.id, id));
    await audit(auth.user?.id, "saved_view.updated", { objectType: "saved_view", objectId: id });
    const updated = await load(id);
    return json({ view: { ...updated!, config: JSON.parse(updated!.config), shared: updated!.userId === null } });
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return withAuth(req, async (auth) => {
    const denied = authorize(auth, "saved-views", "delete");
    if (denied) return denied;
    const { id } = await params;
    const row = await load(id);
    if (!row) return apiError("View not found", 404);
    if (row.userId && row.userId !== (auth.user?.id ?? null)) {
      return apiError("Not your view", 403);
    }
    await db.delete(tables.savedViews).where(eq(tables.savedViews.id, id));
    await audit(auth.user?.id, "saved_view.deleted", { objectType: "saved_view", objectId: id });
    return json({ ok: true });
  });
}

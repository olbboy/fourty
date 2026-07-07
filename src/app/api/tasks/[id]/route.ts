import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError, parseBody } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { dispatchEvent } from "@/lib/workflows/engine";
import { taskPatch } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0];
  if (!existing) return apiError("Task not found", 404);

  const body = await parseBody(req, taskPatch);
  if (!body.ok) return body.response;
  const { completed, ...fields } = body.data;

  const justCompleted = completed === true && !existing.completedAt;
  await db
    .update(tables.tasks)
    .set({
      ...fields,
      ...(completed !== undefined ? { completedAt: completed ? Date.now() : null } : {}),
    })
    .where(eq(tables.tasks.id, id));

  const row = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0]!;
  if (justCompleted) {
    if (row.entityType && row.entityId) {
      await logActivity({
        type: "task_completed",
        entityType: row.entityType,
        entityId: row.entityId,
        actorId: auth.user?.id,
        meta: { title: row.title },
      });
    }
    await dispatchEvent({
      event: "task.completed",
      entityType: "task",
      entityId: id,
      snapshot: { ...row },
    });
  }
  return json({ task: row });
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await db.delete(tables.tasks).where(eq(tables.tasks.id, id));
  return json({ ok: true });
}

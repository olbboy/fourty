import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, apiError, parseBody } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  trigger: z.object({ event: z.string() }).optional(),
  conditions: z.array(z.record(z.string(), z.unknown())).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).optional(),
});

export async function GET(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const row = (await db.select().from(tables.workflows).where(eq(tables.workflows.id, id)).limit(1))[0];
  if (!row) return apiError("Workflow not found", 404);
  const runs = await db
    .select()
    .from(tables.workflowRuns)
    .where(eq(tables.workflowRuns.workflowId, id))
    .orderBy(desc(tables.workflowRuns.createdAt))
    .limit(30);
  return json({
    workflow: {
      ...row,
      enabled: row.enabled === 1,
      trigger: JSON.parse(row.trigger),
      conditions: JSON.parse(row.conditions),
      actions: JSON.parse(row.actions),
    },
    runs: runs.map((r) => ({ ...r, log: JSON.parse(r.log) })),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const existing = (await db.select().from(tables.workflows).where(eq(tables.workflows.id, id)).limit(1))[0];
  if (!existing) return apiError("Workflow not found", 404);
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const d = body.data;
  await db.update(tables.workflows)
    .set({
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.enabled !== undefined ? { enabled: d.enabled ? 1 : 0 } : {}),
      ...(d.trigger !== undefined ? { trigger: JSON.stringify(d.trigger) } : {}),
      ...(d.conditions !== undefined ? { conditions: JSON.stringify(d.conditions) } : {}),
      ...(d.actions !== undefined ? { actions: JSON.stringify(d.actions) } : {}),
    })
    .where(eq(tables.workflows.id, id));
  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: Params) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await db.delete(tables.workflows).where(eq(tables.workflows.id, id));
  await db.delete(tables.workflowRuns).where(eq(tables.workflowRuns.workflowId, id));
  return json({ ok: true });
}

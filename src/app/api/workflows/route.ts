import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { authenticate, json, parseBody } from "@/lib/api";
import { newId } from "@/lib/id";

const conditionSchema = z.object({
  field: z.string().min(1),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_empty", "not_empty"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
  }),
  z.object({ type: z.literal("add_note"), body: z.string().min(1) }),
  z.object({
    type: z.literal("update_field"),
    field: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
  z.object({ type: z.literal("webhook"), url: z.string().url() }),
  z.object({ type: z.literal("log"), message: z.string().min(1) }),
]);

const workflowInput = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional().default(true),
  trigger: z.object({
    event: z.enum([
      "contact.created",
      "contact.updated",
      "company.created",
      "deal.created",
      "deal.stage_changed",
      "deal.won",
      "deal.lost",
      "task.completed",
    ]),
  }),
  conditions: z.array(conditionSchema).max(10).optional().default([]),
  actions: z.array(actionSchema).min(1).max(10),
});

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const rows = await db.select().from(tables.workflows).orderBy(desc(tables.workflows.createdAt));
  return json({
    workflows: rows.map((r) => ({
      ...r,
      enabled: r.enabled === 1,
      trigger: JSON.parse(r.trigger),
      conditions: JSON.parse(r.conditions),
      actions: JSON.parse(r.actions),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, workflowInput);
  if (!body.ok) return body.response;
  const id = newId();
  await db.insert(tables.workflows)
    .values({
      id,
      name: body.data.name,
      enabled: body.data.enabled ? 1 : 0,
      trigger: JSON.stringify(body.data.trigger),
      conditions: JSON.stringify(body.data.conditions),
      actions: JSON.stringify(body.data.actions),
      createdAt: Date.now(),
    });
  const row = (await db.select().from(tables.workflows).where(eq(tables.workflows.id, id)).limit(1))[0]!;
  return json({ workflow: { ...row, enabled: row.enabled === 1 } }, { status: 201 });
}

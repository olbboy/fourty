import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { taskPatch } from "@/lib/validators";
import { defineAction } from "../define";
import { ActionError, type PayloadEnvelope } from "../types";
import { auditMeta, resolveTaskOwner, type Task } from "./shared";

type UpdateResult = PayloadEnvelope<Task> & { justCompleted: boolean };

export const tasksUpdate = defineAction({
  name: "tasks.update",
  object: "tasks",
  verb: "update",
  description:
    "Update a task by id. Pass completed=true to mark it done (fires task.completed and logs on the linked record).",
  input: taskPatch.extend({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, ...patch }, ctx): Promise<UpdateResult> => {
    const existing = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Task not found");

    const { completed, ownerId: requested, ...fields } = patch;
    const justCompleted = completed === true && !existing.completedAt;
    await db
      .update(tables.tasks)
      .set({
        ...fields,
        ...(requested !== undefined ? { ownerId: await resolveTaskOwner(requested, ctx) } : {}),
        ...(completed !== undefined ? { completedAt: completed ? Date.now() : null } : {}),
      })
      .where(eq(tables.tasks.id, id));

    const row = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0]!;
    return { payload: row, justCompleted };
  },
  effects: {
    activity: (_i, out, ctx) =>
      out.justCompleted && out.payload.entityType && out.payload.entityId
        ? {
            type: "task_completed",
            entityType: out.payload.entityType,
            entityId: out.payload.entityId,
            actorId: ctx.userId,
            meta: { title: out.payload.title },
          }
        : null,
    audit: (_i, out, ctx) => ({
      key: "task.updated",
      objectType: "task",
      objectId: out.payload.id,
      meta: auditMeta(ctx),
    }),
    events: (_i, out) =>
      out.justCompleted
        ? [{ event: "task.completed", entityType: "task", entityId: out.payload.id, snapshot: { ...out.payload } }]
        : [],
  },
});

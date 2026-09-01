import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { taskInput } from "@/lib/validators";
import { defineAction } from "../define";
import { auditMeta, resolveTaskOwner, type Task } from "./shared";

export const tasksCreate = defineAction({
  name: "tasks.create",
  object: "tasks",
  verb: "create",
  description:
    "Create a task. Requires title. Optionally pin it to a record and assign it to a workspace member (ownerId).",
  input: taskInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Task> => {
    const id = newId();
    const { ownerId: requested, ...fields } = data;
    await db.insert(tables.tasks).values({
      id,
      ...fields,
      ownerId: await resolveTaskOwner(requested, ctx),
      createdAt: Date.now(),
    });
    return (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0]!;
  },
  effects: {
    audit: (_i, row, ctx) => ({
      key: "task.created",
      objectType: "task",
      objectId: row.id,
      meta: auditMeta(ctx),
    }),
  },
});

import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { deleteInput } from "../schemas";
import { ActionError } from "../types";
import { auditMeta } from "./shared";

type DeleteResult =
  | { dryRun: true; wouldDelete: { type: "task"; id: string; title: string }; hint: string }
  | { deleted: true; type: "task"; id: string };

export const tasksDelete = defineAction({
  name: "tasks.delete",
  object: "tasks",
  verb: "delete",
  description: "Delete a task by id. Call with confirm=true to actually delete.",
  input: deleteInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, confirm }): Promise<DeleteResult> => {
    const existing = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Task not found");

    if (confirm !== true) {
      return {
        dryRun: true,
        wouldDelete: { type: "task", id, title: existing.title },
        hint: "Re-call with confirm=true to actually delete.",
      };
    }
    await db.delete(tables.tasks).where(eq(tables.tasks.id, id));
    return { deleted: true, type: "task", id };
  },
  effects: {
    audit: (_i, out, ctx) =>
      "dryRun" in out
        ? null
        : { key: "task.deleted", objectType: "task", objectId: out.id, meta: auditMeta(ctx) },
  },
});

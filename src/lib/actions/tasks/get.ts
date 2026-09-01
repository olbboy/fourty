import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { byIdInput } from "../schemas";
import { ActionError } from "../types";
import type { Task } from "./shared";

export const tasksGet = defineAction({
  name: "tasks.get",
  object: "tasks",
  verb: "read",
  description: "Fetch a single task by id.",
  input: byIdInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id }): Promise<Task> => {
    const row = (await db.select().from(tables.tasks).where(eq(tables.tasks.id, id)).limit(1))[0];
    if (!row) throw new ActionError("not_found", "Task not found");
    return row;
  },
});

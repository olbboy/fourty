import { inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { bulkDeleteAction, bulkIdsInput, existingOrThrow } from "../bulk";
import { defineAction } from "../define";
import { execute } from "../execute";
import { tasksDelete } from "./delete";
import { tasksUpdate } from "./update";

/**
 * Mark many tasks done, each through tasks.update (task.completed, timeline).
 * Tasks already done keep the day they were finished.
 */
export const tasksBulkComplete = defineAction({
  name: "tasks.bulkComplete",
  object: "tasks",
  verb: "update",
  description: "Mark many tasks done. If any id is unknown, none changes.",
  input: bulkIdsInput,
  expose: { rest: true },
  run: async ({ ids }, ctx): Promise<{ updated: number }> => {
    const unique = await existingOrThrow("tasks", ids, "tasks");
    const open = (await db.select({ id: tables.tasks.id, completedAt: tables.tasks.completedAt }).from(tables.tasks).where(inArray(tables.tasks.id, unique)))
      .filter((task) => task.completedAt === null)
      .map((task) => task.id);
    for (const id of open) await execute(tasksUpdate, { id, completed: true }, ctx);
    return { updated: open.length };
  },
});

export const tasksBulkDelete = bulkDeleteAction({ name: "tasks.bulkDelete", object: "tasks", noun: "tasks", remove: tasksDelete });

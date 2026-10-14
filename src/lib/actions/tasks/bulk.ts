import { bulkDeleteAction, bulkIdsInput, existingOrThrow } from "../bulk";
import { defineAction } from "../define";
import { execute } from "../execute";
import { tasksDelete } from "./delete";
import { tasksUpdate } from "./update";

/** Mark many tasks done, each through tasks.update (task.completed, timeline). */
export const tasksBulkComplete = defineAction({
  name: "tasks.bulkComplete",
  object: "tasks",
  verb: "update",
  description: "Mark many tasks done. If any id is unknown, none changes.",
  input: bulkIdsInput,
  expose: { rest: true },
  run: async ({ ids }, ctx): Promise<{ updated: number }> => {
    const unique = await existingOrThrow("tasks", ids, "tasks");
    for (const id of unique) await execute(tasksUpdate, { id, completed: true }, ctx);
    return { updated: unique.length };
  },
});

export const tasksBulkDelete = bulkDeleteAction({ name: "tasks.bulkDelete", object: "tasks", noun: "tasks", remove: tasksDelete });

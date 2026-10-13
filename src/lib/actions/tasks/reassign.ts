import { inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { reassignAction } from "../reassign";
import { tasksUpdate } from "./update";

export const tasksReassign = reassignAction({
  name: "tasks.reassign",
  object: "tasks",
  noun: "tasks",
  update: tasksUpdate,
  countExisting: async (ids) =>
    (await db.select({ id: tables.tasks.id }).from(tables.tasks).where(inArray(tables.tasks.id, ids))).length,
});

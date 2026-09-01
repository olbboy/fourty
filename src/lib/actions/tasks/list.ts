import { and, asc, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { listTasksInput } from "../schemas";
import type { Task } from "./shared";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

export const tasksList = defineAction({
  name: "tasks.list",
  object: "tasks",
  verb: "read",
  description: "List tasks. Optional entity filter (entityType + entityId) and state (open/done/all).",
  input: listTasksInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input): Promise<Task[]> => {
    const where: SQL[] = [];
    if (input.state === "done") where.push(isNotNull(tables.tasks.completedAt));
    else if (input.state !== "all") where.push(isNull(tables.tasks.completedAt));
    if (input.entityType) where.push(eq(tables.tasks.entityType, input.entityType));
    if (input.entityId) where.push(eq(tables.tasks.entityId, input.entityId));

    const rows = await db
      .select()
      .from(tables.tasks)
      .where(where.length ? and(...where) : undefined)
      .orderBy(input.sort === "createdAt" ? desc(tables.tasks.createdAt) : asc(tables.tasks.dueDate))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return rows;
  },
});

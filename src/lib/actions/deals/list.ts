import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { listDealsInput } from "../schemas";
import { toDeal, type Deal } from "./shared";

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

export const dealsList = defineAction({
  name: "deals.list",
  object: "deals",
  verb: "read",
  description: "List deals, most recently updated first. Optional text filter.",
  input: listDealsInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input): Promise<Deal[]> => {
    const where: SQL[] = [];
    const term = input.q?.trim();
    if (term) where.push(ilike(tables.deals.name, `%${term.replace(/[%_]/g, "")}%`));
    if (input.stageId) where.push(eq(tables.deals.stageId, input.stageId));
    if (input.pipelineId) where.push(eq(tables.deals.pipelineId, input.pipelineId));
    if (input.companyId) where.push(eq(tables.deals.companyId, input.companyId));
    if (input.contactId) where.push(eq(tables.deals.contactId, input.contactId));

    const rows = await db
      .select()
      .from(tables.deals)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tables.deals.updatedAt))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return rows.map(toDeal);
  },
});

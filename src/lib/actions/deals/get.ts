import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { byIdInput } from "../schemas";
import { ActionError } from "../types";
import { toDeal, type Deal } from "./shared";

export const dealsGet = defineAction({
  name: "deals.get",
  object: "deals",
  verb: "read",
  description: "Fetch a single deal by id.",
  input: byIdInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id }): Promise<Deal> => {
    const row = (await db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
    if (!row) throw new ActionError("not_found", "Deal not found");
    return toDeal(row);
  },
});

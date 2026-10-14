import { and, desc, eq, exists, gte, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { listDealsInput } from "../schemas";
import { quarterRange } from "@/lib/forecast";
import { toDeal, type Deal } from "./shared";

const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

export const dealsList = defineAction({
  name: "deals.list",
  object: "deals",
  verb: "read",
  description:
    'List deals, most recently updated first. Optional filters: text, ownerId (a member id, or "none" for unowned), closeQuarter ("2026-Q4", by expected close date), fieldKey + fieldValue (one custom field choice).',
  input: listDealsInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input): Promise<Deal[]> => {
    const where: SQL[] = [];
    const term = input.q?.trim();
    if (term) where.push(ilike(tables.deals.name, `%${term.replace(/[%_]/g, "")}%`));
    if (input.stageId) where.push(eq(tables.deals.stageId, input.stageId));
    if (input.pipelineId) where.push(eq(tables.deals.pipelineId, input.pipelineId));
    if (input.companyId) where.push(eq(tables.deals.companyId, input.companyId));
    // A contact's deals: the ones they are primary on and the ones they take part in.
    if (input.contactId) {
      where.push(
        or(
          eq(tables.deals.contactId, input.contactId),
          exists(
            db
              .select({ one: sql`1` })
              .from(tables.dealContacts)
              .where(and(eq(tables.dealContacts.dealId, tables.deals.id), eq(tables.dealContacts.contactId, input.contactId))),
          ),
        )!,
      );
    }
    if (input.ownerId === "none") where.push(isNull(tables.deals.ownerId));
    else if (input.ownerId) where.push(eq(tables.deals.ownerId, input.ownerId));
    const quarter = input.closeQuarter ? quarterRange(input.closeQuarter) : null;
    if (quarter) {
      where.push(gte(tables.deals.expectedCloseDate, quarter.start), lt(tables.deals.expectedCloseDate, quarter.end));
    }
    if (input.fieldKey && input.fieldValue !== undefined) {
      // A single choice is stored as text, several as a list: match either.
      where.push(
        sql`((${tables.deals.custom})::jsonb ->> ${input.fieldKey} = ${input.fieldValue} or (${tables.deals.custom})::jsonb -> ${input.fieldKey} @> jsonb_build_array(${input.fieldValue}::text))`,
      );
    }

    const rows = await db
      .select()
      .from(tables.deals)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tables.deals.updatedAt))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return rows.map(toDeal);
  },
});

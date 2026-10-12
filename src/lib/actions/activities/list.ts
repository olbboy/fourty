import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { listActivitiesInput } from "../schemas";
import { toActivity, type Activity } from "./shared";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const activitiesList = defineAction({
  name: "activities.list",
  object: "activities",
  verb: "read",
  description:
    "List a record's activity timeline (stage changes, notes, calls, mail, workflows). Requires entityType (contact, company, deal, or a custom-object apiName) and entityId. Newest first. Without both keys the list is empty — the timeline lives on a record, not the workspace.",
  input: listActivitiesInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input): Promise<Activity[]> => {
    const entityType = input.entityType?.trim();
    const entityId = input.entityId?.trim();
    if (!entityType || !entityId) return [];
    const where: SQL[] = [eq(tables.activities.entityType, entityType), eq(tables.activities.entityId, entityId)];
    const rows = await db
      .select()
      .from(tables.activities)
      .where(and(...where))
      .orderBy(desc(tables.activities.createdAt))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return rows.map(toActivity);
  },
});

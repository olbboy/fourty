import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { activityLogInput } from "@/lib/validators";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { auditMeta, toActivity, type Activity } from "./shared";

export const activitiesCreate = defineAction({
  name: "activities.create",
  object: "activities",
  verb: "create",
  description:
    "Log an email, call, or meeting on a record's timeline (entityType is contact, company, deal, or a custom-object apiName). System events (created, stage_changed, …) are written by the operations that cause them, not here.",
  input: activityLogInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Activity> => {
    const id = newId();
    await db.insert(tables.activities).values({
      id,
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
      actorId: ctx.userId,
      meta: JSON.stringify(data.note ? { note: data.note } : {}),
      createdAt: Date.now(),
    });
    return toActivity((await db.select().from(tables.activities).where(eq(tables.activities.id, id)).limit(1))[0]!);
  },
  effects: {
    audit: (_i, row, ctx) => ({
      key: "activity.logged",
      objectType: row.entityType,
      objectId: row.entityId,
      meta: auditMeta(ctx),
    }),
    rescore: async (_i, row) => {
      if (row.entityType === "contact") await recomputeContactScore(row.entityId);
    },
  },
});

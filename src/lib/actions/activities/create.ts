import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { activityLogInput } from "@/lib/validators";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { auditMeta, toActivity, type Activity } from "./shared";

export const activitiesCreate = defineAction({
  name: "activities.create",
  object: "activities",
  verb: "create",
  description:
    "Log an email, call, or meeting on a record's timeline (entityType is contact, company, deal, or a custom-object apiName), with an optional note, when it happened (occurredAt, epoch ms; default now) and its length in minutes. System events (created, stage_changed, …) are written by the operations that cause them, not here.",
  input: activityLogInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Activity> => {
    const id = newId();
    const now = Date.now();
    if (data.occurredAt !== undefined && data.occurredAt > now + 86_400_000) {
      throw new ActionError("invalid", "occurredAt: at most a day ahead");
    }
    // The timeline is ordered by when a touchpoint happened, so a call logged
    // late sits where it belongs; when it was typed in is kept beside it.
    const occurredAt = data.occurredAt ?? now;
    await db.insert(tables.activities).values({
      id,
      type: data.type,
      entityType: data.entityType,
      entityId: data.entityId,
      actorId: ctx.userId,
      meta: JSON.stringify({
        ...(data.note ? { note: data.note } : {}),
        ...(data.durationMinutes ? { durationMinutes: data.durationMinutes } : {}),
        ...(occurredAt !== now ? { loggedAt: now } : {}),
      }),
      createdAt: occurredAt,
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

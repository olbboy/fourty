import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { contactPatch } from "@/lib/validators";
import { changedKeys } from "@/lib/changed-fields";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { auditMeta, toContact, type Contact } from "./shared";

type UpdateResult = { payload: Contact; changedFields: string[]; touchedCustom: boolean };

export const contactsUpdate = defineAction({
  name: "contacts.update",
  object: "contacts",
  verb: "update",
  description: "Update a contact by id. Only the fields you pass change.",
  input: contactPatch.extend({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, ...patch }, ctx): Promise<UpdateResult> => {
    void ctx;
    const existing = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Contact not found");

    const { custom, ...fields } = patch;
    const changedFields = changedKeys(fields, existing);
    await db
      .update(tables.contacts)
      .set({
        ...fields,
        ...(custom !== undefined
          ? { custom: JSON.stringify({ ...JSON.parse(existing.custom), ...custom }) }
          : {}),
        updatedAt: Date.now(),
      })
      .where(eq(tables.contacts.id, id));
    // Score before reading back, so the row the effects see is the scored one.
    await recomputeContactScore(id);
    return {
      payload: toContact((await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!),
      changedFields,
      touchedCustom: custom !== undefined,
    };
  },
  effects: {
    // An update that changed nothing leaves no trace on the timeline.
    activity: (_i, out, ctx) =>
      out.changedFields.length === 0 && !out.touchedCustom
        ? null
        : {
            type: "updated",
            entityType: "contact",
            entityId: out.payload.id,
            actorId: ctx.userId,
            meta: { fields: out.changedFields },
          },
    audit: (_i, out, ctx) => ({
      key: "contact.updated",
      objectType: "contact",
      objectId: out.payload.id,
      meta: auditMeta(ctx, { fields: out.changedFields }),
    }),
    events: (_i, out) => [
      {
        event: "contact.updated",
        entityType: "contact",
        entityId: out.payload.id,
        snapshot: { ...out.payload, custom: undefined, changedFields: out.changedFields.join(",") },
      },
    ],
  },
});

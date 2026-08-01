import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { contactInput } from "@/lib/validators";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { auditMeta, toContact, type Contact } from "./shared";

export const contactsCreate = defineAction({
  name: "contacts.create",
  object: "contacts",
  verb: "create",
  description: "Create a contact. Requires firstName; email/phone/jobTitle/companyId/status optional.",
  input: contactInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Contact> => {
    const now = Date.now();
    const id = newId();
    const { custom, ...fields } = data;
    await db.insert(tables.contacts).values({
      id,
      ...fields,
      ownerId: ctx.userId,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now,
      updatedAt: now,
    });
    // Score first, so the row the workflow snapshot carries is the scored one.
    await recomputeContactScore(id);
    return toContact((await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0]!);
  },
  effects: {
    activity: (_i, row, ctx) => ({ type: "created", entityType: "contact", entityId: row.id, actorId: ctx.userId }),
    audit: (_i, row, ctx) => ({
      key: "contact.created",
      objectType: "contact",
      objectId: row.id,
      meta: auditMeta(ctx),
    }),
    events: (_i, row) => [
      { event: "contact.created", entityType: "contact", entityId: row.id, snapshot: { ...row, custom: undefined } },
    ],
  },
});

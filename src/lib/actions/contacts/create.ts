import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { contactInput } from "@/lib/validators";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { encodeCustom } from "@/lib/custom-fields";
import { ActionError } from "../types";
import { auditMeta, findContactIdByEmail, toContact, type Contact } from "./shared";

export const contactsCreate = defineAction({
  name: "contacts.create",
  object: "contacts",
  verb: "create",
  description: "Create a contact. Requires firstName; email/phone/jobTitle/companyId/status optional.",
  input: contactInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Contact> => {
    if (data.email) {
      const existing = await findContactIdByEmail(data.email);
      if (existing) {
        throw new ActionError("invalid", `A contact with this email already exists (${existing})`);
      }
    }
    const now = Date.now();
    const id = newId();
    const { custom, ...fields } = data;
    const blob = await encodeCustom("contact", custom ?? {});
    if (!blob.ok) throw new ActionError("invalid", blob.error);
    await db.insert(tables.contacts).values({
      id,
      ...fields,
      ownerId: ctx.userId,
      custom: blob.json,
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

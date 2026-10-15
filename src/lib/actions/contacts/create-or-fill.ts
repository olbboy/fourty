import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { contactInput } from "@/lib/validators";
import { recomputeContactScore } from "@/lib/services/contact-score";
import { defineAction } from "../define";
import { execute } from "../execute";
import { contactsCreate } from "./create";
import { contactsUpdate } from "./update";
import { auditMeta, findContactIdByEmail, toContact, type Contact } from "./shared";

type Received = { contact: Contact; existed: boolean; filled: string[] };

/** What a lead may fill on a contact already known; its name, email and status stay the CRM's. */
const FILLABLE = ["lastName", "phone", "jobTitle", "companyId", "source", "linkedin", "city", "country", "ownerId"] as const;

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * A lead pushed from another system (Q104, `POST /api/contacts?ifExists=fill`).
 * An email not seen before makes a contact, exactly as contacts.create does.
 * An email already known fills only that contact's empty fields, since what
 * the team has learned wins over what a form says, and never lowers its
 * status (a customer filling the form again stays a customer). Its timeline
 * notes that the lead came back, and from where.
 */
export const contactsCreateOrFill = defineAction({
  name: "contacts.createOrFill",
  object: "contacts",
  verb: "create",
  description:
    "Create a contact, or, when one with this email exists, fill its empty fields and note on its timeline that the lead came back. Requires firstName.",
  input: contactInput,
  expose: { rest: true },
  run: async (data, ctx): Promise<Received> => {
    const existingId = data.email ? await findContactIdByEmail(data.email) : undefined;
    if (!existingId) return { contact: (await execute(contactsCreate, data, ctx)) as Contact, existed: false, filled: [] };

    const current = toContact((await db.select().from(tables.contacts).where(eq(tables.contacts.id, existingId)).limit(1))[0]!);
    const fill: Record<string, unknown> = {};
    for (const key of FILLABLE) if (!blank(data[key]) && blank(current[key])) fill[key] = data[key];
    const custom = Object.fromEntries(Object.entries(data.custom ?? {}).filter(([k, v]) => !blank(v) && blank(current.custom[k])));
    if (Object.keys(custom).length) fill.custom = custom;

    const filled = Object.keys(fill).flatMap((k) => (k === "custom" ? Object.keys(custom) : [k]));
    if (filled.length) await execute(contactsUpdate, { id: existingId, ...fill }, ctx);
    const contact = toContact((await db.select().from(tables.contacts).where(eq(tables.contacts.id, existingId)).limit(1))[0]!);
    return { contact, existed: true, filled };
  },
  // A new contact has had its own effects (created, audited, workflows) from
  // contacts.create; these are for a lead that came back.
  effects: {
    activity: (input, out, ctx) =>
      out.existed
        ? { type: "returned", entityType: "contact", entityId: out.contact.id, actorId: ctx.userId, meta: { source: input.source ?? null } }
        : null,
    audit: (input, out, ctx) =>
      out.existed
        ? { key: "contact.returned", objectType: "contact", objectId: out.contact.id, meta: auditMeta(ctx, { source: input.source ?? null, filled: out.filled }) }
        : null,
    rescore: (_i, out) => (out.existed ? recomputeContactScore(out.contact.id).then(() => undefined) : null),
  },
});

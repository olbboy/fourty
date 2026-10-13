import { z } from "zod";
import { asc, eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { auditMeta } from "./shared";

/** One person on a deal: the primary contact first, then the Deal contacts. */
export type DealContactView = { contactId: string; role: string | null; name: string; primary: boolean };

const nameOf = (c: { firstName: string; lastName: string; email: string | null }) =>
  `${c.firstName} ${c.lastName}`.trim() || c.email || "";

async function dealOrThrow(id: string) {
  const deal = (await db.select({ id: tables.deals.id, contactId: tables.deals.contactId }).from(tables.deals).where(eq(tables.deals.id, id)).limit(1))[0];
  if (!deal) throw new ActionError("not_found", "Deal not found");
  return deal;
}

/** The people on a deal, primary contact first, in the order they were set. */
export async function dealContactsOf(dealId: string, primaryId: string | null): Promise<DealContactView[]> {
  const links = await db
    .select({ contactId: tables.dealContacts.contactId, role: tables.dealContacts.role })
    .from(tables.dealContacts)
    .where(eq(tables.dealContacts.dealId, dealId))
    .orderBy(asc(tables.dealContacts.position));
  const ids = [...new Set([primaryId, ...links.map((l) => l.contactId)].filter((v): v is string => !!v))];
  if (ids.length === 0) return [];
  const people = await db
    .select({ id: tables.contacts.id, firstName: tables.contacts.firstName, lastName: tables.contacts.lastName, email: tables.contacts.email })
    .from(tables.contacts)
    .where(inArray(tables.contacts.id, ids));
  const view: DealContactView[] = [];
  const primary = people.find((p) => p.id === primaryId);
  if (primary) view.push({ contactId: primary.id, role: null, name: nameOf(primary), primary: true });
  for (const link of links) {
    const person = people.find((p) => p.id === link.contactId);
    if (person && person.id !== primaryId) view.push({ contactId: person.id, role: link.role, name: nameOf(person), primary: false });
  }
  return view;
}

export const dealsContacts = defineAction({
  name: "deals.contacts",
  object: "deals",
  verb: "read",
  description: "List the people on a deal: its primary contact first, then the other Deal contacts with their roles.",
  input: z.object({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id }): Promise<DealContactView[]> => {
    const deal = await dealOrThrow(id);
    return dealContactsOf(id, deal.contactId);
  },
});

const setInput = z.object({
  id: z.string().min(1),
  contacts: z
    .array(z.object({ contactId: z.string().min(1), role: z.string().trim().max(80).nullable().optional() }))
    .max(50),
});

/**
 * Replace a deal's Deal contacts with this list, in this order. The primary
 * contact (deals.contactId) is set on the deal itself and is skipped here; a
 * contact listed twice keeps its first role. Every contact must exist.
 */
export const dealsSetContacts = defineAction({
  name: "deals.setContacts",
  object: "deals",
  verb: "update",
  description:
    "Set the people on a deal besides its primary contact, each with an optional role (e.g. technical, purchasing). Replaces the whole list; pass [] to clear it.",
  input: setInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, contacts }): Promise<{ id: string; contacts: DealContactView[] }> => {
    const deal = await dealOrThrow(id);
    const wanted = contacts.filter((c, i) => c.contactId !== deal.contactId && contacts.findIndex((o) => o.contactId === c.contactId) === i);
    if (wanted.length) {
      const found = await db.select({ id: tables.contacts.id }).from(tables.contacts).where(inArray(tables.contacts.id, wanted.map((c) => c.contactId)));
      if (found.length !== wanted.length) throw new ActionError("invalid", "contacts: unknown contact");
    }
    await db.delete(tables.dealContacts).where(eq(tables.dealContacts.dealId, id));
    if (wanted.length) {
      const now = Date.now();
      await db.insert(tables.dealContacts).values(
        wanted.map((c, position) => ({ id: newId(), dealId: id, contactId: c.contactId, role: c.role || null, position, createdAt: now })),
      );
    }
    return { id, contacts: await dealContactsOf(id, deal.contactId) };
  },
  effects: {
    activity: (_i, out, ctx) => ({
      type: "updated",
      entityType: "deal",
      entityId: out.id,
      actorId: ctx.userId,
      meta: { fields: ["contacts"] },
    }),
    audit: (_i, out, ctx) => ({
      key: "deal.updated",
      objectType: "deal",
      objectId: out.id,
      meta: auditMeta(ctx, { contacts: out.contacts.filter((c) => !c.primary).length }),
    }),
  },
});

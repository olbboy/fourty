import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { listContactsInput } from "../schemas";
import { toContact, type Contact } from "./shared";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export const contactsList = defineAction({
  name: "contacts.list",
  object: "contacts",
  verb: "read",
  description: 'List contacts, most recently updated first. Optional filters: text, status, companyId, ownerId (a member id, or "none" for unowned).',
  input: listContactsInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input, ctx): Promise<Contact[]> => {
    // Filtering by a hidden owner would tell, by what comes back, who owns what.
    if (input.ownerId && !canReadField(await loadFieldPolicy(ctx.role), "contacts", "ownerId")) {
      throw new ActionError("forbidden", "Forbidden: contact query is not readable");
    }
    const where: SQL[] = [];
    const term = input.q?.trim();
    if (term) {
      const pattern = `%${term.replace(/[%_]/g, "")}%`;
      where.push(
        or(
          ilike(sql`${tables.contacts.firstName} || ' ' || ${tables.contacts.lastName}`, pattern),
          ilike(tables.contacts.email, pattern),
          ilike(tables.contacts.jobTitle, pattern),
        )!,
      );
    }
    if (input.status) where.push(eq(tables.contacts.status, input.status));
    if (input.companyId) where.push(eq(tables.contacts.companyId, input.companyId));
    if (input.ownerId === "none") where.push(isNull(tables.contacts.ownerId));
    else if (input.ownerId) where.push(eq(tables.contacts.ownerId, input.ownerId));

    const rows = await db
      .select()
      .from(tables.contacts)
      .where(where.length ? and(...where) : undefined)
      .orderBy(orderFor(input.sort))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return rows.map(toContact);
  },
});

/** Anything unrecognised sorts by most recently updated, as the REST list does. */
function orderFor(sort: string | undefined) {
  if (sort === "score") return desc(tables.contacts.score);
  if (sort === "name") return tables.contacts.firstName;
  if (sort === "createdAt") return desc(tables.contacts.createdAt);
  return desc(tables.contacts.updatedAt);
}

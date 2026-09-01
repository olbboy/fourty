import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { byIdInput } from "../schemas";
import { ActionError } from "../types";
import { toContact, type Contact } from "./shared";

export const contactsGet = defineAction({
  name: "contacts.get",
  object: "contacts",
  verb: "read",
  description: "Fetch a single contact by id.",
  input: byIdInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id }): Promise<Contact> => {
    const row = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)).limit(1))[0];
    if (!row) throw new ActionError("not_found", "Contact not found");
    return toContact(row);
  },
});

import { inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { reassignAction } from "../reassign";
import { contactsUpdate } from "./update";

export const contactsReassign = reassignAction({
  name: "contacts.reassign",
  object: "contacts",
  noun: "contacts",
  update: contactsUpdate,
  countExisting: async (ids) =>
    (await db.select({ id: tables.contacts.id }).from(tables.contacts).where(inArray(tables.contacts.id, ids))).length,
});

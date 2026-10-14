import { inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { reassignAction } from "../reassign";
import { companiesUpdate } from "./update";

export const companiesReassign = reassignAction({
  name: "companies.reassign",
  object: "companies",
  noun: "companies",
  update: companiesUpdate,
  countExisting: async (ids) =>
    (await db.select({ id: tables.companies.id }).from(tables.companies).where(inArray(tables.companies.id, ids))).length,
});

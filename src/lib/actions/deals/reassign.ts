import { inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { reassignAction } from "../reassign";
import { dealsUpdate } from "./update";

export const dealsReassign = reassignAction({
  name: "deals.reassign",
  object: "deals",
  noun: "deals",
  update: dealsUpdate,
  countExisting: async (ids) =>
    (await db.select({ id: tables.deals.id }).from(tables.deals).where(inArray(tables.deals.id, ids))).length,
});

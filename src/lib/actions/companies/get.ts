import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { byIdInput } from "../schemas";
import { ActionError } from "../types";
import { toCompany, type Company } from "./shared";

export const companiesGet = defineAction({
  name: "companies.get",
  object: "companies",
  verb: "read",
  description: "Fetch a single company by id.",
  input: byIdInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id }): Promise<Company> => {
    const row = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
    if (!row) throw new ActionError("not_found", "Company not found");
    return toCompany(row);
  },
});

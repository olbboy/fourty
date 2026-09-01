import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { defineAction } from "../define";
import { listCompaniesInput } from "../schemas";
import { toCompany, type Company } from "./shared";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export const companiesList = defineAction({
  name: "companies.list",
  object: "companies",
  verb: "read",
  description: "List companies, most recently updated first. Optional text filter.",
  input: listCompaniesInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (input): Promise<Company[]> => {
    const where: SQL[] = [];
    const term = input.q?.trim();
    if (term) {
      const pattern = `%${term.replace(/[%_]/g, "")}%`;
      where.push(
        or(
          ilike(tables.companies.name, pattern),
          ilike(tables.companies.domain, pattern),
          ilike(tables.companies.industry, pattern),
        )!,
      );
    }
    if (input.industry) where.push(eq(tables.companies.industry, input.industry));

    const rows = await db
      .select()
      .from(tables.companies)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tables.companies.updatedAt))
      .limit(Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT));
    return rows.map(toCompany);
  },
});

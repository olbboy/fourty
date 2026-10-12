import { asc, desc } from "drizzle-orm";
import { db, tables } from "@/db";
import { canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { companyWhere, type CompanySearchField } from "@/lib/company-query";
import { defineAction } from "../define";
import { listCompaniesInput } from "../schemas";
import { ActionError } from "../types";
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
  run: async (input, ctx): Promise<Company[]> => {
    const policy = await loadFieldPolicy(ctx.role);
    const term = input.q?.trim() || undefined;
    const industry = input.industry?.trim() || undefined;
    const searchFields = (["name", "domain", "industry"] as const).filter((field) =>
      canReadField(policy, "companies", field),
    ) satisfies CompanySearchField[];

    if (term && searchFields.length === 0) {
      throw new ActionError("forbidden", "Forbidden: company query is not readable");
    }
    if (industry && !canReadField(policy, "companies", "industry")) {
      throw new ActionError("forbidden", "Forbidden: company query is not readable");
    }

    const requestedSort = input.sort;
    const sort = requestedSort === "name" ? "name" : requestedSort === "createdAt" ? "createdAt" : "updatedAt";
    const sortReadable = canReadField(policy, "companies", sort);
    if (!sortReadable && requestedSort === "name") {
      throw new ActionError("forbidden", "Forbidden: company query is not readable");
    }
    if (!sortReadable && requestedSort === "createdAt") {
      throw new ActionError("forbidden", "Forbidden: company query is not readable");
    }

    const where = companyWhere(
      {
        q: term,
        industry,
        sort: "updatedAt_desc",
        sortProvided: false,
        offset: 0,
        limit: 1,
      },
      searchFields,
    );
    const effectiveSort = sortReadable ? sort : "id";

    const rows = await db
      .select()
      .from(tables.companies)
      .where(where)
      .orderBy(orderFor(effectiveSort))
      .limit(Math.max(1, Math.min(Number(input.limit) || DEFAULT_LIMIT, MAX_LIMIT)));
    return rows.map(toCompany);
  },
});

/** Unrecognised sort falls back to most recently updated, as the REST list does. */
function orderFor(sort: string | undefined) {
  if (sort === "name") return asc(tables.companies.name);
  if (sort === "createdAt") return desc(tables.companies.createdAt);
  if (sort === "id") return asc(tables.companies.id);
  return desc(tables.companies.updatedAt);
}

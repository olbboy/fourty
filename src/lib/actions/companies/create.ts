import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { companyInput } from "@/lib/validators";
import { encodeCustom } from "@/lib/custom-fields";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { auditMeta, toCompany, type Company } from "./shared";

export const companiesCreate = defineAction({
  name: "companies.create",
  object: "companies",
  verb: "create",
  description: "Create a company. Requires name; domain/industry/size/website optional.",
  input: companyInput,
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async (data, ctx): Promise<Company> => {
    const now = Date.now();
    const id = newId();
    const { custom, ...fields } = data;
    const blob = await encodeCustom("company", custom ?? {});
    if (!blob.ok) throw new ActionError("invalid", blob.error);
    await db.insert(tables.companies).values({
      id,
      ...fields,
      ownerId: ctx.userId,
      custom: blob.json,
      createdAt: now,
      updatedAt: now,
    });
    return toCompany((await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!);
  },
  effects: {
    activity: (_i, row, ctx) => ({ type: "created", entityType: "company", entityId: row.id, actorId: ctx.userId }),
    audit: (_i, row, ctx) => ({
      key: "company.created",
      objectType: "company",
      objectId: row.id,
      meta: auditMeta(ctx),
    }),
    events: (_i, row) => [
      { event: "company.created", entityType: "company", entityId: row.id, snapshot: { ...row, custom: undefined } },
    ],
  },
});

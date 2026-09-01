import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { companyPatch } from "@/lib/validators";
import { changedKeys } from "@/lib/changed-fields";
import { encodeCustom } from "@/lib/custom-fields";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { auditMeta, toCompany, type Company } from "./shared";

type UpdateResult = { payload: Company; changedFields: string[]; touchedCustom: boolean };

export const companiesUpdate = defineAction({
  name: "companies.update",
  object: "companies",
  verb: "update",
  description: "Update a company by id. Only the fields you pass change.",
  input: companyPatch.extend({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, ...patch }): Promise<UpdateResult> => {
    const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Company not found");

    const { custom, ...fields } = patch;
    const changedFields = changedKeys(fields, existing);
    let customJson: string | undefined;
    if (custom !== undefined) {
      const blob = await encodeCustom("company", { ...JSON.parse(existing.custom), ...custom });
      if (!blob.ok) throw new ActionError("invalid", blob.error);
      customJson = blob.json;
    }
    await db
      .update(tables.companies)
      .set({
        ...fields,
        ...(customJson !== undefined ? { custom: customJson } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(tables.companies.id, id));
    return {
      payload: toCompany((await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!),
      changedFields,
      touchedCustom: custom !== undefined,
    };
  },
  effects: {
    activity: (_i, out, ctx) =>
      out.changedFields.length === 0 && !out.touchedCustom
        ? null
        : {
            type: "updated",
            entityType: "company",
            entityId: out.payload.id,
            actorId: ctx.userId,
            meta: { fields: out.changedFields },
          },
    audit: (_i, out, ctx) => ({
      key: "company.updated",
      objectType: "company",
      objectId: out.payload.id,
      meta: auditMeta(ctx, { fields: out.changedFields }),
    }),
    // No surface has ever dispatched company.updated — keep it that way.
  },
});

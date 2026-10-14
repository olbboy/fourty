import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { companyPatch } from "@/lib/validators";
import { changedKeys } from "@/lib/changed-fields";
import { encodeCustom } from "@/lib/custom-fields";
import { defineAction } from "../define";
import { ActionError } from "../types";
import { ownerChange, resolveOwner, type OwnerChange } from "../assignees";
import { auditMeta, toCompany, type Company } from "./shared";

type UpdateResult = { payload: Company; changedFields: string[]; touchedCustom: boolean; ownerChange: OwnerChange | null };

export const companiesUpdate = defineAction({
  name: "companies.update",
  object: "companies",
  verb: "update",
  description: "Update a company by id. Only the fields you pass change.",
  input: companyPatch.extend({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, ...patch }, ctx): Promise<UpdateResult> => {
    const existing = (await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Company not found");

    const { custom, ownerId: requestedOwner, ...fields } = patch;
    const ownerPatch = requestedOwner !== undefined ? { ownerId: await resolveOwner(requestedOwner, ctx) } : {};
    const owner = ownerPatch.ownerId !== undefined ? await ownerChange(existing.ownerId, ownerPatch.ownerId) : null;
    const changedFields = [...changedKeys(fields, existing), ...(owner ? ["ownerId"] : [])];
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
        ...ownerPatch,
        ...(customJson !== undefined ? { custom: customJson } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(tables.companies.id, id));
    return {
      payload: toCompany((await db.select().from(tables.companies).where(eq(tables.companies.id, id)).limit(1))[0]!),
      changedFields,
      touchedCustom: custom !== undefined,
      ownerChange: owner,
    };
  },
  effects: {
    activity: (_i, out, ctx) =>
      // One timeline entry per write; a hand-over outranks the field list, as on Deals.
      out.ownerChange
        ? { type: "owner_changed", entityType: "company", entityId: out.payload.id, actorId: ctx.userId, meta: { ...out.ownerChange } }
        : out.changedFields.length === 0 && !out.touchedCustom
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

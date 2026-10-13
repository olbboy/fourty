import { z } from "zod";
import { and, asc, eq, ilike, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { register } from "../registry";
import { defineAction } from "../define";
import { ActionError } from "../types";

/** A Product as every surface returns it (CONTEXT.md: Product). */
export type Product = {
  id: string;
  name: string;
  code: string | null;
  unitPrice: number;
  currency: string;
  active: boolean;
};

type Row = typeof tables.products.$inferSelect;
const toProduct = (r: Row): Product => ({
  id: r.id,
  name: r.name,
  code: r.code,
  unitPrice: r.unitPrice,
  currency: r.currency,
  active: r.active === 1,
});

const productInput = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(60).nullable().optional(),
  unitPrice: z.number().min(0).max(1e15),
  currency: z.enum(SUPPORTED_CURRENCIES),
  active: z.boolean().optional(),
});

export const productsList = defineAction({
  name: "products.list",
  object: "products",
  verb: "read",
  description:
    "List the product catalogue by name. Optional text filter on name. state=active (default) lists what is sold now; state=all adds products no longer sold.",
  // A string state, like tasks' open/done/all: a query string's "false" is truthy to a coerced boolean.
  input: z.object({ q: z.string().optional(), state: z.enum(["active", "all"]).optional().catch(undefined) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ q, state }): Promise<Product[]> => {
    const where: SQL[] = [];
    if (state !== "all") where.push(eq(tables.products.active, 1));
    const term = q?.trim();
    if (term) where.push(ilike(tables.products.name, `%${term.replace(/[%_]/g, "")}%`));
    const rows = await db.select().from(tables.products).where(where.length ? and(...where) : undefined).orderBy(asc(tables.products.name));
    return rows.map(toProduct);
  },
});

export const productsCreate = defineAction({
  name: "products.create",
  object: "products",
  verb: "create",
  description: "Add a product to the catalogue with its list price and currency.",
  input: productInput,
  expose: { rest: true },
  run: async (input): Promise<Product> => {
    const id = newId();
    const now = Date.now();
    await db.insert(tables.products).values({
      id,
      name: input.name,
      code: input.code || null,
      unitPrice: input.unitPrice,
      currency: input.currency,
      active: input.active === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    });
    return toProduct((await db.select().from(tables.products).where(eq(tables.products.id, id)).limit(1))[0]!);
  },
  effects: {
    audit: (_i, out) => ({ key: "product.created", objectType: "product", objectId: out.id }),
  },
});

export const productsUpdate = defineAction({
  name: "products.update",
  object: "products",
  verb: "update",
  description: "Change a product. Deals keep the names and prices their lines already have.",
  input: productInput.partial().extend({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id, ...patch }): Promise<Product> => {
    const existing = (await db.select().from(tables.products).where(eq(tables.products.id, id)).limit(1))[0];
    if (!existing) throw new ActionError("not_found", "Product not found");
    await db
      .update(tables.products)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.code !== undefined ? { code: patch.code || null } : {}),
        ...(patch.unitPrice !== undefined ? { unitPrice: patch.unitPrice } : {}),
        ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
        ...(patch.active !== undefined ? { active: patch.active ? 1 : 0 } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(tables.products.id, id));
    return toProduct((await db.select().from(tables.products).where(eq(tables.products.id, id)).limit(1))[0]!);
  },
  effects: {
    audit: (_i, out) => ({ key: "product.updated", objectType: "product", objectId: out.id }),
  },
});

export const productsDelete = defineAction({
  name: "products.delete",
  object: "products",
  verb: "delete",
  description: "Remove a product from the catalogue. Deals keep the lines that used it.",
  input: z.object({ id: z.string().min(1) }),
  expose: { rest: true },
  run: async ({ id }): Promise<{ deleted: true; id: string }> => {
    const gone = await db.delete(tables.products).where(eq(tables.products.id, id)).returning({ id: tables.products.id });
    if (!gone.length) throw new ActionError("not_found", "Product not found");
    return { deleted: true, id };
  },
  effects: {
    audit: (_i, out) => ({ key: "product.deleted", objectType: "product", objectId: out.id }),
  },
});

register(productsList);
register(productsCreate);
register(productsUpdate);
register(productsDelete);

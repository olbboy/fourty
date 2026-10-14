import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { convertAt } from "@/lib/currency";
import { linesOf, roundMoney, sumLines, type DealLine } from "@/lib/deal-lines";
import { loadReportingSettings } from "@/lib/reporting";
import { blockedWrites, canReadField, loadFieldPolicy } from "@/lib/field-permissions";
import { defineAction } from "../define";
import { execute } from "../execute";
import { ActionError, type ActionContext } from "../types";
import { auditMeta } from "./shared";
import { dealsUpdate } from "./update";

/** Lines as a caller may see them: prices are the Amount in parts, so a role that cannot read a deal's amount gets the lines without them. */
export type VisibleLine = Omit<DealLine, "unitPrice" | "total"> & { unitPrice?: number; total?: number };

async function asSeenBy(ctx: Pick<ActionContext, "role">, lines: DealLine[]): Promise<{ lines: VisibleLine[]; total: number | null }> {
  if (canReadField(await loadFieldPolicy(ctx.role), "deals", "amount")) return { lines, total: sumLines(lines) };
  return { lines: lines.map(({ unitPrice: _price, total: _total, ...rest }) => rest), total: null };
}

/** A deal's lines for MCP get_deal, priced only for a role that may read the Amount. */
export async function visibleLinesOf(dealId: string, ctx: Pick<ActionContext, "role">): Promise<VisibleLine[]> {
  return (await asSeenBy(ctx, await linesOf(dealId))).lines;
}

/** `lock` holds the deal row until the transaction ends, so two saves of its lines take turns. */
async function dealOrThrow(id: string, lock = false) {
  const query = db.select().from(tables.deals).where(eq(tables.deals.id, id)).limit(1);
  const deal = (lock ? await query.for("update") : await query)[0];
  if (!deal) throw new ActionError("not_found", "Deal not found");
  return deal;
}

export const dealsLines = defineAction({
  name: "deals.lines",
  object: "deals",
  verb: "read",
  description: "List a deal's line items in order, each with its total, and their sum.",
  input: z.object({ id: z.string().min(1) }),
  expose: { rest: true, graphql: true },
  run: async ({ id }, ctx): Promise<{ lines: VisibleLine[]; total: number | null }> => {
    await dealOrThrow(id);
    return asSeenBy(ctx, await linesOf(id));
  },
});

const lineInput = z.object({
  /** A line this deal already has keeps its id; anything else gets a new one. */
  id: z.string().min(1).optional(),
  productId: z.string().min(1).nullable().optional(),
  name: z.string().trim().max(200).optional(),
  quantity: z.number().positive().max(1e9),
  unitPrice: z.number().min(0).max(1e15).optional(),
});

/**
 * Replace a deal's line items with this list, in this order, and make the
 * deal's Amount their sum (through deals.update, so the change is on the
 * timeline and the health score follows). A line from a product takes the
 * product's name and list price, converted to the deal's currency at the
 * workspace's rates, unless the line gives its own. Clearing the list leaves
 * the Amount as it is, to be typed by hand again.
 */
export const dealsSetLines = defineAction({
  name: "deals.setLines",
  object: "deals",
  verb: "update",
  description:
    "Set a deal's line items (product or typed-in item, quantity, unit price in the deal's currency). Replaces the whole list; the deal's amount becomes their sum. Pass [] to clear.",
  input: z.object({ id: z.string().min(1), lines: z.array(lineInput).max(200) }),
  expose: { rest: true, graphql: true, mcp: true, ai: true },
  run: async ({ id, lines }, ctx): Promise<{ id: string; lines: VisibleLine[]; total: number | null; amountChanged: boolean }> => {
    // Two saves at once would each delete nothing new and both insert: the
    // deal would end with both lists and the Amount of one.
    const deal = await dealOrThrow(id, true);
    const productIds = [...new Set(lines.map((l) => l.productId).filter((v): v is string => !!v))];
    const products = productIds.length
      ? await db.select().from(tables.products).where(inArray(tables.products.id, productIds))
      : [];
    if (products.length !== productIds.length) throw new ActionError("invalid", "lines: unknown product");
    const reporting = await loadReportingSettings();
    // Only this deal's own line ids are reused, each once: an id from elsewhere
    // would collide with that line, or tell the caller it exists.
    const ownIds = new Set((await linesOf(id)).map((l) => l.id));
    const keep = (lineId: string | undefined) => (lineId && ownIds.delete(lineId) ? lineId : newId());

    const resolved = lines.map((line, position) => {
      const product = products.find((p) => p.id === line.productId);
      const name = line.name?.trim() || product?.name;
      const unitPrice =
        line.unitPrice ?? (product ? roundMoney(convertAt(product.unitPrice, product.currency, deal.currency, reporting)) : undefined);
      if (!name || unitPrice === undefined) {
        throw new ActionError("invalid", `lines.${position}: give a product, or a name and a unit price`);
      }
      return { id: keep(line.id), dealId: id, productId: product?.id ?? null, name, quantity: line.quantity, unitPrice, position, createdAt: Date.now() };
    });

    // Lines that would move the Amount need the right to write it, checked
    // before anything is written. A refusal from the nested deals.update would
    // come too late: REST answers it inside the same transaction, which then
    // commits, leaving new lines beside the old Amount.
    const total = sumLines(resolved.map((l) => ({ ...l, total: roundMoney(l.quantity * l.unitPrice) })));
    const amountChanged = total !== null && total !== deal.amount;
    if (amountChanged && blockedWrites(await loadFieldPolicy(ctx.role), "deals", ["amount"]).length) {
      throw new ActionError("forbidden", "Forbidden: cannot write deals field(s): amount");
    }

    await db.delete(tables.dealLines).where(eq(tables.dealLines.dealId, id));
    if (resolved.length) await db.insert(tables.dealLines).values(resolved);
    if (amountChanged) await execute(dealsUpdate, { id, amount: total }, ctx);
    return { id, ...(await asSeenBy(ctx, await linesOf(id))), amountChanged };
  },
  effects: {
    // A changed Amount is already on the timeline, written by deals.update.
    activity: (_i, out, ctx) =>
      out.amountChanged ? null : { type: "updated", entityType: "deal", entityId: out.id, actorId: ctx.userId, meta: { fields: ["lines"] } },
    // Likewise the audit entry: deals.update wrote one when the Amount moved.
    audit: (_i, out, ctx) =>
      out.amountChanged ? null : { key: "deal.updated", objectType: "deal", objectId: out.id, meta: auditMeta(ctx, { lines: out.lines.length }) },
  },
});

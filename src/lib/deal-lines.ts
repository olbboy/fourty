import { asc, eq } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Reading a deal's Line items (CONTEXT.md). Shared by the deal actions, the
 * Amount guard in deals.update, GraphQL and the Trash; writing goes through
 * deals.setLines only.
 */

/** A Line item as surfaces return it, with its own total. */
export type DealLine = {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

/** Money to the cent: line totals and the deal's Amount never carry float dust. */
export const roundMoney = (n: number) => Math.round(n * 100) / 100;

export async function linesOf(dealId: string): Promise<DealLine[]> {
  const rows = await db.select().from(tables.dealLines).where(eq(tables.dealLines.dealId, dealId)).orderBy(asc(tables.dealLines.position));
  return rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    name: r.name,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    total: roundMoney(r.quantity * r.unitPrice),
  }));
}

/** The sum of line totals, or null for a deal with no lines (its Amount is typed by hand). */
export function sumLines(lines: readonly DealLine[]): number | null {
  return lines.length ? roundMoney(lines.reduce((sum, l) => sum + l.total, 0)) : null;
}

export async function linesTotal(dealId: string): Promise<number | null> {
  return sumLines(await linesOf(dealId));
}

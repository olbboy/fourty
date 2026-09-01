import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import type { ActionContext } from "../types";

type DealRow = typeof import("@/db").tables.deals.$inferSelect;

export type DealStageClock = {
  id: string;
  name: string | null;
  type: string | null;
  enteredAt: number;
  daysInStage: number;
};

/** Stage name/type plus how long the deal has sat there (MCP get_deal + GraphQL Deal.stage). */
export async function dealStageClock(row: { stageId: string; stageEnteredAt: number }): Promise<DealStageClock> {
  const stage = (await db.select().from(tables.stages).where(eq(tables.stages.id, row.stageId)).limit(1))[0];
  return {
    id: row.stageId,
    name: stage?.name ?? null,
    type: stage?.type ?? null,
    enteredAt: row.stageEnteredAt,
    daysInStage: Math.floor((Date.now() - row.stageEnteredAt) / 86_400_000),
  };
}

/** A deal as every surface returns it: the stored row with `custom` parsed. */
export type Deal = Omit<DealRow, "custom"> & { custom: Record<string, unknown> };

export function toDeal(row: DealRow): Deal {
  return { ...row, custom: JSON.parse(row.custom) as Record<string, unknown> };
}

/**
 * Audit metadata common to every deal operation. `via` marks a write as
 * agent-initiated; only the MCP and AI surfaces set it.
 */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}

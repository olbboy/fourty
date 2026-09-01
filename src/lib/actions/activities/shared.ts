import type { ActionContext } from "../types";

export type ActivityRow = typeof import("@/db").tables.activities.$inferSelect;

/** Timeline row with `meta` already parsed — every surface returns this shape. */
export type Activity = Omit<ActivityRow, "meta"> & { meta: Record<string, unknown> };

export function toActivity(row: ActivityRow): Activity {
  return { ...row, meta: JSON.parse(row.meta || "{}") as Record<string, unknown> };
}

/** Audit metadata common to every activity write. `via` marks an agent-initiated log. */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}

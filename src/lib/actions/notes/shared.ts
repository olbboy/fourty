import type { ActionContext } from "../types";

export type Note = typeof import("@/db").tables.notes.$inferSelect;

/**
 * Audit metadata common to every note operation. `via` marks a write as
 * agent-initiated; only the MCP and AI surfaces set it.
 */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}

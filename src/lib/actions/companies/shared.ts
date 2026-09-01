import type { ActionContext } from "../types";

type CompanyRow = typeof import("@/db").tables.companies.$inferSelect;

/** A company as every surface returns it: the stored row with `custom` parsed. */
export type Company = Omit<CompanyRow, "custom"> & { custom: Record<string, unknown> };

export function toCompany(row: CompanyRow): Company {
  return { ...row, custom: JSON.parse(row.custom) as Record<string, unknown> };
}

/**
 * Audit metadata common to every company operation. `via` marks a write as
 * agent-initiated; only the MCP and AI surfaces set it.
 */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}

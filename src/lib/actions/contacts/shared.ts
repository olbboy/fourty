import type { tables } from "@/db";
import type { ActionContext } from "../types";

type ContactRow = typeof tables.contacts.$inferSelect;

/** A contact as every surface returns it: the stored row with `custom` parsed. */
export type Contact = Omit<ContactRow, "custom"> & { custom: Record<string, unknown> };

export function toContact(row: ContactRow): Contact {
  return { ...row, custom: JSON.parse(row.custom) as Record<string, unknown> };
}

/**
 * Audit metadata common to every contact operation. `via` marks a write as
 * agent-initiated; only the MCP and AI surfaces set it, and REST and GraphQL
 * deliberately leave it unset.
 */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}

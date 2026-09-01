import { and, asc, eq, isNull } from "drizzle-orm";
import { db, tables } from "@/db";
import { ActionError, type ActionContext } from "../types";

export type Task = typeof import("@/db").tables.tasks.$inferSelect;

export type Assignee = { id: string; name: string };

/**
 * Audit metadata common to every task operation. `via` marks a write as
 * agent-initiated; only the MCP and AI surfaces set it.
 */
export function auditMeta(ctx: ActionContext, extra?: Record<string, unknown>): Record<string, unknown> {
  return { ...(ctx.via ? { via: ctx.via } : {}), ...extra };
}

/** Active workspace members a task may be assigned to. RLS scopes the memberships. */
export async function listAssignees(): Promise<Assignee[]> {
  return db
    .select({ id: tables.workspaceMembers.userId, name: tables.users.name })
    .from(tables.workspaceMembers)
    .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
    .where(isNull(tables.workspaceMembers.deactivatedAt))
    .orderBy(asc(tables.users.name));
}

export async function getAssignee(id: string): Promise<Assignee | undefined> {
  return (
    await db
      .select({ id: tables.workspaceMembers.userId, name: tables.users.name })
      .from(tables.workspaceMembers)
      .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
      .where(and(eq(tables.workspaceMembers.userId, id), isNull(tables.workspaceMembers.deactivatedAt)))
      .limit(1)
  )[0];
}

/**
 * `undefined` keeps the caller as owner (API keys have none). `null` is
 * explicitly unassigned. Anyone else must be an active member of this workspace.
 */
export async function resolveTaskOwner(
  requested: string | null | undefined,
  ctx: ActionContext,
): Promise<string | null> {
  if (requested === undefined) return ctx.userId;
  if (requested === null) return null;
  const member = (
    await db
      .select({ id: tables.workspaceMembers.userId })
      .from(tables.workspaceMembers)
      .where(and(eq(tables.workspaceMembers.userId, requested), isNull(tables.workspaceMembers.deactivatedAt)))
      .limit(1)
  )[0];
  if (!member) throw new ActionError("invalid", "ownerId: not a workspace member");
  return requested;
}

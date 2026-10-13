import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { ActionError, type ActionContext } from "./types";

/** A workspace member a task or deal can be owned by. */
export type Assignee = { id: string; name: string };

/**
 * Active memberships of the current workspace. workspace_members carries no
 * row-level security (sign-in reads every membership a user has), so this
 * scopes it to the same GUC the RLS policies use: unset means no rows.
 */
const activeInWorkspace = and(
  eq(tables.workspaceMembers.workspaceId, sql`current_setting('app.workspace_id', true)`),
  isNull(tables.workspaceMembers.deactivatedAt),
);

/** Active workspace members a record may be assigned to. */
export async function listAssignees(): Promise<Assignee[]> {
  return db
    .select({ id: tables.workspaceMembers.userId, name: tables.users.name })
    .from(tables.workspaceMembers)
    .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
    .where(activeInWorkspace)
    .orderBy(asc(tables.users.name));
}

export async function getAssignee(id: string): Promise<Assignee | undefined> {
  return (
    await db
      .select({ id: tables.workspaceMembers.userId, name: tables.users.name })
      .from(tables.workspaceMembers)
      .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
      .where(and(eq(tables.workspaceMembers.userId, id), activeInWorkspace))
      .limit(1)
  )[0];
}

/**
 * The owner a write should store. `undefined` keeps the caller as owner (API
 * keys have none). `null` is explicitly unassigned. Anyone else must be an
 * active member of this workspace.
 */
export async function resolveOwner(
  requested: string | null | undefined,
  ctx: ActionContext,
): Promise<string | null> {
  if (requested === undefined) return ctx.userId;
  if (requested === null) return null;
  if (!(await getAssignee(requested))) throw new ActionError("invalid", "ownerId: not a workspace member");
  return requested;
}

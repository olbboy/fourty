import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, tables } from "@/db";
import { loadLeadSettings } from "@/lib/lead-settings";
import { ActionError, type ActionContext } from "./types";

/** A workspace member a task or deal can be owned by. */
export type Assignee = { id: string; name: string };

/**
 * Active memberships of the current workspace. workspace_members carries no
 * row-level security (sign-in reads every membership a user has), so this
 * scopes it to the same GUC the RLS policies use: unset means no rows.
 */
const inWorkspace = eq(tables.workspaceMembers.workspaceId, sql`current_setting('app.workspace_id', true)`);
const activeInWorkspace = and(inWorkspace, isNull(tables.workspaceMembers.deactivatedAt));

/** Active workspace members a record may be assigned to. */
export async function listAssignees(): Promise<Assignee[]> {
  return db
    .select({ id: tables.workspaceMembers.userId, name: tables.users.name })
    .from(tables.workspaceMembers)
    .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
    .where(activeInWorkspace)
    .orderBy(asc(tables.users.name));
}

/**
 * Everyone who has been a member of this workspace, with whether they still
 * are: lists name the owner of older work by it, even after that person left.
 */
export async function listMembersForDisplay(): Promise<(Assignee & { active: boolean })[]> {
  const rows = await db
    .select({ id: tables.workspaceMembers.userId, name: tables.users.name, deactivatedAt: tables.workspaceMembers.deactivatedAt })
    .from(tables.workspaceMembers)
    .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
    .where(inWorkspace)
    .orderBy(asc(tables.users.name));
  return rows.map(({ deactivatedAt, ...person }) => ({ ...person, active: deactivatedAt === null }));
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

/** An Owner change as the timeline shows it: names at the time, null for unassigned. */
export type OwnerChange = { from: string | null; to: string | null };

/**
 * The change from one owner to another, or null when it is no change. Names
 * are read from accounts, not active memberships: a departed owner keeps their
 * name in history.
 */
export async function ownerChange(fromId: string | null, toId: string | null): Promise<OwnerChange | null> {
  if (fromId === toId) return null;
  return { from: await accountName(fromId), to: await accountName(toId) };
}

async function accountName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const row = (await db.select({ name: tables.users.name }).from(tables.users).where(eq(tables.users.id, id)).limit(1))[0];
  return row?.name ?? null;
}

/**
 * The owner a write should store. `undefined` keeps the caller as owner; an
 * API key has no person behind it, so what it makes goes to the Default lead
 * owner (Q107, Q114), or to no one if none is set or they have left. `null` is
 * explicitly unassigned. Anyone else must be an active member of this workspace.
 */
export async function resolveOwner(
  requested: string | null | undefined,
  ctx: ActionContext,
): Promise<string | null> {
  if (requested === undefined) {
    if (ctx.userId) return ctx.userId;
    const { defaultOwnerId } = await loadLeadSettings();
    return defaultOwnerId && (await getAssignee(defaultOwnerId)) ? defaultOwnerId : null;
  }
  if (requested === null) return null;
  if (!(await getAssignee(requested))) throw new ActionError("invalid", "ownerId: not a workspace member");
  return requested;
}

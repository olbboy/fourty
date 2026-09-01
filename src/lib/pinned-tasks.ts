import { and, desc, eq } from "drizzle-orm";
import { db, tables } from "@/db";

/** Neighbour id lists are a navigation aid, not a page — capped, never paged. */
export const PINNED_TASK_LIMIT = 25;

type PinTable = typeof tables.tasks | typeof tables.notes | typeof tables.activities;

async function pinnedIds(table: PinTable, entityType: string, entityId: string): Promise<string[]> {
  const rows = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.entityType, entityType), eq(table.entityId, entityId)))
    .orderBy(desc(table.createdAt))
    .limit(PINNED_TASK_LIMIT);
  return rows.map((r) => r.id);
}

/** Task ids pinned to a contact, company, deal, or custom-object record. */
export function pinnedTaskIds(entityType: string, entityId: string): Promise<string[]> {
  return pinnedIds(tables.tasks, entityType, entityId);
}

/** Note ids pinned to a contact, company, deal, or custom-object record. */
export function pinnedNoteIds(entityType: string, entityId: string): Promise<string[]> {
  return pinnedIds(tables.notes, entityType, entityId);
}

/** Activity ids on a contact, company, deal, or custom-object record. */
export function pinnedActivityIds(entityType: string, entityId: string): Promise<string[]> {
  return pinnedIds(tables.activities, entityType, entityId);
}

/** The three pin lists MCP `get_*` and the agent tab attach as neighbours. */
export async function pinnedWorkIds(entityType: string, entityId: string) {
  const [taskIds, noteIds, activityIds] = await Promise.all([
    pinnedTaskIds(entityType, entityId),
    pinnedNoteIds(entityType, entityId),
    pinnedActivityIds(entityType, entityId),
  ]);
  return { taskIds, noteIds, activityIds };
}

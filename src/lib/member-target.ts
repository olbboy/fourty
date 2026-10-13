import { and, eq, isNull } from "drizzle-orm";
import { db, tables } from "@/db";

/** The account of an active member of this workspace, or undefined. */
export async function activeMemberAccount(workspaceId: string, userId: string) {
  return (
    await db
      .select({ id: tables.users.id, email: tables.users.email, name: tables.users.name })
      .from(tables.workspaceMembers)
      .innerJoin(tables.users, eq(tables.users.id, tables.workspaceMembers.userId))
      .where(
        and(
          eq(tables.workspaceMembers.workspaceId, workspaceId),
          eq(tables.workspaceMembers.userId, userId),
          isNull(tables.workspaceMembers.deactivatedAt),
        ),
      )
      .limit(1)
  )[0];
}

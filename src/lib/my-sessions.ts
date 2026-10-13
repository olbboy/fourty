import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db, tables } from "@/db";

/** One of the caller's sessions as the account page shows it. */
export type SessionView = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
};

/** The live sessions of an account, most recently seen first. */
export async function sessionsOf(userId: string, currentId: string | null): Promise<SessionView[]> {
  const rows = await db
    .select()
    .from(tables.sessions)
    .where(and(eq(tables.sessions.userId, userId), gt(tables.sessions.expiresAt, Date.now())))
    .orderBy(desc(tables.sessions.lastSeenAt), desc(tables.sessions.createdAt));
  return rows.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt ?? s.createdAt,
    current: s.id === currentId,
  }));
}

/** End one of an account's sessions; false when it is not theirs. */
export async function endSession(userId: string, sessionId: string): Promise<boolean> {
  const ended = await db
    .delete(tables.sessions)
    .where(and(eq(tables.sessions.id, sessionId), eq(tables.sessions.userId, userId)))
    .returning({ id: tables.sessions.id });
  return ended.length > 0;
}

/** End every session of an account except, optionally, one to keep. */
export async function endSessions(userId: string, keep: string | null = null): Promise<number> {
  const ended = await db
    .delete(tables.sessions)
    .where(keep ? and(eq(tables.sessions.userId, userId), ne(tables.sessions.id, keep)) : eq(tables.sessions.userId, userId))
    .returning({ id: tables.sessions.id });
  return ended.length;
}

import { scryptSync, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId, newToken } from "./id";
import { clientIp } from "./ratelimit";

const SESSION_COOKIE = "fourty_session";
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Active workspace for this session (null if none selected). */
  workspaceId: string | null;
};

/** How often a session's "last seen" is written: not on every request. */
export const SEEN_EVERY_MS = 5 * 60 * 1000;

/** The device a request comes from, as a session records it. */
export type SessionClient = { userAgent: string | null; ip: string | null };

export function sessionClient(req: Request): SessionClient {
  const userAgent = req.headers.get("user-agent");
  const ip = clientIp(req);
  return { userAgent: userAgent ? userAgent.slice(0, 300) : null, ip: ip === "unknown" ? null : ip };
}

/**
 * Start a session: every sign-in path comes through here (password, SSO,
 * accepting an invite, first setup, a password change). It records the
 * device and the account's last sign-in, and drops that account's expired
 * sessions so the table does not keep them for good.
 */
export async function createSession(
  userId: string,
  workspaceId: string | null,
  client: SessionClient = { userAgent: null, ip: null },
): Promise<string> {
  const token = newToken();
  const now = Date.now();
  await db.delete(tables.sessions).where(and(eq(tables.sessions.userId, userId), lt(tables.sessions.expiresAt, now)));
  await db.insert(tables.sessions).values({
    id: sha256(token),
    userId,
    workspaceId,
    expiresAt: now + SESSION_TTL,
    createdAt: now,
    lastSeenAt: now,
    userAgent: client.userAgent,
    ip: client.ip,
  });
  await db.update(tables.users).set({ lastLoginAt: now }).where(eq(tables.users.id, userId));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL / 1000,
    secure: process.env.NODE_ENV === "production" && process.env.FOURTY_INSECURE_COOKIE !== "1",
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(tables.sessions).where(eq(tables.sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** The id of the session this request carries, or null. */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

/** Point the current session at a workspace its user has just joined. */
export async function setSessionWorkspace(workspaceId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db.update(tables.sessions).set({ workspaceId }).where(eq(tables.sessions.id, sha256(token)));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = (
    await db.select().from(tables.sessions).where(eq(tables.sessions.id, sha256(token))).limit(1)
  )[0];
  const now = Date.now();
  if (!session || session.expiresAt < now) return null;
  if ((session.lastSeenAt ?? 0) < now - SEEN_EVERY_MS) {
    await db.update(tables.sessions).set({ lastSeenAt: now }).where(eq(tables.sessions.id, session.id));
  }
  const user = (
    await db.select().from(tables.users).where(eq(tables.users.id, session.userId)).limit(1)
  )[0];
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    workspaceId: session.workspaceId ?? null,
  };
}

/** True when no user exists yet — first boot shows the setup screen. */
export async function isFreshInstall(): Promise<boolean> {
  const rows = await db.select({ id: tables.users.id }).from(tables.users).limit(1);
  return rows.length === 0;
}

export async function createUser(email: string, name: string, password: string, role = "member") {
  const id = newId();
  await db.insert(tables.users).values({
    id,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: hashPassword(password),
    role,
    createdAt: Date.now(),
  });
  return id;
}

/** Bounds shared with the signup routes, so a password set here can also be set there. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/**
 * Set a user's password out of band, for `npm run reset-password`.
 *
 * The way in when no other works: the emailed forgot-password link needs mail
 * and the admin-made link needs a signed-in admin, while the first account on a
 * fresh install exists before any mail is configured. Without this, one lost
 * admin password locks an instance out for good.
 *
 * Existing sessions are dropped with the old password: a reset is usually a
 * response to a password that may be known to someone else, and leaving live
 * cookies behind would defeat it.
 *
 * Returns false when no user has that address — callers report it rather than
 * treating a typo as a successful reset.
 */
export async function resetPassword(email: string, password: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  const user = (
    await db.select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.email, normalized)).limit(1)
  )[0];
  if (!user) return false;
  await setPassword(user.id, password);
  return true;
}

/**
 * The shared core of every reset path (the CLI above, the emailed-token flow in
 * password-reset.ts): change the hash and drop the user's sessions in one
 * transaction, so a password can never change without its sessions going too.
 */
export async function setPassword(userId: string, password: string): Promise<void> {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new Error(`password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(tables.users)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(tables.users.id, userId));
    await tx.delete(tables.sessions).where(eq(tables.sessions.userId, userId));
  });
}

// ── Workspaces & membership (identity plane — not RLS-scoped) ────────────────

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base || "workspace"}-${newId().slice(0, 6).toLowerCase()}`;
}

/** Create a workspace and add `ownerId` as its admin. Returns the workspace id. */
export async function createWorkspace(name: string, ownerId: string): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.insert(tables.workspaces).values({ id, name: name.trim() || "Workspace", slug: slugify(name), createdAt: now });
  await db.insert(tables.workspaceMembers).values({
    id: newId(),
    workspaceId: id,
    userId: ownerId,
    role: "admin",
    createdAt: now,
  });
  return id;
}

export type Membership = { workspaceId: string; role: string };

/**
 * Workspaces a user is still an active member of, with their role in each,
 * the one they joined first first. Sign-in opens a session in the first entry.
 */
export async function membershipsOf(userId: string): Promise<Membership[]> {
  const rows = await db
    .select({ workspaceId: tables.workspaceMembers.workspaceId, role: tables.workspaceMembers.role })
    .from(tables.workspaceMembers)
    .where(and(eq(tables.workspaceMembers.userId, userId), isNull(tables.workspaceMembers.deactivatedAt)))
    .orderBy(asc(tables.workspaceMembers.createdAt), asc(tables.workspaceMembers.workspaceId));
  return rows;
}

/** The user's role in a workspace, or null if not an active member (deactivated excluded). */
export async function roleInWorkspace(userId: string, workspaceId: string): Promise<string | null> {
  const row = (
    await db
      .select({ role: tables.workspaceMembers.role })
      .from(tables.workspaceMembers)
      .where(
        and(
          eq(tables.workspaceMembers.userId, userId),
          eq(tables.workspaceMembers.workspaceId, workspaceId),
          isNull(tables.workspaceMembers.deactivatedAt),
        ),
      )
      .limit(1)
  )[0];
  return row?.role ?? null;
}

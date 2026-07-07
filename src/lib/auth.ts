import { scryptSync, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId, newToken } from "./id";

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
};

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  const now = Date.now();
  await db
    .insert(tables.sessions)
    .values({ id: sha256(token), userId, expiresAt: now + SESSION_TTL, createdAt: now });
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

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = (
    await db.select().from(tables.sessions).where(eq(tables.sessions.id, sha256(token))).limit(1)
  )[0];
  if (!session || session.expiresAt < Date.now()) return null;
  const user = (
    await db.select().from(tables.users).where(eq(tables.users.id, session.userId)).limit(1)
  )[0];
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
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

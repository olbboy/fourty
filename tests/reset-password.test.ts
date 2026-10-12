import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./pg-setup";

/**
 * Out-of-band password reset (`npm run reset-password`).
 *
 * The only way back into an instance whose admin password is lost, so the parts
 * worth pinning are that the new password actually replaces the old one and
 * that live sessions do not survive the reset.
 */
describe("resetPassword", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let auth: typeof import("@/lib/auth");
  let newId: typeof import("@/lib/id").newId;

  const OLD = "old-password-123";
  const NEW = "new-password-456";
  let userId: string;
  let email: string;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    auth = await import("@/lib/auth");
    ({ newId } = await import("@/lib/id"));
  });

  async function seedUser(): Promise<{ id: string; email: string }> {
    const id = newId();
    // Lowercased the way createUser() stores it — newId() is mixed case, and a
    // seeded address the app could never produce would not test anything real.
    const addr = `reset-${id}@t.dev`.toLowerCase();
    await db.insert(tables.users).values({
      id,
      email: addr,
      name: "Reset Me",
      passwordHash: auth.hashPassword(OLD),
      role: "admin",
      createdAt: Date.now(),
    });
    return { id, email: addr };
  }

  it("replaces the password and kills every live session", async () => {
    ({ id: userId, email } = await seedUser());
    await db.insert(tables.sessions).values([
      { id: newId(), userId, workspaceId: null, expiresAt: Date.now() + 60_000, createdAt: Date.now() },
      { id: newId(), userId, workspaceId: null, expiresAt: Date.now() + 60_000, createdAt: Date.now() },
    ]);

    expect(await auth.resetPassword(email, NEW)).toBe(true);

    const [row] = await db
      .select({ hash: tables.users.passwordHash })
      .from(tables.users)
      .where(eq(tables.users.id, userId));
    expect(auth.verifyPassword(NEW, row.hash)).toBe(true);
    // The old password must stop working — otherwise the reset bought nothing.
    expect(auth.verifyPassword(OLD, row.hash)).toBe(false);

    const sessions = await db
      .select({ id: tables.sessions.id })
      .from(tables.sessions)
      .where(eq(tables.sessions.userId, userId));
    expect(sessions).toEqual([]);
  });

  it("matches the address case-insensitively, the way sign-in stores it", async () => {
    const seeded = await seedUser();
    expect(await auth.resetPassword(`  ${seeded.email.toUpperCase()}  `, NEW)).toBe(true);
  });

  it("reports an unknown address instead of silently doing nothing", async () => {
    expect(await auth.resetPassword("nobody@t.dev", NEW)).toBe(false);
  });

  it("refuses a password the signup routes would also refuse", async () => {
    const seeded = await seedUser();
    await expect(auth.resetPassword(seeded.email, "short")).rejects.toThrow(/8-200/);
    await expect(auth.resetPassword(seeded.email, "x".repeat(201))).rejects.toThrow(/8-200/);

    // A rejected reset must leave the old password working.
    const [row] = await db
      .select({ hash: tables.users.passwordHash })
      .from(tables.users)
      .where(eq(tables.users.id, seeded.id));
    expect(auth.verifyPassword(OLD, row.hash)).toBe(true);
  });
});

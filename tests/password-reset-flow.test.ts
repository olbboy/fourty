import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "./pg-setup";
import { __setMailer, type MailMessage } from "@/lib/mail";

/**
 * The emailed forgot-password flow, driven through the real routes: request a
 * link, redeem it, and every way a token must refuse to work twice. The mailer
 * is the injected fake; QUEUE_DRIVER is inline under test, so the mail job has
 * already run by the time the request returns.
 */
describe("forgot/reset password flow", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let auth: typeof import("@/lib/auth");
  let newId: typeof import("@/lib/id").newId;
  let forgotRoute: typeof import("@/app/api/auth/forgot/route");
  let resetRoute: typeof import("@/app/api/auth/reset/route");

  const OLD = "old-password-123";
  const NEW = "fresh-password-456";
  let email: string;
  let userId: string;
  let sent: MailMessage[];

  const post = (url: string, body: unknown) =>
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  /** The /reset?token=… link from the last email, reduced to its token. */
  function tokenFromMail(): string {
    const m = sent.at(-1)?.text.match(/\/reset\?token=([A-Za-z0-9_%-]+)/);
    if (!m) throw new Error("no reset link in the captured mail");
    return decodeURIComponent(m[1]);
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    auth = await import("@/lib/auth");
    ({ newId } = await import("@/lib/id"));
    forgotRoute = await import("@/app/api/auth/forgot/route");
    resetRoute = await import("@/app/api/auth/reset/route");

    userId = newId();
    email = `flow-${userId}@t.dev`.toLowerCase();
    await db.insert(tables.users).values({
      id: userId,
      email,
      name: "Flow Test",
      passwordHash: auth.hashPassword(OLD),
      role: "admin",
      createdAt: Date.now(),
    });
  });

  afterEach(() => __setMailer(undefined));

  beforeEach(async () => {
    // Every request in this file shares one client IP, and the forgot budget is
    // five per window — tight enough that the suite itself would trip it.
    const { __resetRateLimits } = await import("@/lib/ratelimit");
    __resetRateLimits();
  });

  function captureMail() {
    sent = [];
    __setMailer({ transport: "test", from: "t@t.dev", send: async (m) => void sent.push(m) });
  }

  it("emails a working reset link that changes the password and kills sessions", async () => {
    captureMail();
    await db.insert(tables.sessions).values({
      id: newId(),
      userId,
      workspaceId: null,
      expiresAt: Date.now() + 60_000,
      createdAt: Date.now(),
    });

    const res = await forgotRoute.POST(post("/api/auth/forgot", { email }));
    expect(res.status).toBe(200);
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe(email);

    const redeem = await resetRoute.POST(
      post("/api/auth/reset", { token: tokenFromMail(), password: NEW }),
    );
    expect(redeem.status).toBe(200);

    const [row] = await db
      .select({ hash: tables.users.passwordHash })
      .from(tables.users)
      .where(eq(tables.users.id, userId));
    expect(auth.verifyPassword(NEW, row.hash)).toBe(true);
    expect(auth.verifyPassword(OLD, row.hash)).toBe(false);

    const sessions = await db
      .select({ id: tables.sessions.id })
      .from(tables.sessions)
      .where(eq(tables.sessions.userId, userId));
    expect(sessions).toEqual([]);
  });

  it("answers 200 for an unknown address and sends nothing", async () => {
    captureMail();
    const res = await forgotRoute.POST(post("/api/auth/forgot", { email: "ghost@t.dev" }));
    // The same answer as the known-address case — the difference must not be
    // observable, or the endpoint enumerates accounts.
    expect(res.status).toBe(200);
    expect(sent.length).toBe(0);
  });

  it("refuses a token the second time", async () => {
    captureMail();
    await forgotRoute.POST(post("/api/auth/forgot", { email }));
    const token = tokenFromMail();

    expect((await resetRoute.POST(post("/api/auth/reset", { token, password: NEW }))).status).toBe(200);
    const replay = await resetRoute.POST(post("/api/auth/reset", { token, password: "another-pass-789" }));
    expect(replay.status).toBe(400);
  });

  it("only the newest link works — requesting again retires the old one", async () => {
    captureMail();
    await forgotRoute.POST(post("/api/auth/forgot", { email }));
    const first = tokenFromMail();
    await forgotRoute.POST(post("/api/auth/forgot", { email }));
    const second = tokenFromMail();
    expect(second).not.toBe(first);

    expect((await resetRoute.POST(post("/api/auth/reset", { token: first, password: NEW }))).status).toBe(400);
    expect((await resetRoute.POST(post("/api/auth/reset", { token: second, password: NEW }))).status).toBe(200);
  });

  it("refuses an expired token", async () => {
    captureMail();
    await forgotRoute.POST(post("/api/auth/forgot", { email }));
    const token = tokenFromMail();
    // Age the row rather than the clock: sha256(token) finds it directly.
    const { sha256 } = auth;
    await db
      .update(tables.passwordResets)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(tables.passwordResets.tokenHash, sha256(token)));

    const res = await resetRoute.POST(post("/api/auth/reset", { token, password: NEW }));
    expect(res.status).toBe(400);
  });

  it("sends nothing when mail is unconfigured, still answering 200", async () => {
    sent = [];
    __setMailer(null); // force "mail disabled"
    const res = await forgotRoute.POST(post("/api/auth/forgot", { email }));
    expect(res.status).toBe(200);
    expect(sent.length).toBe(0);
  });
});

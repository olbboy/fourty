import { beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb } from "./pg-setup";
import { base32Encode, base32Decode, totp, verifyTotp, generateBackupCodes, otpauthUri } from "@/lib/totp";

/**
 * 2FA (Gate D2). Two layers: the TOTP/Base32 primitives against the RFC 6238 test
 * vector, and the full enroll → login → disable flow through the real handlers.
 * next/headers cookies() is mocked with an in-memory jar so session-based routes
 * (getSessionUser / createSession) run under vitest.
 */

// In-memory cookie jar so session routes work without a Next request scope.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => {
      jar.set(k, v);
    },
    delete: (k: string) => {
      jar.delete(k);
    },
  }),
}));

describe("TOTP primitives (RFC 6238)", () => {
  // RFC 6238 test vector: ASCII secret "12345678901234567890", T=59 → step 1.
  const SECRET = base32Encode(Buffer.from("12345678901234567890"));

  it("base32 round-trips", () => {
    expect(base32Decode(SECRET).toString()).toBe("12345678901234567890");
  });

  it("matches the RFC 6238 6-digit code at T=59", () => {
    expect(totp(SECRET, 59)).toBe("287082"); // last 6 of the RFC's 94287082
  });

  it("verifies within the skew window and rejects otherwise", () => {
    const now = 59_000; // ms
    expect(verifyTotp(SECRET, "287082", 1, now)).toBe(true);
    expect(verifyTotp(SECRET, "000000", 1, now)).toBe(false);
    expect(verifyTotp(SECRET, "28708", 1, now)).toBe(false); // wrong length
  });

  it("generates 10 distinct backup codes and an otpauth URI", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    expect(otpauthUri(SECRET, "a@b.io")).toMatch(/^otpauth:\/\/totp\/Fourty:a%40b\.io\?/);
  });
});

describe("2FA enroll → login → disable (real handlers)", () => {
  const EMAIL = "tfa@test.dev";
  const PASSWORD = "correcthorse";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let createUser: typeof import("@/lib/auth").createUser;
  let createSession: typeof import("@/lib/auth").createSession;
  let eq: typeof import("drizzle-orm").eq;
  let setup: typeof import("@/app/api/2fa/setup/route");
  let enable: typeof import("@/app/api/2fa/enable/route");
  let disable: typeof import("@/app/api/2fa/disable/route");
  let status: typeof import("@/app/api/2fa/status/route");
  let login: typeof import("@/app/api/auth/login/route");
  let userId: string;
  let secret: string;

  const jsonReq = (url: string, bodyObj: unknown) =>
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyObj),
    });

  beforeAll(async () => {
    await resetDb();
    jar.clear();
    ({ db, tables } = await import("@/db"));
    ({ createUser, createSession } = await import("@/lib/auth"));
    ({ eq } = await import("drizzle-orm"));
    setup = await import("@/app/api/2fa/setup/route");
    enable = await import("@/app/api/2fa/enable/route");
    disable = await import("@/app/api/2fa/disable/route");
    status = await import("@/app/api/2fa/status/route");
    login = await import("@/app/api/auth/login/route");

    userId = await createUser(EMAIL, "TFA User", PASSWORD);
    await createSession(userId, null); // establishes the session cookie in the jar
  });

  it("reports 2FA off, then pending after setup", async () => {
    expect((await (await status.GET()).json()).enabled).toBe(false);
    const res = await setup.POST();
    const body = await res.json();
    expect(body.secret).toBeTruthy();
    expect(body.otpauthUri).toMatch(/^otpauth:/);
    secret = body.secret;
    expect((await (await status.GET()).json()).pending).toBe(true);
  });

  it("rejects a bad enrollment code and accepts a valid one", async () => {
    const bad = await enable.POST(jsonReq("/api/2fa/enable", { token: "000000" }));
    expect(bad.status).toBe(400);

    const code = totp(secret, Math.floor(Date.now() / 1000));
    const ok = await enable.POST(jsonReq("/api/2fa/enable", { token: code }));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.enabled).toBe(true);
    expect(body.backupCodes).toHaveLength(10);
    expect((await (await status.GET()).json()).enabled).toBe(true);
  });

  it("blocks login without a second factor, allows it with a valid TOTP", async () => {
    const noToken = await login.POST(jsonReq("/api/auth/login", { email: EMAIL, password: PASSWORD }));
    expect(noToken.status).toBe(401);
    expect((await noToken.json()).requires2fa).toBe(true);

    const wrong = await login.POST(jsonReq("/api/auth/login", { email: EMAIL, password: PASSWORD, token: "000000" }));
    expect(wrong.status).toBe(401);

    const code = totp(secret, Math.floor(Date.now() / 1000));
    const ok = await login.POST(jsonReq("/api/auth/login", { email: EMAIL, password: PASSWORD, token: code }));
    expect(ok.status).toBe(200);
  });

  it("accepts a one-time backup code and consumes it", async () => {
    // Grab a plaintext backup code from a fresh enable? We only have hashes stored.
    // Re-enroll to capture plaintext codes, then use one.
    await db.update(tables.users).set({ totpEnabled: 0, totpSecret: null, backupCodes: "[]" }).where(eq(tables.users.id, userId));
    const s = await (await setup.POST()).json();
    secret = s.secret;
    const enableRes = await enable.POST(jsonReq("/api/2fa/enable", { token: totp(secret, Math.floor(Date.now() / 1000)) }));
    const codes: string[] = (await enableRes.json()).backupCodes;

    const ok = await login.POST(jsonReq("/api/auth/login", { email: EMAIL, password: PASSWORD, token: codes[0] }));
    expect(ok.status).toBe(200);
    // Same code cannot be reused.
    const reuse = await login.POST(jsonReq("/api/auth/login", { email: EMAIL, password: PASSWORD, token: codes[0] }));
    expect(reuse.status).toBe(401);
    const remaining: string[] = JSON.parse(
      (await db.select().from(tables.users).where(eq(tables.users.id, userId)))[0].backupCodes,
    );
    expect(remaining).toHaveLength(9);
  });

  it("requires the password to disable 2FA", async () => {
    const wrong = await disable.POST(jsonReq("/api/2fa/disable", { password: "nope" }));
    expect(wrong.status).toBe(403);
    const ok = await disable.POST(jsonReq("/api/2fa/disable", { password: PASSWORD }));
    expect(ok.status).toBe(200);
    expect((await (await status.GET()).json()).enabled).toBe(false);
    // Login now works without a token.
    const login2 = await login.POST(jsonReq("/api/auth/login", { email: EMAIL, password: PASSWORD }));
    expect(login2.status).toBe(200);
  });
});

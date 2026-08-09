import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";
import { db, tables, withWorkspace } from "@/db";
import { newId } from "@/lib/id";
import { rekeyAll } from "@/lib/crypto/rekey";
import {
  open,
  RETIRED_KEYS_ENV,
  sealedWithCurrentKey,
  seal,
  SECRET_KEY_ENV,
  SecretKeyError,
} from "@/lib/crypto/secrets";
import { readAccountConfig, writeAccountConfig } from "@/lib/sync/account-config";

/**
 * Key rotation end-to-end against real Postgres (ADR-019).
 *
 * The property that makes a rotation safe is that **nothing is unreadable at
 * any point**: the app reads with the new key and the old one at once, so the
 * re-key walk can happen while it serves traffic. Every test here is a step of
 * the documented procedure.
 */

const OLD_KEY = Buffer.alloc(32, 1).toString("base64");
const NEW_KEY = Buffer.alloc(32, 2).toString("base64");
const TOKEN = "refresh-token-fixture-not-a-real-credential";

const originalPrimary = process.env[SECRET_KEY_ENV];
const originalRetired = process.env[RETIRED_KEYS_ENV];

afterEach(() => {
  if (originalPrimary === undefined) delete process.env[SECRET_KEY_ENV];
  else process.env[SECRET_KEY_ENV] = originalPrimary;
  if (originalRetired === undefined) delete process.env[RETIRED_KEYS_ENV];
  else process.env[RETIRED_KEYS_ENV] = originalRetired;
});

describe("reading across a rotation", () => {
  it("reads a value sealed with the retired key once it is listed", () => {
    process.env[SECRET_KEY_ENV] = OLD_KEY;
    delete process.env[RETIRED_KEYS_ENV];
    const sealed = seal(TOKEN);

    // Step 2 of the procedure: new key primary, old one retired.
    process.env[SECRET_KEY_ENV] = NEW_KEY;
    process.env[RETIRED_KEYS_ENV] = OLD_KEY;
    expect(open(sealed)).toBe(TOKEN);
    // …but it is not yet sealed with what we encrypt with today.
    expect(sealedWithCurrentKey(sealed)).toBe(false);
  });

  it("refuses when the retired key was dropped too early", () => {
    process.env[SECRET_KEY_ENV] = OLD_KEY;
    const sealed = seal(TOKEN);
    process.env[SECRET_KEY_ENV] = NEW_KEY;
    delete process.env[RETIRED_KEYS_ENV];
    // The error has to name the recovery, or an operator mid-rotation is stuck.
    expect(() => open(sealed)).toThrow(/FOURTY_SECRET_KEY_OLD/);
  });

  it("accepts several retired keys, for a rotation that was interrupted", () => {
    process.env[SECRET_KEY_ENV] = OLD_KEY;
    const older = seal(TOKEN);
    const third = Buffer.alloc(32, 3).toString("base64");
    process.env[SECRET_KEY_ENV] = third;
    const middle = seal("second-generation");

    process.env[SECRET_KEY_ENV] = NEW_KEY;
    process.env[RETIRED_KEYS_ENV] = `${OLD_KEY}, ${third}`;
    expect(open(older)).toBe(TOKEN);
    expect(open(middle)).toBe("second-generation");
  });

  it("still encrypts with the primary only", () => {
    process.env[SECRET_KEY_ENV] = NEW_KEY;
    process.env[RETIRED_KEYS_ENV] = OLD_KEY;
    expect(sealedWithCurrentKey(seal(TOKEN))).toBe(true);
  });
});

describe("the re-key walk (Postgres)", () => {
  let wsA: string;
  let wsB: string;

  const account = async (ws: string, config: string) => {
    const id = newId();
    await withWorkspace(ws, () =>
      db.insert(tables.syncAccounts).values({
        id,
        provider: "google",
        email: "me@myco.example",
        config,
        createdAt: Date.now(),
      }),
    );
    return id;
  };

  const configOf = async (ws: string, id: string) =>
    withWorkspace(
      ws,
      async () =>
        (await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, id)).limit(1))[0]!
          .config,
    );

  beforeAll(async () => {
    await resetDb();
    wsA = await createWorkspace();
    wsB = await createWorkspace();
  });

  beforeEach(async () => {
    for (const ws of [wsA, wsB]) await withWorkspace(ws, () => db.delete(tables.syncAccounts));
    process.env[SECRET_KEY_ENV] = NEW_KEY;
    process.env[RETIRED_KEYS_ENV] = OLD_KEY;
  });

  it("rewrites rows sealed with the retired key, across every workspace", async () => {
    process.env[SECRET_KEY_ENV] = OLD_KEY;
    delete process.env[RETIRED_KEYS_ENV];
    const a = await account(wsA, writeAccountConfig({ refreshToken: TOKEN }));
    const b = await account(wsB, writeAccountConfig({ refreshToken: "other-tenant-token" }));

    process.env[SECRET_KEY_ENV] = NEW_KEY;
    process.env[RETIRED_KEYS_ENV] = OLD_KEY;
    const result = await rekeyAll();

    expect(result.rotated).toBe(2);
    expect(result.encrypted).toBe(0);
    expect(result.workspaces).toBeGreaterThanOrEqual(2);

    // Now readable with the new key alone — which is what makes dropping the
    // old one safe.
    delete process.env[RETIRED_KEYS_ENV];
    expect(readAccountConfig(await configOf(wsA, a)).refreshToken).toBe(TOKEN);
    expect(readAccountConfig(await configOf(wsB, b)).refreshToken).toBe("other-tenant-token");
  });

  it("seals rows that predate the key at all", async () => {
    const id = await account(wsA, JSON.stringify({ refreshToken: TOKEN, expiresAt: 5 }));

    const result = await rekeyAll();

    expect(result.encrypted).toBe(1);
    const stored = await configOf(wsA, id);
    expect(stored).not.toContain(TOKEN);
    expect(readAccountConfig(stored).refreshToken).toBe(TOKEN);
    // Fields that are not credentials survive the rewrite.
    expect(JSON.parse(stored).expiresAt).toBe(5);
  });

  it("leaves current rows alone, so it is re-runnable and its report means something", async () => {
    await account(wsA, writeAccountConfig({ refreshToken: TOKEN }));
    const first = await rekeyAll();
    expect(first.untouched).toBe(1);
    expect(first.rotated + first.encrypted).toBe(0);

    const second = await rekeyAll();
    expect(second.untouched).toBe(1);
  });

  it("counts a mailbox with no credentials as nothing to do", async () => {
    await account(wsA, JSON.stringify({ url: "https://cal.example/f.ics" }));
    const result = await rekeyAll();
    expect(result.untouched).toBe(1);
    expect(result.rotated + result.encrypted).toBe(0);
  });

  it("reports without writing on a dry run", async () => {
    const id = await account(wsA, JSON.stringify({ refreshToken: TOKEN }));
    const result = await rekeyAll({ dryRun: true });

    expect(result.encrypted).toBe(1);
    // Still plaintext: a dry run that wrote would be worse than no dry run.
    expect(await configOf(wsA, id)).toContain(TOKEN);
  });

  it("refuses to run with no key to re-encrypt to", async () => {
    delete process.env[SECRET_KEY_ENV];
    await expect(rekeyAll()).rejects.toThrow(SecretKeyError);
  });
});

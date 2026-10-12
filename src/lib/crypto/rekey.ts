import { eq } from "drizzle-orm";
import { db, tables, withWorkspace } from "@/db";
import {
  peekAccountConfig,
  readAccountConfig,
  SEALED_FIELDS,
  writeAccountConfig,
} from "@/lib/sync/account-config";
import { isSealed, sealedWithCurrentKey, secretKey, SecretKeyError, SECRET_KEY_ENV } from "./secrets";

/**
 * Re-encrypt every stored secret under the current key (ADR-019).
 *
 * Two jobs, one walk:
 *
 * 1. **Rotation.** Put the new key in `FOURTY_SECRET_KEY`, move the old one to
 *    `FOURTY_SECRET_KEY_OLD`, run this, then drop the old one. Reads never stop
 *    working, because `open()` tries both.
 * 2. **First encryption.** An install that has just set a key for the first
 *    time has rows still holding plaintext. They would be sealed lazily on the
 *    next token refresh anyway; this does it now, so "is anything still in the
 *    clear?" has an answer rather than a wait.
 *
 * Rows already sealed under the current key are left untouched, so the command
 * is re-runnable and its report means something.
 *
 * It enumerates `workspaces` — the tenant registry, not tenant data — and then
 * does the work inside `withWorkspace()` per tenant, so RLS scopes every read
 * and write exactly as it does for the app.
 */

export type RekeyResult = {
  workspaces: number;
  /** Rows inspected. */
  scanned: number;
  /** Rows that were sealed under a retired key and are now current. */
  rotated: number;
  /** Rows that held plaintext and are now sealed. */
  encrypted: number;
  /** Rows already current. */
  untouched: number;
};

export type RekeyOptions = { dryRun?: boolean };

export async function rekeyAll(opts: RekeyOptions = {}): Promise<RekeyResult> {
  if (secretKey() === null) {
    throw new SecretKeyError(
      `${SECRET_KEY_ENV} is not set — there is nothing to re-encrypt to. Set it first (openssl rand -base64 32).`,
    );
  }
  const result: RekeyResult = { workspaces: 0, scanned: 0, rotated: 0, encrypted: 0, untouched: 0 };
  const workspaces = await db.select({ id: tables.workspaces.id }).from(tables.workspaces);

  for (const ws of workspaces) {
    result.workspaces += 1;
    await withWorkspace(ws.id, async () => {
      const accounts = await db.select().from(tables.syncAccounts);
      for (const account of accounts) {
        result.scanned += 1;
        const state = classify(account.config);
        if (state === "current") {
          result.untouched += 1;
          continue;
        }
        if (state === "plaintext") result.encrypted += 1;
        else result.rotated += 1;
        if (opts.dryRun) continue;

        // Decrypt with whichever key works, then write with the current one.
        // Going through the same boundary the app uses means the set of fields
        // treated as secret cannot drift away from what this command rewrites.
        const cfg = readAccountConfig(account.config);
        await db
          .update(tables.syncAccounts)
          .set({ config: writeAccountConfig(cfg) })
          .where(eq(tables.syncAccounts.id, account.id));
      }
    });
  }
  return result;
}

type RowState = "current" | "retired" | "plaintext";

/**
 * What needs doing to this row. A row with no secrets at all — an ICS feed —
 * counts as current: there is nothing in it to encrypt.
 */
function classify(raw: string): RowState {
  const cfg = peekAccountConfig(raw);
  const values = SEALED_FIELDS.map((f) => cfg[f]).filter(
    (v): v is string => typeof v === "string" && v !== "",
  );
  if (values.length === 0) return "current";
  if (values.every((v) => sealedWithCurrentKey(v))) return "current";
  return values.some((v) => !isSealed(v)) ? "plaintext" : "retired";
}

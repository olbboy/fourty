/**
 * rekey — re-encrypt every stored secret under the current key (ADR-019).
 *
 * Rotating a key:
 *
 *   1. generate a new one:   openssl rand -base64 32
 *   2. in .env, move the current FOURTY_SECRET_KEY to FOURTY_SECRET_KEY_OLD
 *      and put the new one in FOURTY_SECRET_KEY
 *   3. restart the app and worker (both read both keys)
 *   4. npm run rekey
 *   5. remove FOURTY_SECRET_KEY_OLD and restart again
 *
 * Nothing is unreadable at any point: reads try the current key and then the
 * retired ones. Step 4 is what lets step 5 be safe.
 *
 *   npm run rekey              # rewrite what needs it
 *   npm run rekey -- --dry-run # report only
 *
 * Also the way to encrypt rows that predate the key on an install that has just
 * set one for the first time. Re-runnable: rows already current are skipped.
 */
import { rekeyAll } from "../src/lib/crypto/rekey";
import { SecretKeyError } from "../src/lib/crypto/secrets";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const result = await rekeyAll({ dryRun });

  const verb = dryRun ? "would be" : "were";
  console.log(
    [
      `${dryRun ? "Dry run — nothing written." : "Re-key complete."}`,
      `  workspaces scanned : ${result.workspaces}`,
      `  mailboxes scanned  : ${result.scanned}`,
      `  rotated to the current key ${verb} : ${result.rotated}`,
      `  encrypted for the first time ${verb}: ${result.encrypted}`,
      `  already current    : ${result.untouched}`,
    ].join("\n"),
  );

  if (!dryRun && result.rotated + result.encrypted > 0) {
    console.log("\nEverything is now sealed with FOURTY_SECRET_KEY.");
    console.log("You can remove FOURTY_SECRET_KEY_OLD and restart.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    if (err instanceof SecretKeyError) {
      console.error(`rekey: ${err.message}`);
      process.exit(2);
    }
    console.error("rekey failed:", err);
    process.exit(1);
  });

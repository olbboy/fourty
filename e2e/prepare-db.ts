/**
 * Prepare the E2E database, run before the app boots.
 *
 * Playwright starts the `webServer` (and waits for it to answer) *before* running
 * globalSetup/tests, so the schema must exist before `next start` serves its first
 * request. This runs from the webServer command (see playwright.config.ts), ahead
 * of `next start`.
 *
 * Reuses `resetDb()` from the vitest harness (tests/pg-setup.ts): migrate once,
 * then TRUNCATE every public table so `isFreshInstall()` is true and the
 * first-boot wizard runs in auth.setup.ts.
 *
 * Guard: `resetDb()` defaults MIGRATE_DATABASE_URL to `fourty_test`. We pin it to
 * the E2E database and refuse unless the name contains "e2e", so a missing env can
 * never truncate the vitest database.
 */
async function main(): Promise<void> {
  const url =
    process.env.MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_e2e";
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.includes("e2e")) {
    throw new Error(
      `Refusing to reset database "${dbName}": E2E only targets a *_e2e database. ` +
        `Set MIGRATE_DATABASE_URL to the fourty_e2e database.`,
    );
  }
  // Pin the owner DSN before importing pg-setup (it reads the env at module load).
  process.env.MIGRATE_DATABASE_URL = url;

  const { resetDb } = await import("../tests/pg-setup");
  await resetDb();
  console.log(`E2E database "${dbName}" migrated and truncated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("E2E database preparation failed:", err);
    process.exit(1);
  });

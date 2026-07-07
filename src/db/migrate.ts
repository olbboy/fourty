/**
 * Apply all pending drizzle migrations (generated SQL + hand-written RLS/grant
 * migrations) to the target database. Run standalone (`npm run db:migrate`) or
 * imported by the test harness / migrate one-shot service.
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";

const DEFAULT_DSN = "postgresql://fourty:fourty@localhost:5432/fourty";

export async function runMigrations(url: string = process.env.DATABASE_URL ?? DEFAULT_DSN) {
  const pool = new pg.Pool({ connectionString: url });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } finally {
    await pool.end();
  }
}

const invokedDirectly = process.argv[1]?.endsWith("migrate.ts");
if (invokedDirectly) {
  runMigrations()
    .then(() => {
      console.log("migrations applied");
      process.exit(0);
    })
    .catch((err) => {
      console.error("migration failed:", err);
      process.exit(1);
    });
}

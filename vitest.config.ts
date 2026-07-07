import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB-touching tests share one Postgres database and reset it per file, so
    // files must not run in parallel (ADR-006 / pg-setup.ts).
    fileParallelism: false,
    env: {
      // App/query pool connects as the RLS-subject app role; migrations +
      // truncation use the owner role. Both target the dedicated test database.
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://fourty_app:fourty_app@localhost:5432/fourty_test",
      MIGRATE_DATABASE_URL:
        process.env.MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test",
      NODE_ENV: "test",
    },
  },
});

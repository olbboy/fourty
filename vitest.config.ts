import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  // Use the automatic JSX runtime so component modules render under vitest without
  // a React global (they rely on Next's automatic runtime in the app build).
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB-touching tests share one Postgres database and reset it per file, so
    // files must not run in parallel (ADR-006 / pg-setup.ts).
    fileParallelism: false,
    env: {
      // App/query pool connects as the RLS-subject app role; migrations +
      // truncation use the owner role. Both target the dedicated test database.
      //
      // Overridden through TEST_-prefixed variables, deliberately not through
      // DATABASE_URL: the suite truncates everything it connects to, and a
      // DATABASE_URL exported for local development would otherwise silently
      // redirect it at a real database.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://fourty_app:fourty_app@localhost:5432/fourty_test",
      MIGRATE_DATABASE_URL:
        process.env.TEST_MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test",
      // A fixed key so the suite exercises the *encrypted* path by default —
      // the interesting bugs are there, not in the legacy plaintext fallback,
      // which tests/secrets.test.ts covers by unsetting this deliberately.
      FOURTY_SECRET_KEY: "Zm91cnR5LXRlc3Qta2V5LWRvLW5vdC11c2UtaW4tcHI=",
      NODE_ENV: "test",
    },
  },
});

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
      // Every test process talks to the dedicated test database — never dev.
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_test",
      NODE_ENV: "test",
    },
  },
});

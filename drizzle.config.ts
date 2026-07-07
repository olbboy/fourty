import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty",
  },
  // Hand-written SQL migrations (RLS policies, FORCE RLS, grants — ADR-001/002)
  // live in the same ./drizzle sequence alongside generated ones.
});

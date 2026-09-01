import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright smoke harness for Fourty.
 *
 * Run order: webServer (`next build` → prepare the E2E database → `next start`)
 * → `setup` project (walk the first-boot wizard, save a signed-in storageState)
 * → `smoke` project (reuses that session for the kanban + ⌘K specs).
 *
 * Playwright starts the webServer before globalSetup/tests, so the schema is
 * prepared inside the webServer command (db:e2e:reset), ahead of `next start`.
 * The E2E database is a dedicated `fourty_e2e` (never the vitest `fourty_test`);
 * see scripts/e2e-db-setup.sh and e2e/prepare-db.ts.
 */
// Dedicated E2E port (not next dev's default 3000), so `reuseExistingServer`
// can never accidentally attach to — and seed — a developer's running dev app.
const APP_URL = "http://localhost:3100";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "smoke",
      // Every spec except the development-mode one, which needs `next dev` and
      // lives in playwright.dev.config.ts.
      testMatch: /.*\.spec\.ts/,
      testIgnore: /dev-warnings\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
  webServer: {
    // Build, migrate + truncate the E2E database, then boot — in that order so
    // the schema exists before the app answers its first request.
    command: "npm run build && npm run db:e2e:reset && npm run start",
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // App/query pool connects as the RLS-subject app role against the E2E DB.
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://fourty_app:fourty_app@localhost:5432/fourty_e2e",
      MIGRATE_DATABASE_URL:
        process.env.MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_e2e",
      // Session cookies default to Secure; allow them over plain HTTP localhost.
      FOURTY_INSECURE_COOKIE: "1",
      // Connecting any mailbox — including an ICS feed, whose URL is itself a
      // credential (ADR-019) — needs a key, so the E2E install is configured
      // like a real one. Test-only value.
      FOURTY_SECRET_KEY: "ZTJlLW9ubHkta2V5LW5vdC1mb3ItcHJvZHVjdGlvbiE=",
      NODE_ENV: "production",
      // Boot on the dedicated E2E port (matches APP_URL above).
      PORT: "3100",
      // The in-process limiter is 600 reads/min per caller+IP. A smoke run is
      // one IP, one admin, dozens of specs each firing a handful of GETs — it
      // self-DoS'd at 429, the dashboard treated `{ error }` as stats and
      // unmounted the shell, and list views spun forever. Same override the
      // bench uses; production defaults stay in src/lib/ratelimit.ts.
      RATELIMIT_READ: "100000000",
      RATELIMIT_WRITE: "100000000",
      RATELIMIT_BULK: "100000000",
      // Login is a separate IP budget (10 / 15 min in production). One smoke
      // IP plus CI retries of the 2FA sign-in would 429 the rest of the suite.
      RATELIMIT_LOGIN: "100000000",
      RATELIMIT_FORGOT: "100000000",
      RATELIMIT_RESET: "100000000",
      // Next.js loads the developer's `.env` into `next start`. E2E asserts the
      // unconfigured-mail path (no forgot-password link, invite shows the URL
      // instead of claiming a send). Empty strings beat `.env` because they are
      // already set — a local Resend/SMTP key must not silently enable a transport.
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      // Agent-panel smoke asserts the offline composer. Empty strings beat a
      // developer `.env` GLM/OpenAI key so those specs stay honest.
      AI_API_KEY: "",
      GLM_API_KEY: "",
      ZAI_API_KEY: "",
    },
  },
});

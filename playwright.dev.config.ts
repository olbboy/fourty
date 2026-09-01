import { defineConfig, devices } from "@playwright/test";

/**
 * The same app, run the way a developer runs it.
 *
 * `playwright.config.ts` builds for production, which is the right thing to
 * assert behaviour against — but a production build strips every framework
 * development warning, so an entire class of defect is invisible to it. Base UI
 * telling us a button rendered as an anchor had lost its native semantics is
 * one; React's hydration diagnostics are another. Neither exists in the bundle
 * that suite runs.
 *
 * So this config boots `next dev` and fails on any console output at all. It is
 * a separate file rather than a project because the two need different builds,
 * different ports, and a different `NODE_ENV`.
 *
 * Two collisions to know about:
 *  - Next keys its dev lock on the build directory, so this uses its own via
 *    `NEXT_DIST_DIR` and can run beside `npm run dev`.
 *  - Both configs sign in through `e2e/.auth/user.json` against the same E2E
 *    database, so run them one at a time.
 */
const APP_URL = "http://localhost:3110";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
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
      // Only the dev-mode spec. The behavioural specs belong on the production
      // build, where they assert what users actually get.
      name: "dev-warnings",
      testMatch: /dev-warnings\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
    },
  ],
  webServer: {
    command: "npm run db:e2e:reset && npm run dev -- -p 3110",
    url: APP_URL,
    // Never attach to a server this config did not start: a developer's own
    // `next dev` is pointed at their database, and the setup project seeds.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://fourty_app:fourty_app@localhost:5432/fourty_e2e",
      MIGRATE_DATABASE_URL:
        process.env.MIGRATE_DATABASE_URL ?? "postgresql://fourty:fourty@localhost:5432/fourty_e2e",
      FOURTY_INSECURE_COOKIE: "1",
      FOURTY_SECRET_KEY: "ZTJlLW9ubHkta2V5LW5vdC1mb3ItcHJvZHVjdGlvbiE=",
      // Its own build directory, so this coexists with a running `npm run dev`.
      NEXT_DIST_DIR: ".next-e2e-dev",
      // Same reason as playwright.config.ts: one admin IP would trip the
      // production 600-read window across the suite.
      RATELIMIT_READ: "100000000",
      RATELIMIT_WRITE: "100000000",
      RATELIMIT_BULK: "100000000",
      RATELIMIT_LOGIN: "100000000",
      RATELIMIT_FORGOT: "100000000",
      RATELIMIT_RESET: "100000000",
      // Same as playwright.config.ts: e2e is the unconfigured-mail path.
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
    },
  },
});

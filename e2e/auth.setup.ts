import { mkdir } from "node:fs/promises";
import { test as setup, expect } from "@playwright/test";
import { ADMIN, STORAGE_STATE } from "./helpers/auth";
import {
  loginIdHiddenBrowser,
  loginEmptyCompaniesBrowser,
  loginRestrictedBrowser,
  seedRestrictedFixture,
} from "./helpers/restricted-session";

/**
 * First-boot setup wizard — the Setup flow itself, and the source of the shared
 * signed-in session the `smoke` project depends on.
 *
 * On a freshly-truncated E2E database `/` redirects to `/login`, which renders in
 * "setup" mode (name field + "Load sample data" checkbox, checked by default).
 * We create the admin, keep the demo-seed checkbox on (so kanban/⌘K have data),
 * land on /dashboard, and persist the session cookie to STORAGE_STATE.
 */
setup("first-boot wizard creates the workspace", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.fill("input[name=name]", ADMIN.name);
  await page.fill("input[name=email]", ADMIN.email);
  await page.fill("input[name=password]", ADMIN.password);
  // Leave "Load sample data" checked — the smoke specs assert against demo data.
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await mkdir("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });

  // Seed the restricted role after the admin wizard has established the real
  // workspace. The helper writes only to the guarded fourty_e2e database, then
  // this setup logs in through /login so the saved state contains an actual
  // application session rather than a fabricated cookie.
  await seedRestrictedFixture();
  const restrictedContext = await loginRestrictedBrowser(
    browser,
    new URL(page.url()).origin,
  );
  await restrictedContext.close();
  const idHiddenContext = await loginIdHiddenBrowser(browser, new URL(page.url()).origin);
  await idHiddenContext.close();
  const emptyCompaniesContext = await loginEmptyCompaniesBrowser(browser, new URL(page.url()).origin);
  await emptyCompaniesContext.close();
});

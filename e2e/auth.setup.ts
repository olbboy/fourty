import { test as setup, expect } from "@playwright/test";
import { ADMIN, STORAGE_STATE } from "./helpers/auth";

/**
 * First-boot setup wizard — the Setup flow itself, and the source of the shared
 * signed-in session the `smoke` project depends on.
 *
 * On a freshly-truncated E2E database `/` redirects to `/login`, which renders in
 * "setup" mode (name field + "Load sample data" checkbox, checked by default).
 * We create the admin, keep the demo-seed checkbox on (so kanban/⌘K have data),
 * land on /dashboard, and persist the session cookie to STORAGE_STATE.
 */
setup("first-boot wizard creates the workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.fill("input[name=name]", ADMIN.name);
  await page.fill("input[name=email]", ADMIN.email);
  await page.fill("input[name=password]", ADMIN.password);
  // Leave "Load sample data" checked — the smoke specs assert against demo data.
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().storageState({ path: STORAGE_STATE });
});

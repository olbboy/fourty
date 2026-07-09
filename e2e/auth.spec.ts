import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Login + Logout, on a fresh session.
 *
 * Opt out of the shared storageState: logout deletes the exact session token in
 * use, so signing in fresh here keeps the setup project's saved session valid for
 * the other smoke specs.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("admin can log in and log out", async ({ page }) => {
  await page.goto("/login");
  // The workspace now exists, so /login renders in "login" mode.
  await page.fill("input[name=email]", ADMIN.email);
  await page.fill("input[name=password]", ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Sign out from the desktop sidebar (first of the sidebar/mobile pair).
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

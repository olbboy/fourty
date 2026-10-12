import { test, expect, type Page } from "@playwright/test";
import { ADMIN } from "./helpers/auth";
import { totp } from "../src/lib/totp";

/**
 * Two-factor authentication, end to end: enroll from Settings (reading the
 * secret off the real enrollment dialog and computing a genuine RFC 6238 code
 * for it), sign in through the login form's second step — with a TOTP and with
 * a backup code, whose reuse must be refused — then disable with the account
 * password.
 *
 * Tests run in declaration order in one worker and share state through module
 * scope (secret, one saved backup code). The signed-out tests pin an empty
 * storageState: in @playwright/test, even `browser.newContext()` inherits the
 * project's `use` options — including the admin session — so a fresh context
 * is NOT signed out unless storageState is overridden.
 *
 * Production login is 10 attempts per IP per 15 minutes. The Playwright
 * webServer raises `RATELIMIT_LOGIN` so this file, the auth/invite specs, and a
 * CI retry share one IP without 429. The wrong-TOTP path is covered at
 * enrollment (same server-side verify), not re-proven at login.
 *
 * The file leaves the account 2FA-off, so the other specs' storage-state
 * session and the auth spec's password-only login stay valid in any order.
 */

let secret = "";
let backupCode = "";

function currentCode(): string {
  return totp(secret, Math.floor(Date.now() / 1000));
}

/** A six-digit code guaranteed wrong for this secret right now (skew window ±1). */
function wrongCode(): string {
  const now = Math.floor(Date.now() / 1000);
  const valid = new Set([totp(secret, now - 30), totp(secret, now), totp(secret, now + 30)]);
  for (const candidate of ["000000", "000001", "000002", "000003"]) {
    if (!valid.has(candidate)) return candidate;
  }
  throw new Error("unreachable: four candidates cannot all be valid");
}

function securityPanel(page: Page) {
  return page.locator("[data-slot=card]", {
    has: page.getByRole("heading", { name: "Two-factor authentication" }),
  });
}

/** Email + password, then the revealed second step with `code`. */
async function signInWithCode(page: Page, code: () => string) {
  await page.goto("/login");
  await page.fill("input[name=email]", ADMIN.email);
  await page.fill("input[name=password]", ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The first round-trip reveals the code step instead of an error.
  const tokenField = page.getByLabel("Two-factor code");
  await expect(tokenField).toBeVisible();
  await tokenField.fill(code());
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("enrolls from Settings and shows the backup codes once", async ({ page }) => {
  await page.goto("/settings");
  const panel = securityPanel(page);
  await expect(panel.getByTestId("twofa-state")).toHaveText("Off");

  await panel.getByRole("button", { name: "Turn on two-factor…" }).click();
  const dialog = page.getByRole("dialog", { name: "Set up two-factor authentication" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: /QR code/ })).toBeVisible();

  secret = (await dialog.getByTestId("twofa-secret").innerText()).replace(/\s+/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/); // 20 random bytes, Base32

  // A wrong code is refused and enrollment stays open…
  await dialog.getByLabel("Enter the 6-digit code from the app to confirm").fill(wrongCode());
  await dialog.getByRole("button", { name: "Turn on" }).click();
  await expect(dialog.getByText("Invalid code")).toBeVisible();

  // …the real one enables and hands over exactly ten one-time codes.
  await dialog.getByLabel("Enter the 6-digit code from the app to confirm").fill(currentCode());
  await dialog.getByRole("button", { name: "Turn on" }).click();
  const backup = page.getByRole("dialog", { name: "Save your backup codes" });
  await expect(backup).toBeVisible();
  await expect(backup.getByTestId("backup-code")).toHaveCount(10);
  backupCode = (await backup.getByTestId("backup-code").first().innerText()).trim();
  await backup.getByRole("button", { name: "Done" }).click();

  await expect(panel.getByTestId("twofa-state")).toHaveText("On");
});

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("the login form asks for the second factor and accepts a TOTP", async ({ page }) => {
    await signInWithCode(page, currentCode);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("a backup code signs in once, and its reuse is refused", async ({ page, context }) => {
    await signInWithCode(page, () => backupCode);
    await expect(page).toHaveURL(/\/dashboard/);

    // Same code again, from a signed-out state: consumed codes must not work.
    await context.clearCookies();
    await signInWithCode(page, () => backupCode);
    await expect(page.getByText("Invalid two-factor code")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test("disabling with the account password restores password-only login", async ({ page }) => {
  await page.goto("/settings");
  const panel = securityPanel(page);
  await panel.getByRole("button", { name: "Turn off…" }).click();
  const dialog = page.getByRole("dialog", { name: "Turn off two-factor authentication" });
  await dialog.getByLabel("Confirm your password").fill(ADMIN.password);
  await dialog.getByRole("button", { name: "Turn off" }).click();
  await expect(panel.getByTestId("twofa-state")).toHaveText("Off");
});

import { test, expect } from "@playwright/test";

/**
 * The browser half of forgot-password. SMTP is unconfigured under E2E, so the
 * full email round trip belongs to the unit suite (which injects a mailer);
 * what only this layer can prove is which page each kind of visitor sees.
 */

test("login page hides the forgot link while mail is unconfigured", async ({ browser }) => {
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await guest.newPage();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    // No transport → the link would lead to a page that can only shrug.
    await expect(page.getByRole("link", { name: "Forgot your password?" })).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test("the forgot page explains itself instead of offering a dead form", async ({ browser }) => {
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await guest.newPage();
    await page.goto("/forgot");
    await expect(page.getByText(/isn't set up on this instance/)).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  } finally {
    await guest.close();
  }
});

test("the reset page refuses a link with no token", async ({ browser }) => {
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await guest.newPage();
    await page.goto("/reset");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("missing its token");
  } finally {
    await guest.close();
  }
});

test("a bogus token gets one generic error from the API", async ({ browser }) => {
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await guest.newPage();
    await page.goto("/reset?token=bogus-token-value-123");
    await page.getByLabel("New password").fill("brand-new-pass-123");
    await page.getByLabel("Repeat it").fill("brand-new-pass-123");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(/invalid or has expired/);
  } finally {
    await guest.close();
  }
});

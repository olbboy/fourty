import { test, expect } from "@playwright/test";

/**
 * Phase 8: an admin hands a member a password reset link without mail or the
 * server; the member sets a new password with it, signs in, and renames
 * themselves from "My account".
 */
test("an admin's reset link lets a member back in, and they rename themselves", async ({ page, browser }) => {
  const stamp = Date.now();
  const name = `E2E Rescue ${stamp}`;
  const email = `e2e-rescue-${stamp}@fourty.test`;

  await page.goto("/settings");
  const members = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Team members" }) });
  await members.getByRole("textbox", { name: "Email address to invite" }).fill(email);
  await members.getByRole("combobox", { name: "Role for the invitee" }).selectOption("member");
  await members.getByRole("button", { name: "Invite", exact: true }).click();
  const invite = (await members.locator("code").innerText()).trim();

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(invite);
    await guestPage.getByLabel("Your name").fill(name);
    await guestPage.getByLabel("Choose a password").fill("first-password-123");
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);
    await guest.clearCookies(); // they forget the password

    // The admin makes a link and hands it over.
    await page.reload();
    await members.getByRole("button", { name: `Account of ${name}` }).click();
    await page.getByRole("menuitem", { name: "Make a password reset link" }).click();
    const link = (await members.getByTestId("reset-link").innerText()).trim();
    expect(link).toContain("/reset?token=");

    await guestPage.goto(link);
    await guestPage.getByLabel("New password").fill("second-password-123");
    await guestPage.getByLabel("Repeat it").fill("second-password-123");
    await guestPage.getByRole("button", { name: "Set new password" }).click();
    await expect(guestPage).toHaveURL(/\/login/);
    await guestPage.getByLabel("Email").fill(email);
    await guestPage.getByLabel("Password").fill("second-password-123");
    await guestPage.getByRole("button", { name: "Sign in" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);

    // Their own name, from the account menu.
    await guestPage.getByRole("button", { name: "Account menu" }).click();
    await guestPage.getByRole("menuitem", { name: "My account" }).click();
    await guestPage.getByLabel("Your name").fill(`${name} (renamed)`);
    await guestPage.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(guestPage.getByText("Name saved.")).toBeVisible();
  } finally {
    await guest.close();
  }
});

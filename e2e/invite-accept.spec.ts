import { test, expect } from "@playwright/test";

/**
 * Invite → accept, end to end and across two sessions.
 *
 * This is the only layer that can cover the redemption half: accepting sets a
 * session cookie and the invitee is, by definition, not the signed-in admin. The
 * unit suite drives the invite API with an admin key and stops there.
 *
 * SMTP is unconfigured under E2E, so the invite panel falls back to showing the
 * link — which is also the path an operator without mail actually uses.
 */

// Unique per run so repeat runs against the same database don't collide on the
// users.email unique index.
const invitee = `e2e-invitee-${Date.now()}@fourty.test`;
const INVITEE_PASSWORD = "invitee-password-123";

test("an invited teammate redeems the link and lands in the workspace", async ({ page, browser }) => {
  await page.goto("/settings");
  const members = page.locator("[data-slot=card]", {
    has: page.getByRole("heading", { name: "Team members" }),
  });
  await expect(members).toBeVisible();

  await members.getByRole("textbox", { name: "Email address to invite" }).fill(invitee);
  await members.getByRole("combobox", { name: "Role for the invitee" }).selectOption("member");
  await members.getByRole("button", { name: "Invite" }).click();

  // No SMTP here, so the panel says so and shows the link instead of claiming
  // it emailed one.
  await expect(members.getByText(/Email isn't configured/)).toBeVisible();
  const acceptUrl = (await members.locator("code").innerText()).trim();
  expect(acceptUrl).toContain("/accept?token=");

  // The invitee is a stranger to this browser, which is the whole point of the
  // token. The empty storageState is explicit: a bare newContext() inherits the
  // project's signed-in admin state, and the page would then offer to add the
  // workspace to the *admin's* account instead of showing the signup form.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(acceptUrl);
    await expect(guestPage.getByText("You've been invited to a workspace")).toBeVisible();

    await guestPage.getByLabel("Your name").fill("E2E Invitee");
    await guestPage.getByLabel("Choose a password").fill(INVITEE_PASSWORD);
    await guestPage.getByRole("button", { name: "Create account and join" }).click();

    // Accepting creates the account *and* its session, so the invitee arrives
    // signed in rather than bounced to /login.
    await expect(guestPage).toHaveURL(/\/dashboard/);

    // The token is single-use: replaying the same link must not re-admit anyone.
    await guest.clearCookies();
    await guestPage.goto(acceptUrl);
    await guestPage.getByLabel("Your name").fill("Replay");
    await guestPage.getByLabel("Choose a password").fill("replay-password-123");
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage.getByRole("main").getByRole("alert")).toContainText(/invalid or expired/i);
  } finally {
    await guest.close();
  }

  // The new member shows up for the admin.
  await page.reload();
  await expect(members.getByText(invitee)).toBeVisible();
});

test("the accept page refuses a link with no token", async ({ browser }) => {
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto("/accept");
    await expect(guestPage.getByRole("main").getByRole("alert")).toContainText(
      "missing its invite token",
    );
  } finally {
    await guest.close();
  }
});

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
  await members.getByRole("button", { name: "Invite", exact: true }).click();

  // No SMTP here, so the panel says so and shows the link instead of claiming
  // it emailed one.
  await expect(members.getByText(/Email isn't configured/)).toBeVisible();
  const acceptUrl = (await members.locator("code").innerText()).trim();
  expect(acceptUrl).toContain("/accept?token=");

  // The admin checks the link in their own browser: they are already in, so
  // there is nothing to join, and the link must stay usable for the invitee.
  await page.goto(acceptUrl);
  await expect(page.getByText("You're already in this workspace")).toBeVisible();
  await expect(page.getByRole("button", { name: "Join workspace" })).toHaveCount(0);

  // The invitee is a stranger to this browser, which is the whole point of the
  // token. The empty storageState is explicit: a bare newContext() inherits the
  // project's signed-in admin state, and the page would then offer to add the
  // workspace to the *admin's* account instead of showing the signup form.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(acceptUrl);
    await expect(guestPage.getByText("You've been invited to a workspace")).toBeVisible();
    // The form asks only for a name and a password, so the page says which
    // address the new account signs in with.
    await expect(guestPage.getByText(`Your sign-in email: ${invitee}`)).toBeVisible();

    await guestPage.getByLabel("Your name").fill("E2E Invitee");
    await guestPage.getByLabel("Choose a password").fill(INVITEE_PASSWORD);
    await guestPage.getByRole("button", { name: "Create account and join" }).click();

    // Accepting creates the account *and* its session, so the invitee arrives
    // signed in rather than bounced to /login.
    await expect(guestPage).toHaveURL(/\/dashboard/);

    // The token is single-use: replaying the same link must not re-admit anyone.
    // It says the invite was used and points to plain sign-in, rather than
    // claiming it expired (which read as "you are not in").
    await guest.clearCookies();
    await guestPage.goto(acceptUrl);
    await expect(guestPage.getByText(/Your sign-in email/)).toHaveCount(0);
    await guestPage.getByLabel("Your name").fill("Replay");
    await guestPage.getByLabel("Choose a password").fill("replay-password-123");
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage.getByText(/already been used/i)).toBeVisible();
    await expect(guestPage.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
    await expect(guestPage).toHaveURL(/\/accept\?token=/);
    expect((await guest.cookies()).some((c) => c.name === "fourty_session")).toBe(false);
  } finally {
    await guest.close();
  }

  // The new member shows up for the admin.
  await page.goto("/settings");
  await expect(members.getByText(invitee)).toBeVisible();
});

test("a removed member signs in from a new invite and lands back in the workspace", async ({ page, browser }) => {
  // Someone who joined, was removed, and is invited back: their account
  // exists, they are not in the workspace, so signing in is the way through.
  const returning = `e2e-returning-${Date.now()}@fourty.test`;
  const password = "returning-password-123";
  await page.goto("/settings");
  const members = page.locator("[data-slot=card]", {
    has: page.getByRole("heading", { name: "Team members" }),
  });
  const inviteLink = async () => {
    await members.getByRole("textbox", { name: "Email address to invite" }).fill(returning);
    await members.getByRole("combobox", { name: "Role for the invitee" }).selectOption("member");
    await members.getByRole("button", { name: "Invite", exact: true }).click();
    return (await members.locator("code").innerText()).trim();
  };

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(await inviteLink());
    await guestPage.getByLabel("Your name").fill("E2E Returning");
    await guestPage.getByLabel("Choose a password").fill(password);
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);

    await page.reload();
    await members.getByRole("button", { name: "Remove E2E Returning" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(members.getByRole("button", { name: "Remove E2E Returning" })).toHaveCount(0);
    const again = await inviteLink();

    await guest.clearCookies();
    await guestPage.goto(again);
    // A guest sees the signup form; submitting it for an address that already
    // has an account is what triggers the sign-in hand-off.
    await guestPage.getByLabel("Your name").fill("Should Not Matter");
    await guestPage.getByLabel("Choose a password").fill("irrelevant-pass-123");
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage.getByText("already has a Fourty account")).toBeVisible();
    await guestPage.getByRole("button", { name: "Go to sign in" }).click();
    await expect(guestPage).toHaveURL(/\/login\?next=/);

    await guestPage.getByLabel("Email").fill(returning);
    await guestPage.getByLabel("Password").fill(password);
    await guestPage.getByRole("button", { name: "Sign in" }).click();

    // The whole point of ?next=: straight back to the invite, signed in, with
    // the one-click join in front of them — no digging the link out again.
    await expect(guestPage).toHaveURL(/\/accept\?token=/);
    await expect(guestPage.getByText("You're signed in as")).toBeVisible();
    await guestPage.getByRole("button", { name: "Join workspace" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);
    // Joined and working, without signing in a second time.
    expect((await guestPage.request.get("/api/tasks/assignees")).status()).toBe(200);
  } finally {
    await guest.close();
  }
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

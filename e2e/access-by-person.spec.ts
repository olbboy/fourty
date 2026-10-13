import { test, expect } from "@playwright/test";
import { inviteAndJoin, signInAs } from "./helpers/members";

/**
 * Phase 11: what a member connected is shown under their name, and removing
 * them takes it back in the same step (the box is ticked by default).
 */
test("removing a member disconnects the calendar they connected", async ({ page, browser }) => {
  const mate = await inviteAndJoin(page, browser, "access");
  const session = await signInAs(browser, mate);
  try {
    const feed = await session.page.request.post("/api/sync/accounts", {
      data: { provider: "ics", email: mate.email, label: `Feed of ${mate.name}`, config: {} },
    });
    expect(feed.status()).toBe(201);
  } finally {
    await session.context.close();
  }

  await page.goto("/settings");
  const mailboxes = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Mailboxes & calendars" }) });
  await expect(mailboxes.getByText(`connected by ${mate.name}`)).toBeVisible();

  const members = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Team members" }) });
  await members.getByRole("button", { name: `Remove ${mate.name}` }).click();
  const dialog = page.getByRole("dialog");
  const revoke = dialog.getByRole("checkbox", { name: /disconnect their 1 mailbox/ });
  await expect(revoke).toBeChecked();
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(members.getByRole("button", { name: `Remove ${mate.name}` })).toHaveCount(0);

  const left = (await (await page.request.get("/api/sync/accounts")).json()) as { accounts: { email: string }[] };
  expect(left.accounts.some((a) => a.email === mate.email)).toBe(false);
});

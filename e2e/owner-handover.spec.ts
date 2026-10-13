import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Someone leaves: the admin finds the deals and tasks still in their name and
 * hands them to someone else in one go (Phase 4). Self-contained: it invites
 * its own leaver, so no other spec's records change hands.
 */
test("a departed member's deals and tasks are found and handed over", async ({ page, browser }) => {
  const stamp = Date.now();
  const leaver = `E2E Leaver ${stamp}`;
  const email = `e2e-leaver-${stamp}@fourty.test`;

  // 1. The leaver joins.
  await page.goto("/settings");
  const members = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Team members" }) });
  await members.getByRole("textbox", { name: "Email address to invite" }).fill(email);
  await members.getByRole("combobox", { name: "Role for the invitee" }).selectOption("member");
  await members.getByRole("button", { name: "Invite", exact: true }).click();
  const link = (await members.locator("code").innerText()).trim();
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(link);
    await guestPage.getByLabel("Your name").fill(leaver);
    await guestPage.getByLabel("Choose a password").fill("leaver-password-123");
    await guestPage.getByRole("button", { name: "Create account and join" }).click();
    await expect(guestPage).toHaveURL(/\/dashboard/);
  } finally {
    await guest.close();
  }

  // 2. Work in their name.
  const people = (await (await page.request.get("/api/tasks/assignees")).json()).assignees as { id: string; name: string }[];
  const leaverId = people.find((p) => p.name === leaver)!.id;
  for (const name of [`Handover A ${stamp}`, `Handover B ${stamp}`]) {
    expect((await page.request.post("/api/deals", { data: { name, ownerId: leaverId } })).status()).toBe(201);
  }
  for (const title of [`Handover task A ${stamp}`, `Handover task B ${stamp}`]) {
    expect((await page.request.post("/api/tasks", { data: { title, ownerId: leaverId } })).status()).toBe(201);
  }

  // 3. They leave.
  await page.reload();
  await members.getByRole("button", { name: `Remove ${leaver}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(members.getByRole("button", { name: `Remove ${leaver}` })).toHaveCount(0);
  const gone = `${leaver} (left)`;

  // 4. Their deals: still in their name, found by owner, handed over together.
  await page.goto("/deals");
  await page.getByRole("button", { name: "List view" }).click();
  await page.getByRole("combobox", { name: "Filter by owner" }).selectOption({ label: gone });
  const rows = page.getByRole("row").filter({ hasText: `Handover` });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(gone);
  await page.getByRole("checkbox", { name: "Select all shown" }).click();
  const bar = page.getByRole("region", { name: "Change the owner of the selected rows" });
  await expect(bar).toContainText("2 selected");
  await bar.getByRole("combobox", { name: "New owner" }).selectOption({ label: ADMIN.name });
  await bar.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No deals in this pipeline")).toBeVisible();
  await page.getByRole("combobox", { name: "Filter by owner" }).selectOption({ label: ADMIN.name });
  await expect(page.getByRole("row").filter({ hasText: `Handover A ${stamp}` })).toContainText(ADMIN.name);

  // 5. Their tasks: narrowed to them, then all handed over at once.
  await page.goto("/tasks");
  await page.getByRole("combobox", { name: "Filter by owner" }).selectOption({ label: gone });
  await expect(page.getByText(`Handover task A ${stamp}`)).toBeVisible();
  const taskBar = page.getByRole("region", { name: "Change the owner of the selected rows" });
  await expect(taskBar).toContainText("2 shown");
  await taskBar.getByRole("combobox", { name: "New owner" }).selectOption({ label: ADMIN.name });
  await taskBar.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("Nothing here")).toBeVisible();
});

import { test, expect } from "@playwright/test";
import { inviteAndJoin } from "./helpers/members";

/**
 * Phase 28: a removed member is brought back from the member list with one
 * button, and can be removed again (so is active).
 */
test("a removed member is reactivated from the member list", async ({ page, browser }) => {
  const mate = await inviteAndJoin(page, browser, "reactivate");
  await page.goto("/settings");
  const members = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Team members" }) });
  await members.getByRole("button", { name: `Remove ${mate.name}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await members.getByRole("button", { name: `Reactivate ${mate.name}` }).click();
  await expect(members.getByRole("button", { name: `Remove ${mate.name}` })).toBeVisible();
  await expect(members.getByRole("button", { name: `Reactivate ${mate.name}` })).toHaveCount(0);
});

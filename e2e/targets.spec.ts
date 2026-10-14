import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Phase 26: an admin types a member's target for the quarter on the Reports
 * page; it stays after a reload.
 */
test("an admin sets a quarter target on the owner table", async ({ page }) => {
  await page.goto("/reports");
  const target = page.getByRole("textbox", { name: `Target for ${ADMIN.name}` });
  await target.fill("123456789");
  await Promise.all([page.waitForResponse((res) => res.url().includes("/api/stats/owners")), target.blur()]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: `Target for ${ADMIN.name}` })).toHaveValue("123456789");
});

import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Phase 26: an admin types a member's target for the quarter on the Reports
 * page, written as people write money ("1.500.000.000"); it stays after a
 * reload and the row shows how much of it has been won.
 */
test("an admin sets a quarter target on the owner table", async ({ page }) => {
  await page.goto("/reports");
  const target = page.getByRole("textbox", { name: `Target for ${ADMIN.name}` });
  await target.fill("1.500.000.000");
  await Promise.all([page.waitForResponse((res) => res.url().includes("/api/stats/owners")), target.blur()]);
  await page.reload();
  const saved = page.getByRole("textbox", { name: `Target for ${ADMIN.name}` });
  await expect(saved).toHaveValue("1500000000");
  const row = page.getByRole("row").filter({ has: saved });
  await expect(row.getByRole("cell").nth(3)).toHaveText(/^\d+%$/);
});

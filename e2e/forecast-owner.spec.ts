import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * The quarterly forecast can put one column per owner instead of per
 * Breakdown field choice (Phase 6), so the pipeline of each person sits side
 * by side.
 */
test("the forecast splits its columns by owner on request", async ({ page }) => {
  const created = await page.request.post("/api/deals", {
    data: { name: `Forecast owner ${Date.now()}`, amount: 1_000, expectedCloseDate: Date.now() + 30 * 86_400_000 },
  });
  expect(created.status()).toBe(201);

  await page.goto("/reports");
  const byClose = page.locator("section", { has: page.getByRole("heading", { name: /Forecast by expected close/i }) });
  await expect(byClose).toBeVisible();
  await expect(byClose.getByRole("columnheader", { name: ADMIN.name })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Columns by" }).selectOption({ label: "Owner" });
  await expect(byClose.getByRole("columnheader", { name: ADMIN.name })).toBeVisible();
});

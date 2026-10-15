import { test, expect } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Q107: an admin picks who receives leads sent over the API without an owner;
 * the choice stays after a reload.
 */
test("an admin picks the default lead owner in Settings", async ({ page }) => {
  await page.goto("/settings");
  const select = page.getByRole("combobox", { name: "Default lead owner" });
  await Promise.all([page.waitForResponse((res) => res.url().includes("/api/settings/leads") && res.request().method() === "PATCH"), select.selectOption({ label: ADMIN.name })]);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Default lead owner" }).locator("option:checked")).toHaveText(ADMIN.name);

  // Leave the workspace as other specs expect it.
  await page.request.patch("/api/settings/leads", { data: { defaultOwnerId: null } });
});

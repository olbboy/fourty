import { test, expect } from "@playwright/test";

/**
 * Saved views on the built-in lists that were missing the bar (contacts already
 * had it). Each spec saves a view from the current filters and proves it
 * applies — the API already stored any entity; these screens never sent one.
 */

async function saveNamedView(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByLabel("New view name").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const chip = page.getByRole("button", { name, exact: true });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
}

test("companies list saves and applies a view", async ({ page }) => {
  await page.goto("/companies");
  await saveNamedView(page, "E2E orgs");
  const chip = page.getByRole("button", { name: "E2E orgs", exact: true });
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
});

test("deals list saves a view of the current pipeline", async ({ page }) => {
  await page.goto("/deals");
  await saveNamedView(page, "E2E pipeline");
});

test("tasks list saves the open/done filter", async ({ page }) => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "all tasks" }).click();
  await saveNamedView(page, "E2E all tasks");
});

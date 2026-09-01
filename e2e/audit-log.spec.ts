import { test, expect } from "@playwright/test";

/**
 * Audit log — the admin Settings panel for a feature that was API-only.
 * A real write (minting an API key) must show up as a row after reload, and
 * CSV export must be a navigation to the existing download endpoint, not a
 * fetch that would swallow the file.
 */

test("shows a write in the log and offers CSV export as a link", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Audit log" }) });
  await expect(panel).toBeVisible();

  const csv = panel.getByRole("link", { name: "Export CSV" });
  await expect(csv).toHaveAttribute("href", "/api/audit?format=csv");

  const keys = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "API keys" }) });
  await keys.getByLabel("Name for the new API key").fill("E2E audit probe");
  await keys.getByRole("button", { name: "Generate" }).click();
  await expect(keys).toContainText("Copy this key now");

  await page.reload();
  const audit = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Audit log" }) });
  const row = audit.locator('[data-testid="audit-entry"][data-action="api_key.created"]');
  await expect(row.first()).toBeVisible();
  await expect(row.first()).toContainText("API key created");
});

import { test, expect } from "@playwright/test";

/**
 * Webhook signing secret — the admin Settings panel for a feature that was
 * API-only. GET creates the secret on first visit; rotating it must change
 * the value shown, through the in-app confirm dialog.
 */

test("shows the signing secret and rotates it", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Webhooks" }) });
  await expect(panel).toBeVisible();

  const secret = panel.getByTestId("webhook-signing-secret");
  await expect(secret).toContainText("whsec_");
  const before = await secret.innerText();

  await panel.getByRole("button", { name: "Rotate secret" }).click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(confirmation).toBeHidden();

  await expect(secret).toContainText("whsec_");
  await expect(secret).not.toHaveText(before);
});

import { test, expect } from "@playwright/test";

/**
 * An admin turns the morning task reminder on and picks the time zone
 * (Phase 9). E2E has no mail server, so sending is covered by the unit tests;
 * this checks the setting sticks, then puts it back.
 */
test("an admin turns on the morning reminder for a time zone", async ({ page }) => {
  await page.goto("/settings");
  const card = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Morning task reminder" }) });
  const toggle = card.getByRole("checkbox", { name: "Send the morning reminder" });
  await expect(toggle).not.toBeChecked();
  try {
    await toggle.check();
    await expect(card.getByText("Saved.")).toBeVisible();
    await card.getByRole("combobox", { name: "Time zone" }).selectOption("Asia/Ho_Chi_Minh");
    await page.reload();
    await expect(toggle).toBeChecked();
    await expect(card.getByRole("combobox", { name: "Time zone" })).toHaveValue("Asia/Ho_Chi_Minh");
  } finally {
    await page.request.patch("/api/settings/reminders", { data: { enabled: false } });
  }
});

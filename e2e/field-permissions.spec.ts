import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Field-level permissions — add a hide-rule from Settings, see it in the list,
 * then clear it. The API already enforced the rule; this is the missing admin
 * surface the docs called Settings → Field permissions.
 */

async function confirmAction(page: Page, control: Locator, action: string): Promise<void> {
  await control.click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: action, exact: true }).click();
  await expect(confirmation).toBeHidden();
}

test("adds a hide-rule and clears it", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.locator("[data-slot=card]", {
    has: page.getByRole("heading", { name: "Field permissions" }),
  });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Add rule" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a field permission" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Object").selectOption("contacts");
  await dialog.getByLabel("Field").selectOption("linkedin");
  await dialog.getByLabel("Role").selectOption("viewer");
  await dialog.getByLabel("Access").selectOption("hidden");
  await dialog.getByRole("button", { name: "Add rule" }).click();

  const row = panel.getByTestId("field-permission").filter({ hasText: "contacts.linkedin" });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-role", "viewer");
  await expect(row).toContainText("Viewer");
  await expect(row).toContainText("Hidden");

  await confirmAction(page, row.getByRole("button", { name: "Allow viewers to access contacts.linkedin" }), "Allow");
  await expect(row).toHaveCount(0);
});

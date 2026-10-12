import { test, expect } from "@playwright/test";

/**
 * Contact dedupe in the UI (ADR-016): a duplicate email is refused with a link
 * to the existing record; the same name at the same company is a warning that
 * still lets you save. Demo seed has Maya Chen at Acme Robotics.
 */

async function openNewContact(page: import("@playwright/test").Page) {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "New contact" }).click();
  const dialog = page.getByRole("dialog", { name: "New contact" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("creating a contact with an existing email is refused and links the original", async ({ page }) => {
  const dialog = await openNewContact(page);
  await dialog.getByLabel("First name").fill("Dupe");
  await dialog.getByLabel("Last name").fill("Email");
  await dialog.getByLabel("Email").fill("maya.chen@acmerobotics.io");
  await dialog.getByRole("button", { name: "Create contact" }).click();

  await expect(dialog.getByText(/already exists/i)).toBeVisible();
  const link = dialog.getByRole("link", { name: "Open existing" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Maya Chen" })).toBeVisible();
});

test("creating the same name at the same company warns, then the original lists the duplicate", async ({
  page,
}) => {
  const dialog = await openNewContact(page);
  await dialog.getByLabel("First name").fill("Maya");
  await dialog.getByLabel("Last name").fill("Chen");
  await dialog.getByLabel("Email").fill(`e2e-maya-dupe-${Date.now()}@fourty.test`);
  await dialog.getByLabel("Company").selectOption({ label: "Acme Robotics" });
  await dialog.getByRole("button", { name: "Create contact" }).click();

  const warn = dialog.getByTestId("name-company-duplicate");
  await expect(warn).toBeVisible();
  await expect(warn.getByRole("link", { name: "Open existing" })).toBeVisible();

  await dialog.getByRole("button", { name: "Create contact" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/contacts");
  await page.getByRole("row", { name: /Maya Chen/ }).filter({ hasText: "VP Engineering" }).click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(page.getByTestId("duplicate-contacts")).toBeVisible();
  await expect(page.getByTestId("duplicate-contacts")).toContainText(/same name at this company/i);
});

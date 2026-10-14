import { test, expect } from "@playwright/test";

/** Phase 12: a deleted company comes back from the Trash with its note. */
test("a deleted company is restored from the trash with its note", async ({ page }) => {
  const name = `Trash Co ${Date.now()}`;
  const created = await page.request.post("/api/companies", { data: { name } });
  const company = ((await created.json()) as { company: { id: string } }).company;
  await page.request.post("/api/notes", { data: { entityType: "company", entityId: company.id, body: `Note on ${name}` } });

  await page.goto(`/companies/${company.id}`);
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/moves to the Trash for 30 days/)).toBeVisible();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/companies$/);

  await page.goto("/settings");
  const card = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Trash" }) });
  await card.getByRole("button", { name: `Restore ${name}` }).click();
  await expect(card.getByText(`${name} is back.`)).toBeVisible();

  await page.goto(`/companies/${company.id}`);
  await expect(page.getByText(`Note on ${name}`)).toBeVisible();
});

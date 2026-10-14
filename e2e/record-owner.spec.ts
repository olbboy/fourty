import { test, expect } from "@playwright/test";
import { inviteAndJoin } from "./helpers/members";

/**
 * Phase 16: a contact is handed to a teammate from its form, and the contacts
 * list then finds it under that teammate.
 */
test("a contact is handed to a teammate and listed under them", async ({ page, browser }) => {
  const mate = await inviteAndJoin(page, browser, "owner");
  const stamp = Date.now();
  const res = await page.request.post("/api/contacts", { data: { firstName: "Owned", lastName: `${stamp}` } });
  const contact = ((await res.json()) as { contact: { id: string } }).contact;

  await page.goto(`/contacts/${contact.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit contact" });
  await dialog.getByRole("combobox", { name: "Owner" }).selectOption({ label: mate.name });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(mate.name, { exact: true })).toBeVisible();

  await page.goto("/contacts");
  await page.getByRole("combobox", { name: "Filter by owner" }).selectOption({ label: mate.name });
  await expect(page.getByRole("link", { name: `Owned ${stamp}` })).toBeVisible();
});

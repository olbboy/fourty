import { test, expect } from "@playwright/test";

/**
 * Phase 22: two contacts with the same email are flagged as duplicates on the
 * contact page; merging one in moves its deal over and sends it to the Trash.
 */
test("a flagged duplicate contact is merged in with its deal", async ({ page }) => {
  const stamp = Date.now();
  const keep = ((await (await page.request.post("/api/contacts", { data: { firstName: "Keep", lastName: `${stamp}`, companyId: null } })).json()) as {
    contact: { id: string };
  }).contact;
  const dupe = ((await (await page.request.post("/api/contacts", { data: { firstName: "Dupe", lastName: `${stamp}`, phone: "0903 000 111" } })).json()) as {
    contact: { id: string };
  }).contact;
  const deal = ((await (await page.request.post("/api/deals", { data: { name: `Merged deal ${stamp}`, contactId: dupe.id } })).json()) as {
    deal: { id: string };
  }).deal;

  await page.goto(`/contacts/${keep.id}`);
  await page.getByRole("button", { name: "Merge a duplicate into this record" }).click();
  const dialog = page.getByRole("dialog", { name: `Merge a duplicate into Keep ${stamp}` });
  await dialog.getByRole("textbox", { name: "Find the duplicate" }).fill(`Dupe ${stamp}`);
  await dialog.getByRole("button", { name: new RegExp(`Dupe ${stamp}`) }).click();
  await dialog.getByRole("button", { name: `Merge Dupe ${stamp} here` }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("0903 000 111")).toBeVisible();

  const moved = await (await page.request.get(`/api/deals/${deal.id}`)).json();
  expect(moved.deal.contactId).toBe(keep.id);
  expect((await page.request.get(`/api/contacts/${dupe.id}`)).status()).toBe(404);
});

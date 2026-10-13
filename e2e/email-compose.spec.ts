import { test, expect } from "@playwright/test";

/**
 * Phase 15: "Send email" on a contact's page. The e2e server has no mail set
 * up, so the dialog says so instead of offering a form that cannot send.
 */
test("send email explains itself when this server has no mail set up", async ({ page }) => {
  const stamp = Date.now();
  const res = await page.request.post("/api/contacts", { data: { firstName: "Mail", lastName: `${stamp}`, email: `mail-${stamp}@khach.test` } });
  const contact = ((await res.json()) as { contact: { id: string } }).contact;

  await page.goto(`/contacts/${contact.id}`);
  await page.getByRole("button", { name: "Send email" }).click();
  await expect(page.getByRole("dialog", { name: "Send an email" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "This server has no mail set up" })).toBeVisible();

  const refused = await page.request.post("/api/email", {
    data: { entityType: "contact", entityId: contact.id, contactId: contact.id, subject: "Hi", body: "Hello" },
  });
  expect(refused.status()).toBe(503);
});

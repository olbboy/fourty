import { test, expect } from "@playwright/test";

/**
 * Phase 24: a template made in Settings is filled for a contact. (The e2e
 * server has no mail, so the writing dialog itself is covered by unit tests;
 * here the fill the dialog asks for is checked through the same route.)
 */
test("a template from Settings is filled for a contact", async ({ page }) => {
  const stamp = Date.now();
  const name = `Follow-up ${stamp}`;
  await page.goto("/settings");
  const card = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Email templates" }) });
  await card.getByRole("textbox", { name: "Template name" }).fill(name);
  await card.getByRole("textbox", { name: "Subject" }).fill("Quote for {{company.name}}");
  await card.getByRole("textbox", { name: "Message" }).fill("Hi {{contact.firstName}},");
  await card.getByRole("button", { name: "Add template" }).click();
  await expect(card.getByText(name)).toBeVisible();

  const company = ((await (await page.request.post("/api/companies", { data: { name: `Acme ${stamp}` } })).json()) as { company: { id: string } }).company;
  const contact = ((await (await page.request.post("/api/contacts", { data: { firstName: "Ada", companyId: company.id } })).json()) as {
    contact: { id: string };
  }).contact;
  const templates = (await (await page.request.get("/api/email-templates")).json()).templates as { id: string; name: string }[];
  const id = templates.find((tpl) => tpl.name === name)!.id;
  const filled = await (
    await page.request.post(`/api/email-templates/${id}/render`, { data: { entityType: "contact", entityId: contact.id, contactId: contact.id } })
  ).json();
  expect(filled).toEqual({ subject: `Quote for Acme ${stamp}`, body: "Hi Ada," });
});

import { test, expect } from "@playwright/test";

/**
 * Phase 13: a second person joins a deal with a role, and the deal shows up
 * on that person's page too.
 */
test("a contact joins a deal with a role and sees it on their page", async ({ page }) => {
  const stamp = Date.now();
  const post = async (path: string, data: Record<string, unknown>) =>
    (await (await page.request.post(path, { data })).json()) as Record<string, { id: string }>;
  const primary = (await post("/api/contacts", { firstName: "Primary", lastName: `${stamp}` })).contact;
  const tech = (await post("/api/contacts", { firstName: "Tech", lastName: `${stamp}` })).contact;
  const deal = (await post("/api/deals", { name: `Multi contact ${stamp}`, contactId: primary.id })).deal;

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("combobox", { name: "Contact to add to this deal" }).selectOption({ label: `Tech ${stamp}` });
  await page.getByRole("textbox", { name: "Their role in this deal" }).fill("Technical");
  await page.getByRole("button", { name: "Add contact to this deal" }).click();
  await expect(page.getByRole("link", { name: `Tech ${stamp}` })).toBeVisible();
  await expect(page.getByText("Technical")).toBeVisible();

  await page.goto(`/contacts/${tech.id}`);
  await expect(page.getByText(`Multi contact ${stamp}`)).toBeVisible();
});

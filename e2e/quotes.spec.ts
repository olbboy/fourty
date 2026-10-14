import { test, expect } from "@playwright/test";

/**
 * Phase 25: a quote is made from a deal's products and opens as a printable
 * page with its number, lines and total.
 */
test("a quote is made from a deal's products and opens to print", async ({ page }) => {
  const stamp = Date.now();
  const deal = ((await (await page.request.post("/api/deals", { data: { name: `Quoted ${stamp}`, currency: "VND" } })).json()) as {
    deal: { id: string };
  }).deal;
  await page.request.put(`/api/deals/${deal.id}/lines`, { data: { lines: [{ name: `Battery ${stamp}`, quantity: 2, unitPrice: 15_000_000 }] } });

  await page.goto(`/deals/${deal.id}`);
  await page.getByRole("button", { name: "Make a quote" }).click();
  await page.getByRole("spinbutton", { name: "Valid for how many days" }).fill("15");
  const [sheet] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Make and open" }).click()]);
  await expect(sheet.getByRole("heading", { name: "Quote" })).toBeVisible();
  await expect(sheet.getByText(`Battery ${stamp}`)).toBeVisible();
  await expect(sheet.getByText(new RegExp(`BG-${new Date().getFullYear()}-\\d{4}`))).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`BG-${new Date().getFullYear()}-`) })).toBeVisible();
});

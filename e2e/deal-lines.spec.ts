import { test, expect } from "@playwright/test";

/**
 * Phase 14: a product added to the catalogue in Settings goes onto a deal as a
 * line item, and the deal's amount becomes the sum of its lines.
 */
test("a catalogue product on a deal sets its amount", async ({ page }) => {
  const stamp = Date.now();
  const product = `Inverter ${stamp}`;

  await page.goto("/settings");
  await page.getByRole("textbox", { name: "Product name" }).fill(product);
  await page.getByRole("spinbutton", { name: "List price" }).fill("12000000");
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByText(product, { exact: true })).toBeVisible();

  const res = await page.request.post("/api/deals", { data: { name: `Lines ${stamp}`, amount: 1, currency: "VND" } });
  const deal = ((await res.json()) as { deal: { id: string } }).deal;
  await page.goto(`/deals/${deal.id}`);

  const catalogue = (await (await page.request.get("/api/products")).json()) as { products: { id: string; name: string }[] };
  const productId = catalogue.products.find((p) => p.name === product)!.id;
  await page.getByRole("combobox", { name: "Product from the catalogue" }).selectOption(productId);
  await page.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
  await page.getByRole("button", { name: "Add product line" }).click();
  await expect(page.getByRole("spinbutton", { name: `Quantity of ${product}` })).toHaveValue("2");

  const lines = await (await page.request.get(`/api/deals/${deal.id}/lines`)).json();
  expect(lines.total).toBe(24_000_000);
  const after = await (await page.request.get(`/api/deals/${deal.id}`)).json();
  expect(after.deal.amount).toBe(24_000_000);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Amount" })).toBeDisabled();
});

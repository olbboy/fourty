import { test, expect } from "@playwright/test";

/**
 * Phase 23: deals from a CSV are previewed row by row, then imported together.
 */
test("a CSV of two deals is previewed, then imported", async ({ page }) => {
  const stamp = Date.now();
  const csv = [
    "name,amount,currency,expected close date,company",
    `Imported A ${stamp},"20.000.000",VND,2026-12-15,Imported Co ${stamp}`,
    `Imported B ${stamp},5000,USD,31/12/2026,`,
  ].join("\n");

  await page.goto("/settings/import");
  await page.getByRole("button", { name: "Deals", exact: true }).click();
  await page.getByLabel("CSV file of deals").setInputFiles({ name: "deals.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByRole("status")).toContainText("2 rows ready, 0 with a problem, 1 new companies");
  await page.getByRole("button", { name: "Import 2 deals" }).click();
  await expect(page.getByRole("status")).toContainText("2 deals imported");

  const deals = (await (await page.request.get(`/api/deals?q=${stamp}`)).json()).deals as { name: string; amount: number }[];
  expect(deals.map((d) => d.name).sort()).toEqual([`Imported A ${stamp}`, `Imported B ${stamp}`]);
});

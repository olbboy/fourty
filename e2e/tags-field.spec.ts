import { test, expect } from "@playwright/test";

/**
 * Phase 20: a tags field on deals takes two choices in the deal form, the
 * deal page lists both, and the deals list filters by one of them.
 */
test("a deal carries two tags and is found by one of them", async ({ page }) => {
  const stamp = Date.now();
  const key = `tags_${stamp}`;
  const label = `Tags ${stamp}`;
  const field = await page.request.post("/api/custom-fields", {
    data: { entity: "deal", key, label, type: "multiselect", options: ["Surveyed", "Legal pending", "Priority"] },
  });
  expect(field.status()).toBe(201);
  const fieldId = ((await field.json()) as { field: { id: string } }).field.id;
  const deal = ((await (await page.request.post("/api/deals", { data: { name: `Tagged ${stamp}` } })).json()) as { deal: { id: string } }).deal;

  try {
    await page.goto(`/deals/${deal.id}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit deal" });
    const tags = dialog.getByRole("group", { name: label });
    await tags.getByRole("checkbox", { name: "Surveyed" }).check();
    await tags.getByRole("checkbox", { name: "Legal pending" }).check();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Surveyed, Legal pending")).toBeVisible();

    const listed = await (await page.request.get(`/api/deals?fieldKey=${key}&fieldValue=${encodeURIComponent("Legal pending")}`)).json();
    expect((listed.deals as { id: string }[]).map((d) => d.id)).toContain(deal.id);
  } finally {
    await page.request.delete(`/api/custom-fields/${fieldId}`);
  }
});

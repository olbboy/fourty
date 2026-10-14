import { test, expect } from "@playwright/test";

/**
 * Phase 17: two deals picked on the list move to another stage together,
 * then go to the Trash together.
 */
test("two selected deals move stage together, then go to the Trash", async ({ page }) => {
  const stamp = Date.now();
  const pipelines = (await (await page.request.get("/api/pipelines")).json()).pipelines as {
    isDefault: number;
    stages: { id: string; name: string; type: string }[];
  }[];
  const pipeline = pipelines.find((p) => p.isDefault === 1) ?? pipelines[0]!;
  const [first, second] = pipeline.stages.filter((s) => s.type === "open");
  for (const name of [`Bulk A ${stamp}`, `Bulk B ${stamp}`]) {
    expect((await page.request.post("/api/deals", { data: { name, stageId: first!.id } })).status()).toBe(201);
  }

  await page.goto("/deals");
  await page.getByRole("button", { name: "List view" }).click();
  // The search reloads the list (and clears any selection) a moment after typing.
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/deals?") && res.url().includes(`q=${stamp}`)),
    page.getByRole("textbox", { name: "Search deals" }).fill(`${stamp}`),
  ]);
  for (const name of [`Bulk A ${stamp}`, `Bulk B ${stamp}`]) {
    await page.getByRole("checkbox", { name: `Select ${name}` }).click();
  }
  const bar = page.getByRole("region", { name: "Bulk actions on the selected rows" });
  await expect(bar).toContainText("2 selected");
  await bar.getByRole("combobox", { name: "Stage to move them to" }).selectOption(second!.id);
  await bar.getByRole("button", { name: "Move", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: `Bulk A ${stamp}` })).toContainText(second!.name);
  await expect(page.getByRole("row").filter({ hasText: `Bulk B ${stamp}` })).toContainText(second!.name);

  // The move reloads the list, which clears the selection; pick the two again.
  await expect(bar).toBeHidden();
  for (const name of [`Bulk A ${stamp}`, `Bulk B ${stamp}`]) {
    await page.getByRole("checkbox", { name: `Select ${name}` }).click();
  }
  await bar.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("row").filter({ hasText: `Bulk A ${stamp}` })).toHaveCount(0);
  const trash = (await (await page.request.get("/api/trash")).json()).items as { label: string }[];
  expect(trash.map((i) => i.label)).toEqual(expect.arrayContaining([`Bulk A ${stamp}`, `Bulk B ${stamp}`]));
});

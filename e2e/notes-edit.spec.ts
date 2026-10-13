import { test, expect } from "@playwright/test";

/**
 * A mistyped note is corrected, then removed, from the deal page (Phase 7).
 * The timeline line the note left follows both changes.
 */
test("the author corrects a note, then deletes it, and the timeline follows", async ({ page }) => {
  const stamp = Date.now();
  const created = await page.request.post("/api/deals", { data: { name: `Note edit ${stamp}` } });
  const dealId = ((await created.json()) as { deal: { id: string } }).deal.id;
  const previews = async () => {
    const res = await page.request.get(`/api/activities?entityType=deal&entityId=${dealId}`);
    return ((await res.json()) as { activities: { type: string; meta: unknown }[] }).activities
      .filter((a) => a.type === "note_added")
      .map((a) => (typeof a.meta === "string" ? JSON.parse(a.meta) : a.meta).preview as string);
  };

  await page.goto(`/deals/${dealId}`);
  await page.getByRole("textbox", { name: "New note" }).fill(`Báo giá ${stamp}: 800 tỷ`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`Báo giá ${stamp}: 800 tỷ`)).toBeVisible();

  await page.getByRole("button", { name: "Edit note", exact: true }).click();
  await page.getByRole("textbox", { name: "Note text" }).fill(`Báo giá ${stamp}: 80 tỷ`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Báo giá ${stamp}: 80 tỷ`)).toBeVisible();
  await expect(page.getByText("edited")).toBeVisible();
  expect(await previews()).toEqual([`Báo giá ${stamp}: 80 tỷ`]);

  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Báo giá ${stamp}: 80 tỷ`)).toHaveCount(0);
  expect(await previews()).toEqual([]);
});

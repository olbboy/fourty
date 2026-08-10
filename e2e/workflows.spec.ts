import { test, expect } from "@playwright/test";

/**
 * The workflows list — the one view that had no coverage at all, which is how a
 * layout break shipped through a full unit + e2e + build pass.
 *
 * The row is the thing worth guarding. It is a horizontal strip: mark, name and
 * trigger summary, run count, an enable toggle, edit, delete. Nothing about that
 * is expressible as a DOM assertion, so this measures it: if the row ever stacks,
 * the name and the delete control stop sharing a line and the strip grows tall.
 *
 * That is not a hypothetical. `Card` ships `flex flex-col`, and a caller asking
 * for a row by passing `flex flex-wrap items-center` cannot take the direction
 * back — `flex-row` is the only class in that group, so `flex-col` survives the
 * merge and the row silently becomes a column.
 */
test("a workflow row keeps its controls on one line", async ({ page }) => {
  await page.goto("/workflows");

  const row = page.locator("[data-slot=card]").first();
  await expect(row).toBeVisible();

  const name = row.locator("p").first();
  const del = row.getByRole("button", { name: /^Delete / });
  // Named per workflow, because the icons are hidden from assistive tech and a
  // row otherwise offers three buttons that all announce as "button".
  await expect(del).toBeVisible();
  await expect(row.getByRole("button", { name: /^Edit / })).toBeVisible();
  await expect(row.getByRole("checkbox", { name: /^(Enable|Disable) / })).toBeAttached();

  const [nameBox, delBox, rowBox] = await Promise.all([
    name.boundingBox(),
    del.boundingBox(),
    row.boundingBox(),
  ]);
  if (!nameBox || !delBox || !rowBox) throw new Error("row did not lay out");

  const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(
    Math.abs(centre(nameBox) - centre(delBox)),
    "the workflow name and its delete control are on different lines — the row is stacking",
  ).toBeLessThan(24);

  // A stacked row runs several hundred pixels tall; a real one is one control high.
  expect(rowBox.height, "the row is taller than a single strip of controls").toBeLessThan(120);
});

test("the builder opens with its trigger, condition and action controls", async ({ page }) => {
  await page.goto("/workflows");
  await page.getByRole("button", { name: /New workflow/ }).first().click();

  const dialog = page.getByRole("dialog", { name: "New workflow" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/Workflow name/i)).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Condition/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Action/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create workflow" })).toBeVisible();
});

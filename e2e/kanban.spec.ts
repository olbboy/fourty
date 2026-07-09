import { test, expect } from "@playwright/test";
import { dragCardToColumn } from "./helpers/drag";

/**
 * Kanban drag — the hardest client-side flow. Drags the first deal card to a
 * different stage and asserts the board reflects it: the card lives under the new
 * column, both columns' card counts shift by one, and both per-column totals
 * recompute. Assertions are dynamic (no hard-coded demo ids) so they don't break
 * if seed data changes.
 */
test("dragging a deal card moves it between stages", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByTestId("deal-card").first()).toBeVisible();

  const column = (stageId: string) =>
    page.locator(`[data-testid="stage-column"][data-stage-id="${stageId}"]`);

  // First card on the board and the stage column that currently holds it.
  const dealId = await page.getByTestId("deal-card").first().getAttribute("data-deal-id");
  expect(dealId).toBeTruthy();
  const sourceStageId = await page
    .locator(`[data-testid="stage-column"]`, {
      has: page.locator(`[data-deal-id="${dealId}"]`),
    })
    .getAttribute("data-stage-id");
  expect(sourceStageId).toBeTruthy();

  // Any other stage column is a valid drop target within the same pipeline.
  const stageIds = await page
    .getByTestId("stage-column")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-stage-id")));
  const targetStageId = stageIds.find((id) => id && id !== sourceStageId);
  expect(targetStageId).toBeTruthy();

  const source = column(sourceStageId!);
  const target = column(targetStageId!);

  const sourceCountBefore = await source.getByTestId("deal-card").count();
  const targetCountBefore = await target.getByTestId("deal-card").count();
  const sourceTotalBefore = await source.getByTestId("stage-total").innerText();
  const targetTotalBefore = await target.getByTestId("stage-total").innerText();

  const card = page.locator(`[data-testid="deal-card"][data-deal-id="${dealId}"]`);
  const response = await dragCardToColumn(page, card, target);
  expect(response.ok()).toBeTruthy();

  // The card now lives under the target column, gone from the source.
  await expect(target.locator(`[data-deal-id="${dealId}"]`)).toBeVisible();
  await expect(source.locator(`[data-deal-id="${dealId}"]`)).toHaveCount(0);

  // Card counts shift by one in each direction.
  await expect(source.getByTestId("deal-card")).toHaveCount(sourceCountBefore - 1);
  await expect(target.getByTestId("deal-card")).toHaveCount(targetCountBefore + 1);

  // Per-column totals recompute (assert they changed, not absolute values).
  await expect(source.getByTestId("stage-total")).not.toHaveText(sourceTotalBefore);
  await expect(target.getByTestId("stage-total")).not.toHaveText(targetTotalBefore);
});

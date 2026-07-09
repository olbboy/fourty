import { expect, type Locator, type Page, type Response } from "@playwright/test";

/**
 * Drive the deals-kanban native HTML5 drag-and-drop.
 *
 * The board's onDrop reads React state `dragId` set by onDragStart (it does not
 * use dataTransfer), so the events must flow through React's synthetic system and
 * drop must fire *after* React commits the dragstart. We use the dragged card's
 * `opacity-40` class (applied only while `dragId === deal.id`) as the commit
 * signal, then dispatch dragover + drop on the destination column.
 *
 * Returns the PATCH /api/deals/{id} response so callers can assert it succeeded.
 */
export async function dragCardToColumn(
  page: Page,
  card: Locator,
  targetColumn: Locator,
): Promise<Response> {
  // A DataTransfer is required to construct a valid drag event, even though the
  // app reads component state rather than the transfer payload.
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  // React 19 delegates events at the root container, so the events must bubble.
  const init = { dataTransfer, bubbles: true, cancelable: true };

  await card.dispatchEvent("dragstart", init);
  // Wait for React to commit `dragId` — the source card fades to opacity-40.
  await expect(card).toHaveClass(/opacity-40/);

  await targetColumn.dispatchEvent("dragover", init);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/api\/deals\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH",
    ),
    targetColumn.dispatchEvent("drop", init),
  ]);

  await dataTransfer.dispose();
  return response;
}

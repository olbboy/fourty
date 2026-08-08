import { test, expect, type Page } from "@playwright/test";

/**
 * The per-record agent panel (Phase 4), in a browser, on an install with **no
 * AI provider configured** — which is how the E2E environment runs and which is
 * the case that matters most: the tab has to be honest about the composer and
 * still show what the keyless research pass found.
 *
 * The tab-switch assertion is the interesting one. The panel is hidden, never
 * unmounted, so an answer in flight survives the reader going to look at the
 * timeline; the DOM node staying put is what that guarantee looks like from
 * outside.
 */

async function openFirstContact(page: Page): Promise<void> {
  await page.goto("/contacts");
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
}

test("the agent tab opens, states it is offline, and still reports research", async ({ page }) => {
  await openFirstContact(page);

  // The record page opens on the timeline, as it always did.
  const timeline = page.getByRole("tab", { name: "Timeline" });
  const agent = page.getByRole("tab", { name: "Agent" });
  await expect(timeline).toHaveAttribute("aria-selected", "true");
  await expect(agent).toHaveAttribute("aria-selected", "false");

  await agent.click();
  const composer = page.getByRole("textbox", { name: "Ask about this record" });
  await expect(composer).toBeVisible();

  // No provider: `offline`, and said as a fact about us rather than as a claim
  // that the session is busy.
  await expect(composer).toBeDisabled();
  await expect(page.getByText(/No AI provider is configured/)).toBeVisible();

  // And the half that needs no model is present either way.
  await expect(page.getByText(/research/i).first()).toBeVisible();
});

test("switching tabs hides the panel without tearing it down", async ({ page }) => {
  await openFirstContact(page);
  await page.getByRole("tab", { name: "Agent" }).click();

  const panel = page.locator("#record-panel-agent");
  await expect(panel).toBeVisible();

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(panel).toBeHidden();
  // Hidden, not removed: an unmount here would abort a stream mid-answer.
  await expect(panel).toHaveCount(1);

  await page.getByRole("tab", { name: "Agent" }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask about this record" })).toBeVisible();
});

test("the background work panel stays where it was", async ({ page }) => {
  // Compose, don't replace: the agent tab is new surface, and nothing that was
  // already on the record page moved into it.
  await openFirstContact(page);
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await page.getByRole("tab", { name: "Agent" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
});

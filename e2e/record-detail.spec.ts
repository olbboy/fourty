import { test, expect, type Page } from "@playwright/test";

/**
 * Record detail pages — the delete control each one carries, and the task panel
 * they share.
 *
 * These four controls are icons with nothing else inside them, and the icon is
 * hidden from assistive tech, so with no explicit label they announce as an
 * unnamed button. On a detail page that is the single most destructive control
 * on screen.
 *
 * `getByRole(..., { name })` matches the accessible name the browser computes,
 * so these fail if a label is dropped. Nothing is clicked: every assertion is on
 * a demo record the rest of the suite reads, and the controls under test delete
 * things.
 */

/** Open the first row of a list view and return the detail URL it landed on. */
async function openFirstRow(page: Page, list: string): Promise<void> {
  await page.goto(list);
  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${list}/[^/]+$`));
}

test("a contact page names its delete button and its add-task button", async ({ page }) => {
  await openFirstRow(page, "/contacts");

  const heading = page.getByRole("heading", { level: 1 });
  const name = (await heading.innerText()).trim();
  expect(name.length).toBeGreaterThan(0);

  await expect(page.getByRole("button", { name: `Delete ${name}` })).toBeVisible();
  // The task panel is shared by all three detail pages, so covering it here
  // covers it everywhere it appears.
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
});

test("a company page names its delete button", async ({ page }) => {
  await openFirstRow(page, "/companies");
  const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  await expect(page.getByRole("button", { name: `Delete ${name}` })).toBeVisible();
});

test("a deal page names its delete button", async ({ page }) => {
  // Deals are a kanban rather than a table, so the id comes off the first card.
  await page.goto("/deals");
  const card = page.getByTestId("deal-card").first();
  await expect(card).toBeVisible();
  const dealId = await card.getAttribute("data-deal-id");
  expect(dealId).toBeTruthy();

  await page.goto(`/deals/${dealId}`);
  const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  await expect(page.getByRole("button", { name: `Delete ${name}` })).toBeVisible();
});

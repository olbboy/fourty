import { test, expect, type Page } from "@playwright/test";
import { expectHealthyView, settleView } from "./helpers/view-health";

/**
 * Every view, loaded and checked for the failures that report themselves
 * nowhere: a page that throws in the browser, a layout that collapsed, a
 * control with no accessible name.
 *
 * The specs beside this one drive behaviour — signing in, dragging a deal,
 * naming a row control. This one only asks whether each view is standing up,
 * which is the question nothing was asking when a design pass shipped a broken
 * workflows page through a full green suite.
 */

/** Anything the browser reported while the view was loading. */
function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const VIEWS = [
  ["dashboard", "/dashboard", "Dashboard"],
  ["contacts", "/contacts", "Contacts"],
  ["companies", "/companies", "Companies"],
  ["deals", "/deals", "Deals"],
  ["tasks", "/tasks", "Tasks"],
  ["reports", "/reports", "Reports"],
  ["workflows", "/workflows", "Workflows"],
  ["settings", "/settings", "Settings"],
  ["import", "/settings/import", "Import contacts"],
] as const;

for (const [name, url, heading] of VIEWS) {
  test(`${name} stands up`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    await page.goto(url);

    // The heading proves the view rendered rather than falling to an error
    // boundary, which paints a page that is otherwise perfectly healthy.
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await settleView(page);
    await expectHealthyView(page);
    expect(errors, `${url} reported browser errors`).toEqual([]);
  });
}

/** Detail pages are reached through their list, so they need the extra hop. */
const DETAILS = [
  ["contact", "/contacts", /\/contacts\/[^/]+$/],
  ["company", "/companies", /\/companies\/[^/]+$/],
  ["deal", "/deals", /\/deals\/[^/]+$/],
] as const;

for (const [name, list, urlPattern] of DETAILS) {
  test(`${name} detail stands up`, async ({ page }) => {
    const errors = collectBrowserErrors(page);
    await page.goto(list);

    // Deals open on the kanban; the table is behind the view toggle.
    const toList = page.getByRole("button", { name: "List view" });
    if (await toList.count()) await toList.click();

    const row = page.locator("tbody tr").first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(urlPattern);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await settleView(page);
    await expectHealthyView(page);
    expect(errors, `${name} detail reported browser errors`).toEqual([]);
  });
}

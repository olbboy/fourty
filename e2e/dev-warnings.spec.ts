import { test, expect, type Page } from "@playwright/test";
import { settleView } from "./helpers/view-health";

/**
 * Every view, loaded in development mode, must produce a silent console.
 *
 * This exists because the production suite cannot see what it is checking for.
 * Base UI, React and Next all diagnose contract violations through warnings that
 * a production build strips — so a control that had dropped its native button
 * semantics, and was emitting `type="button"` on an anchor as a result, sailed
 * through a full green run and only turned up when someone opened the app.
 *
 * A warning here is not noise to be tuned out. Each one is a framework saying a
 * contract was broken; if one is genuinely acceptable, name it in ALLOWED with
 * the reason rather than loosening the assertion.
 */

/** Warnings that are understood and not ours to fix. */
const ALLOWED: { pattern: RegExp; because: string }[] = [
  {
    pattern: /Download the React DevTools/i,
    because: "React's own suggestion in development; nothing to do with this app.",
  },
];

function isAllowed(text: string): boolean {
  return ALLOWED.some((a) => a.pattern.test(text));
}

function watchConsole(page: Page): string[] {
  const noise: string[] = [];
  page.on("pageerror", (e) => noise.push(`uncaught: ${e.message}`));
  page.on("console", (m) => {
    const type = m.type();
    if (type !== "error" && type !== "warning") return;
    const text = m.text();
    if (isAllowed(text)) return;
    noise.push(`${type}: ${text}`);
  });
  return noise;
}

const VIEWS = [
  ["dashboard", "/dashboard"],
  ["contacts", "/contacts"],
  ["companies", "/companies"],
  ["deals", "/deals"],
  ["tasks", "/tasks"],
  ["reports", "/reports"],
  ["workflows", "/workflows"],
  ["settings", "/settings"],
  ["import", "/settings/import"],
] as const;

for (const [name, url] of VIEWS) {
  test(`${name} loads without a framework complaint`, async ({ page }) => {
    const noise = watchConsole(page);
    await page.goto(url);
    await settleView(page);
    expect(noise, `${url} was not silent in development`).toEqual([]);
  });
}

const DETAILS = [
  ["contact", "/contacts"],
  ["company", "/companies"],
  ["deal", "/deals"],
] as const;

for (const [name, list] of DETAILS) {
  test(`${name} detail loads without a framework complaint`, async ({ page }) => {
    const noise = watchConsole(page);
    await page.goto(list);

    // Deals open on the kanban; the table is behind the view toggle.
    const toList = page.getByRole("button", { name: "List view" });
    if (await toList.count()) await toList.click();

    const row = page.locator("tbody tr").first();
    await expect(row).toBeVisible();
    await row.click();
    await settleView(page);
    expect(noise, `${name} detail was not silent in development`).toEqual([]);
  });
}

test("the workflow builder opens without a framework complaint", async ({ page }) => {
  const noise = watchConsole(page);
  await page.goto("/workflows");
  await settleView(page);
  await page.getByRole("button", { name: /New workflow/ }).first().click();
  await expect(page.getByRole("dialog", { name: "New workflow" })).toBeVisible();
  expect(noise, "the workflow builder was not silent in development").toEqual([]);
});

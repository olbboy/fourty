import { test, expect } from "@playwright/test";

/**
 * Phase 27: the audit log narrows to one kind of record.
 */
test("the audit log narrows to actions on deals", async ({ page }) => {
  const stamp = Date.now();
  await page.request.post("/api/deals", { data: { name: `Audited ${stamp}` } });
  await page.request.post("/api/contacts", { data: { firstName: `Audited ${stamp}` } });

  await page.goto("/settings");
  const card = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Audit log" }) });
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/audit?") && res.url().includes("action=deal.")),
    card.getByRole("combobox", { name: "On what" }).selectOption("deal."),
  ]);
  await expect(card.getByTestId("audit-entry").first()).toBeVisible();
  const actions = await card.getByTestId("audit-entry").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-action")));
  expect(actions.length).toBeGreaterThan(0);
  expect(actions.every((a) => a?.startsWith("deal."))).toBe(true);
});

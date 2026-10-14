import { test, expect, type Locator } from "@playwright/test";
import { ADMIN } from "./helpers/auth";

/**
 * Phase 27 (D18): the audit log narrows to one person, then to one kind of
 * action on one kind of record.
 */
const shown = (card: Locator, attribute: string) =>
  card.getByTestId("audit-entry").evaluateAll((rows, name) => rows.map((r) => r.getAttribute(name as string)), attribute);

test("the audit log narrows to one person, then to deals they created", async ({ page }) => {
  const stamp = Date.now();
  await page.request.post("/api/deals", { data: { name: `Audited ${stamp}` } });
  await page.request.post("/api/contacts", { data: { firstName: `Audited ${stamp}` } });

  await page.goto("/settings");
  const card = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Audit log" }) });
  const person = card.getByRole("combobox", { name: "Who acted" });
  await expect(person.getByRole("option", { name: ADMIN.name })).toBeAttached();
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/audit?") && res.url().includes("actorId=")),
    person.selectOption({ label: ADMIN.name }),
  ]);
  await expect(card.getByTestId("audit-entry").first()).toBeVisible();
  const chosen = await person.inputValue();
  expect((await shown(card, "data-actor")).every((a) => a === chosen)).toBe(true);

  await Promise.all([
    page.waitForResponse((res) => res.url().includes("action=deal.")),
    card.getByRole("combobox", { name: "On what" }).selectOption("deal."),
  ]);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("action=deal.created")),
    card.getByRole("combobox", { name: "What was done" }).selectOption("created"),
  ]);
  await expect(card.getByTestId("audit-entry").first()).toBeVisible();
  const actions = await shown(card, "data-action");
  expect(actions.length).toBeGreaterThan(0);
  expect(actions.every((a) => a === "deal.created")).toBe(true);
});

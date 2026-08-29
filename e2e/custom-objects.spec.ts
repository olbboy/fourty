import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Custom objects through the browser: define an object and its fields in
 * Settings, watch it appear in the sidebar, work its records on the generic
 * /objects page (create, server-side validation, edit, delete), then delete
 * the object and watch the sidebar entry go away.
 *
 * One test, deliberately: every step depends on the state the previous one
 * made, and the final deletion is the cleanup that lets the suite re-run
 * against a database the wizard only truncates once.
 */

const PLURAL = "E2E Projects";
const SINGULAR = "E2E Project";
const API_NAME = "e2e_projects"; // what the auto-slug derives from the plural

async function confirmDeletion(page: Page, control: Locator, action = "Delete"): Promise<void> {
  await control.click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: action, exact: true }).click();
  await expect(confirmation).toBeHidden();
}

test("defines an object, works its records, and cleans up after itself", async ({ page }) => {
  await page.goto("/settings");
  const panel = page.locator("[data-slot=card]", {
    has: page.getByRole("heading", { name: "Custom objects" }),
  });
  await expect(panel).toBeVisible();

  // ── Define the object ─────────────────────────────────────────────────────
  await panel.getByRole("button", { name: "New object" }).click();
  const objectDialog = page.getByRole("dialog", { name: "New custom object" });
  await objectDialog.getByLabel("Plural name (shown in the sidebar)").fill(PLURAL);
  await objectDialog.getByLabel("Singular name").fill(SINGULAR);
  // Leave the API name blank — it derives from the plural.
  await objectDialog.getByRole("button", { name: "Create object" }).click();

  const row = panel.getByTestId("custom-object").filter({ hasText: PLURAL });
  await expect(row).toBeVisible();
  await expect(row).toContainText(API_NAME);

  // ── Give it fields ────────────────────────────────────────────────────────
  await row.getByRole("button", { name: "Fields…" }).click();
  const fieldsDialog = page.getByRole("dialog", { name: `${PLURAL} — fields` });

  await fieldsDialog.getByLabel("Label", { exact: true }).fill("Title");
  await fieldsDialog.getByLabel("Required").check();
  await fieldsDialog.getByRole("button", { name: "Add field" }).click();
  await expect(fieldsDialog.getByTestId("object-field").filter({ hasText: "Title" })).toBeVisible();

  await fieldsDialog.getByLabel("Label", { exact: true }).fill("Stage");
  await fieldsDialog.getByLabel("Required").setChecked(false);
  await fieldsDialog.getByLabel("Type").selectOption("select");
  await fieldsDialog.getByLabel("Options (comma separated)").fill("Open, Done");
  await fieldsDialog.getByRole("button", { name: "Add field" }).click();
  await expect(fieldsDialog.getByTestId("object-field")).toHaveCount(2);

  // A date field, to prove the epoch <-> YYYY-MM-DD round trip has no off-by-one.
  await fieldsDialog.getByLabel("Label", { exact: true }).fill("Due");
  await fieldsDialog.getByLabel("Type").selectOption("date");
  await fieldsDialog.getByRole("button", { name: "Add field" }).click();
  await expect(fieldsDialog.getByTestId("object-field")).toHaveCount(3);
  await fieldsDialog.getByRole("button", { name: "Done" }).click();

  // ── The sidebar picked it up without a reload ─────────────────────────────
  const sidebarLink = page.getByRole("navigation", { name: "Objects" }).getByRole("link", {
    name: PLURAL,
  });
  await expect(sidebarLink).toBeVisible();
  await sidebarLink.click();
  await expect(page).toHaveURL(new RegExp(`/objects/${API_NAME}`));
  await expect(page.getByRole("heading", { name: PLURAL })).toBeVisible();

  // ── Server-side validation reaches the form ───────────────────────────────
  // With no records yet, both the page header and the empty state offer a
  // "New …" button; the header one (first in the DOM) is the canonical trigger.
  await page.getByRole("button", { name: `New ${SINGULAR.toLowerCase()}` }).first().click();
  const recordDialog = page.getByRole("dialog", { name: `New ${SINGULAR.toLowerCase()}` });
  await recordDialog.getByRole("button", { name: "Create" }).click();
  await expect(recordDialog.getByText("Title is required")).toBeVisible();

  // ── Create ────────────────────────────────────────────────────────────────
  const DUE = "2026-08-29";
  await recordDialog.getByLabel("Title").fill("First run");
  await recordDialog.getByLabel("Stage").selectOption("Open");
  await recordDialog.getByLabel("Due").fill(DUE);
  await recordDialog.getByRole("button", { name: "Create" }).click();
  const record = page.getByTestId("object-record").filter({ hasText: "First run" });
  await expect(record).toBeVisible();
  await expect(record).toContainText("Open");

  // ── Edit ──────────────────────────────────────────────────────────────────
  await record.getByRole("button", { name: `Edit ${SINGULAR.toLowerCase()}` }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit ${SINGULAR.toLowerCase()}` });
  // The date came back from the server as the same calendar day it went in.
  await expect(editDialog.getByLabel("Due")).toHaveValue(DUE);
  await editDialog.getByLabel("Title").fill("First run, revised");
  await editDialog.getByLabel("Stage").selectOption("Done");
  await editDialog.getByRole("button", { name: "Save" }).click();
  const revised = page.getByTestId("object-record").filter({ hasText: "First run, revised" });
  await expect(revised).toBeVisible();
  await expect(revised).toContainText("Done");

  // ── Delete the record ─────────────────────────────────────────────────────
  await confirmDeletion(page, revised.getByRole("button", { name: `Delete ${SINGULAR.toLowerCase()}` }));
  await expect(page.getByTestId("object-record")).toHaveCount(0);

  // ── Delete the object; the sidebar entry follows ──────────────────────────
  await page.goto("/settings");
  const rowAgain = panel.getByTestId("custom-object").filter({ hasText: PLURAL });
  await confirmDeletion(page, rowAgain.getByRole("button", { name: `Delete ${PLURAL}` }));
  await expect(rowAgain).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Objects" }).getByRole("link", { name: PLURAL }),
  ).toHaveCount(0);
});

import { test, expect, type Locator, type Page } from "@playwright/test";
import { expectHealthyView } from "./helpers/view-health";

/**
 * No-code custom objects — define a type in Settings, add a field, create a
 * record on its list page, open the detail, then tear the type down.
 *
 * The API already covered this path; these screens were the missing product
 * surface the docs called Settings → Custom objects.
 */

async function confirmDeletion(page: Page, control: Locator, action = "Delete"): Promise<void> {
  await control.click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: action, exact: true }).click();
  await expect(confirmation).toBeHidden();
}

test("defines an object, records a row, and deletes the type", async ({ page }) => {
  const stamp = Date.now();
  const singular = `E2E Ticket ${stamp}`;
  const plural = `E2E Tickets ${stamp}`;
  const apiName = `e2e_ticket_${stamp}`;
  const title = `Inbox overflow ${stamp}`;

  await page.goto("/settings");
  const panel = page.locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Custom objects" }) });
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "New object" }).click();
  const create = page.getByRole("dialog", { name: "New custom object" });
  await expect(create).toBeVisible();
  await create.getByLabel("Singular name").fill(singular);
  await create.getByLabel("Plural name").fill(plural);
  await create.getByLabel("API name").fill(apiName);
  await create.getByRole("button", { name: "Create object" }).click();

  const row = panel.getByTestId("custom-object").filter({ hasText: plural });
  await expect(row).toBeVisible();
  await expect(row).toContainText(apiName);

  await row.getByRole("button", { name: "Add field" }).click();
  const fieldDialog = page.getByRole("dialog", { name: `New ${singular} field` });
  await expect(fieldDialog).toBeVisible();
  await fieldDialog.getByRole("textbox", { name: "Label", exact: true }).fill("Title");
  await fieldDialog.getByRole("checkbox", { name: "Required" }).check();
  await fieldDialog.getByRole("button", { name: "Create field" }).click();
  await expect(row).toContainText("Title · title · Text · required");

  await row.getByRole("button", { name: "Edit field Title" }).click();
  const editField = page.getByRole("dialog", { name: `Edit ${singular} field` });
  await expect(editField).toBeVisible();
  await editField.getByRole("textbox", { name: "Label", exact: true }).fill("Headline");
  await editField.getByRole("button", { name: "Save field" }).click();
  await expect(editField).toBeHidden();
  await expect(row).toContainText("Headline · title · Text · required");

  await row.getByRole("link", { name: "Open" }).click();
  await expect(page).toHaveURL(new RegExp(`/objects/${apiName}$`));
  await expect(page.getByRole("heading", { name: plural, level: 1 })).toBeVisible();
  await expectHealthyView(page);

  await page.getByRole("button", { name: `New ${singular.toLowerCase()}` }).click();
  const recDialog = page.getByRole("dialog", { name: `New ${singular.toLowerCase()}` });
  await recDialog.getByLabel(/Headline/).fill(title);
  await recDialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("cell", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Save view" }).click();
  await page.getByLabel("New view name").fill("E2E tickets");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "E2E tickets" })).toBeVisible();

  await page.getByRole("cell", { name: title }).click();
  await expect(page).toHaveURL(new RegExp(`/objects/${apiName}/[^/]+$`));
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expectHealthyView(page);

  await expect(page.getByText("created this record")).toBeVisible();
  await page.getByLabel("New note").fill("Follow up with ops");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Follow up with ops")).toBeVisible();
  await expect(page.getByText("added a note")).toBeVisible();

  await page.goto("/settings");
  const leftover = page
    .locator("[data-slot=card]", { has: page.getByRole("heading", { name: "Custom objects" }) })
    .getByTestId("custom-object")
    .filter({ hasText: plural });
  await confirmDeletion(page, leftover.getByRole("button", { name: `Delete ${plural}` }));
  await expect(leftover).toHaveCount(0);
});

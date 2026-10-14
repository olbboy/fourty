import { test, expect } from "@playwright/test";

/**
 * Phase 21: the tasks page shows the month, with a task on the day it is due;
 * choosing it opens it.
 */
test("a task due today sits on today's square of the month", async ({ page }) => {
  const stamp = Date.now();
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  const title = `Calendar task ${stamp}`;
  expect((await page.request.post("/api/tasks", { data: { title, dueDate: noon.getTime() } })).status()).toBe(201);

  await page.goto("/tasks");
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  const today = page.getByRole("cell", { name: noon.toLocaleDateString("en-US", { day: "numeric", month: "long" }) });
  await today.getByRole("button", { name: title }).click();
  await expect(page.getByRole("dialog", { name: "Edit task" })).toBeVisible();
});

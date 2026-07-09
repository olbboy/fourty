import { test, expect } from "@playwright/test";

/**
 * ⌘K command palette — open with the keyboard, filter, navigate, and close.
 *
 * Navigation targets a built-in "Go to …" command (not a demo record) so the
 * flow is deterministic regardless of seed data. The ⌘/Ctrl choice follows the
 * platform: Meta on macOS (local), Control on Linux (CI).
 */
const MOD = process.platform === "darwin" ? "Meta" : "Control";

test("command palette opens, filters, navigates, and closes", async ({ page }) => {
  await page.goto("/dashboard");

  // Open with the keyboard shortcut; focus lands in the search box.
  await page.keyboard.press(`${MOD}+KeyK`);
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  const search = page.getByRole("combobox");
  await expect(search).toBeFocused();

  // Typing filters the options down to the matching command.
  await search.fill("Settings");
  const option = page.getByRole("option", { name: "Go to Settings" });
  await expect(option).toBeVisible();

  // Keyboard selection navigates and dismisses the palette.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings/);
  await expect(dialog).toBeHidden();
});

test("command palette closes on Escape", async ({ page }) => {
  await page.goto("/dashboard");
  await page.keyboard.press(`${MOD}+KeyK`);
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  // Escape is handled on the dialog's onKeyDown, so wait for focus to land in the
  // palette (the input focuses shortly after open) before pressing it.
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

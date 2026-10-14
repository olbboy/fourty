import { test, expect } from "@playwright/test";
import { RESTRICTED_STORAGE_STATE } from "./helpers/restricted-session";

/**
 * ⌘K command palette — open with the keyboard, filter, navigate, and close.
 *
 * Navigation targets a built-in "Go to …" command (not a demo record) so the
 * flow is deterministic regardless of seed data. The ⌘/Ctrl choice follows the
 * platform: Meta on macOS (local), Control on Linux (CI).
 */
const MOD = process.platform === "darwin" ? "Meta" : "Control";

/**
 * The shortcut lives on a window listener the shell attaches during hydration,
 * so a press that lands on a not-yet-hydrated page is simply dropped. Retry
 * until it takes rather than racing a fixed wait — pressing twice is harmless
 * because the second press only re-opens an already-open palette.
 */
async function openPalette(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(async () => {
    await page.keyboard.press(`${MOD}+KeyK`);
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return dialog;
}

test("command palette opens, filters, navigates, and closes", async ({ page }) => {
  await page.goto("/dashboard");

  // Open with the keyboard shortcut; focus lands in the search box.
  const dialog = await openPalette(page);
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
  const dialog = await openPalette(page);
  // Base UI binds Escape to the focused popup, so wait for focus to land in the
  // palette input before pressing it.
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("restricted search does not expose hidden company fields or deal amount", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    storageState: RESTRICTED_STORAGE_STATE,
  });
  const page = await context.newPage();

  try {
    await page.goto("/dashboard");

    const hiddenNameResponse = await page.request.get(
      "/api/search?q=Acme%20Robotics",
    );
    expect(hiddenNameResponse.ok()).toBeTruthy();
    const hiddenNameData = (await hiddenNameResponse.json()) as {
      results: Array<{ type: string; title: string; subtitle: string | null }>;
    };
    expect(hiddenNameData.results.some((result) => result.type === "company")).toBe(false);

    const hiddenDomainResponse = await page.request.get(
      "/api/search?q=acmerobotics.io",
    );
    expect(hiddenDomainResponse.ok()).toBeTruthy();
    const hiddenDomainData = (await hiddenDomainResponse.json()) as {
      results: Array<{ type: string; title: string; subtitle: string | null }>;
    };
    expect(hiddenDomainData.results.some((result) => result.type === "company")).toBe(false);

    const dealResponse = await page.request.get(
      "/api/search?q=Assembly%20line%20retrofit",
    );
    expect(dealResponse.ok()).toBeTruthy();
    const dealData = (await dealResponse.json()) as {
      results: Array<{ type: string; title: string; subtitle: string | null }>;
    };
    const deal = dealData.results.find(
      (result) => result.type === "deal" && result.title.includes("Assembly line retrofit"),
    );
    expect(deal).toBeDefined();
    expect(deal?.subtitle ?? "").not.toMatch(/145[,.]?000/);

    await page.keyboard.press(`${MOD}+KeyK`);
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    const search = page.getByRole("combobox");
    await expect(dialog).toBeVisible();
    await expect(search).toBeFocused();

    await search.fill("Acme Robotics");
    await expect(page.getByRole("option", { name: /Acme Robotics/ })).toHaveCount(0);
    await expect(dialog.getByText("No results")).toBeVisible();

    await search.fill("Assembly line retrofit");
    const dealOption = page.getByRole("option", { name: /Assembly line retrofit/ });
    await expect(dealOption).toBeVisible();
    await expect(dealOption).not.toContainText(/145[,.]?000/);
  } finally {
    await context.close();
  }
});

test("the command palette finds a contact by phone however it is written", async ({ page }) => {
  // Phase 18: saved with the country code and dots, found by the national form.
  const stamp = Date.now();
  const tail = String(stamp).slice(-6);
  const res = await page.request.post("/api/contacts", {
    data: { firstName: "Phone", lastName: `${stamp}`, phone: `+84 903.${tail.slice(0, 3)}.${tail.slice(3)}` },
  });
  expect(res.status()).toBe(201);

  await page.goto("/dashboard");
  await openPalette(page);
  await page.getByRole("combobox").fill(`0903 ${tail.slice(0, 3)} ${tail.slice(3)}`);
  await expect(page.getByRole("option", { name: new RegExp(`Phone ${stamp}`) })).toBeVisible();
});

import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  RESTRICTED_EMPTY_STORAGE_STATE,
  RESTRICTED_ID_HIDDEN_STORAGE_STATE,
  RESTRICTED_STORAGE_STATE,
} from "./helpers/restricted-session";

const COMPANY_SEARCH = /Search (companies|name, domain, industry)/i;
const PAGE_SIZE = 50;

function searchBox(page: Page): Locator {
  return page.getByPlaceholder(COMPANY_SEARCH);
}

function companyRow(page: Page, name: string): Locator {
  return page.getByRole("row", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
}

function pageOffset(page: Page): string {
  return new URL(page.url()).searchParams.get("offset") ?? "0";
}

async function waitForCompanies(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^Companies$/i })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
}

async function chooseOption(page: Page, combobox: Locator, name: string): Promise<void> {
  await combobox.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await listbox.getByRole("option", { name, exact: true }).click();
}

async function requestExport(page: Page, scopeLabel: RegExp): Promise<URL> {
  await page.getByRole("button", { name: /^Export/i }).click();
  const item = page.getByRole("menuitem", { name: scopeLabel });
  await expect(item).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await item.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  return new URL(download.url());
}

async function selectedRowId(row: Locator): Promise<string> {
  const dataId = await row.getAttribute("data-company-id");
  if (dataId) return dataId;
  const href = await row.locator('a[href^="/companies/"]').first().getAttribute("href");
  const id = href?.split("/").filter(Boolean).at(-1);
  if (!id) throw new Error("Companies row must expose a readable id for selection/export");
  return id;
}

test.describe("Companies journeys", () => {
  test("loads server pagination, query controls, saved views, and page selection", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}`);
    await waitForCompanies(page);

    const initial = new URL(page.url());
    expect(initial.searchParams.get("limit")).toBe(String(PAGE_SIZE));
    const firstPageResponse = await page.request.get(
      `/api/companies?offset=0&limit=${PAGE_SIZE}&sort=name_asc`,
    );
    expect(firstPageResponse.ok()).toBeTruthy();
    const firstPageData = (await firstPageResponse.json()) as {
      companies: Array<{ id: string }>;
      page: { offset: number; limit: number; total: number; hasMore: boolean };
    };
    expect(firstPageData.companies).toHaveLength(PAGE_SIZE);
    expect(firstPageData.page).toMatchObject({ offset: 0, limit: PAGE_SIZE, hasMore: true });
    expect(firstPageData.page.total).toBeGreaterThanOrEqual(55);

    expect(await page.locator("tbody tr").count()).toBe(PAGE_SIZE);
    const next = page.getByRole("button", { name: /Next page/i });
    await expect(next).toBeEnabled();
    await next.click();
    await expect.poll(() => pageOffset(page)).toBe("50");
    await expect(companyRow(page, "E2E Pagination 01")).toBeVisible();
    await expect(page.getByRole("button", { name: /Previous page/i })).toBeEnabled();

    await page.getByRole("button", { name: /Previous page/i }).click();
    await expect.poll(() => pageOffset(page)).toBe("0");

    const firstRow = page.locator("tbody tr").first();
    const firstCheckbox = firstRow.getByRole("checkbox");
    await expect(firstCheckbox).toBeVisible();
    await firstCheckbox.check();
    await expect(page.getByText(/1 selected/i)).toBeVisible();

    const query = searchBox(page);
    await query.fill("E2E Pagination 01");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("E2E Pagination 01");
    await expect(companyRow(page, "E2E Pagination 01")).toBeVisible();
    await expect(page.getByText(/1 selected/i)).toHaveCount(0);
    await expect(companyRow(page, "E2E Pagination 02")).toHaveCount(0);

    await query.fill("");
    const industry = page.getByRole("combobox", { name: /Industry/i });
    await chooseOption(page, industry, "E2E");
    await expect.poll(() => new URL(page.url()).searchParams.get("industry")).toBe("E2E");
    await expect(page.locator("tbody tr")).toHaveCount(PAGE_SIZE);

    const sort = page.getByRole("combobox", { name: /Sort/i });
    await chooseOption(page, sort, "Name (A–Z)");
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("name_asc");

    const savedViewName = `E2E companies ${Date.now()}`;
    await page.getByText("+ Save view", { exact: true }).click();
    await page.getByRole("textbox", { name: "New view name" }).fill(savedViewName);
    await page.getByRole("textbox", { name: "New view name" }).press("Enter");
    const saved = page.getByRole("button", { name: savedViewName, exact: true });
    await expect(saved).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect.poll(() => pageOffset(page)).toBe("0");
    await expect.poll(() => new URL(page.url()).searchParams.get("industry")).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBeNull();
    await saved.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("industry")).toBe("E2E");
    await expect.poll(() => new URL(page.url()).searchParams.get("sort")).toBe("name_asc");
    await expect(saved).toHaveAttribute("aria-pressed", "true");
  });

  test("maps selected, filtered, and all export controls to the API contract", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}`);
    await waitForCompanies(page);

    const row = companyRow(page, "E2E Pagination 55");
    await expect(row).toBeVisible();
    const id = await selectedRowId(row);
    await row.getByRole("checkbox").check();

    const selectedUrl = await requestExport(page, /Selected/i);
    expect(selectedUrl.searchParams.get("scope")).toBe("selected");
    const selectedIds =
      selectedUrl.searchParams.get("ids") ??
      selectedUrl.searchParams.get("selected") ??
      selectedUrl.searchParams.get("selectedIds");
    expect(selectedIds).toContain(id);

    const query = searchBox(page);
    await query.fill("E2E Pagination");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("E2E Pagination");
    const filteredUrl = await requestExport(page, /Filtered results/i);
    expect(filteredUrl.searchParams.get("scope")).toBe("filtered");
    expect(filteredUrl.searchParams.get("q")).toBe("E2E Pagination");
    expect(filteredUrl.searchParams.get("offset")).toBeNull();
    expect(filteredUrl.searchParams.get("limit")).toBeNull();

    const allUrl = await requestExport(page, /All companies/i);
    expect(allUrl.searchParams.get("scope")).toBe("all");
    expect(allUrl.searchParams.get("q")).toBeNull();
    expect(allUrl.searchParams.get("industry")).toBeNull();

    const csv = await page.request.get("/api/export/companies?scope=all");
    expect(csv.ok()).toBeTruthy();
    expect(csv.headers()["content-type"]).toMatch(/text\/csv/);
    expect(csv.headers()["content-disposition"]).toMatch(/attachment; filename="fourty-companies-/);
    const raw = await csv.body();
    expect(raw.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(raw.toString("utf8").split("\n", 1)[0]).toContain("name");
  });

  test("supports keyboard navigation and dismissal in the export menu", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}`);
    await waitForCompanies(page);

    const trigger = page.getByRole("button", { name: /^Export/i });
    await trigger.focus();
    await trigger.press("ArrowDown");

    const menu = page.getByRole("menu");
    const firstEnabledItem = page.getByRole("menuitem", { name: /Filtered results/i });
    await expect(menu).toBeVisible();
    await expect(firstEnabledItem).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(menu).toBeVisible();
    // Radix menus hide the rest of the accessibility tree while open, so use a
    // real pointer click outside the popup rather than an ARIA locator.
    await page.mouse.click(300, 30);
    await expect(menu).toBeHidden();
  });

  test("keeps query and selection while previewing, traps focus, and restores the trigger", async ({
    page,
  }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}`);
    await waitForCompanies(page);

    const query = searchBox(page);
    await query.fill("E2E Pagination 55");
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("E2E Pagination 55");
    const row = companyRow(page, "E2E Pagination 55");
    await expect(row).toBeVisible();
    await row.getByRole("checkbox").check();
    const trigger = row.getByRole("button", { name: /Preview/i });
    await expect(trigger).toBeVisible();
    const id = await selectedRowId(row);
    const beforePreview = new URL(page.url());

    await trigger.click();
    await expect.poll(() => new URL(page.url()).searchParams.get("preview")).toBe(id);
    const previewUrl = new URL(page.url());
    expect(previewUrl.searchParams.get("q")).toBe(beforePreview.searchParams.get("q"));
    const dialog = page.getByRole("dialog", { name: /preview|E2E Pagination 55/i });
    await expect(dialog).toBeVisible();
    await expect(
      page.locator(`[data-company-id="${id}"] [data-slot="checkbox"]`),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);

    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(document.activeElement?.closest('[role="dialog"]')),
          ),
        )
        .toBe(true);
    }

    const fullDetail = dialog.getByRole("link", { name: /full detail|View full details/i });
    await expect(fullDetail).toBeVisible();
    await fullDetail.click();
    await expect(page).toHaveURL(new RegExp(`/companies/${id}$`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`[?&]preview=${id}`));
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.poll(() => new URL(page.url()).searchParams.get("preview")).toBeNull();
    await expect(trigger).toBeFocused();
  });

  test("ignores stale company responses and lets a failed query retry", async ({ page }) => {
    let releaseAcme: (() => void) | undefined;
    let acmeStarted: (() => void) | undefined;
    const acmeRequestStarted = new Promise<void>((resolve) => {
      acmeStarted = resolve;
    });
    const delayedAcme = new Promise<void>((resolve) => {
      releaseAcme = resolve;
    });

    await page.route("**/api/companies**", async (route) => {
      const query = new URL(route.request().url()).searchParams.get("q");
      if (query === "Acme") {
        acmeStarted?.();
        await delayedAcme;
      }
      await route.continue();
    });

    await page.goto(`/companies?limit=${PAGE_SIZE}`);
    await waitForCompanies(page);
    const query = searchBox(page);
    await query.fill("Acme");
    await acmeRequestStarted;
    await query.fill("Northwind");
    await expect(companyRow(page, "Northwind Cloud")).toBeVisible();
    releaseAcme?.();
    await expect(companyRow(page, "Northwind Cloud")).toBeVisible();
    await expect(companyRow(page, "Acme Robotics")).toHaveCount(0);
    await page.unroute("**/api/companies**");

    let failOnce = true;
    await page.route("**/api/companies**", async (route) => {
      const requestQuery = new URL(route.request().url()).searchParams.get("q");
      if (requestQuery === "Helios Energy" && failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporary E2E failure" }),
        });
        return;
      }
      await route.continue();
    });

    await query.fill("Helios Energy");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: /Retry/i }).click();
    await expect(companyRow(page, "Helios Energy")).toBeVisible();
    await page.unroute("**/api/companies**");

    await query.fill("company-that-does-not-exist-9f");
    await expect(page.getByText(/No results|No companies match/i).first()).toBeVisible();
    await expect(page.locator("main#main").getByRole("alert")).toHaveCount(0);
  });

  test("recovers from an offset beyond the total with a valid page control", async ({ page }) => {
    const response = await page.request.get(`/api/companies?limit=${PAGE_SIZE}&offset=100`);
    expect(response.ok()).toBeTruthy();
    const data = (await response.json()) as {
      companies: Array<Record<string, unknown>>;
      page: { offset: number; total: number; hasMore: boolean };
    };
    expect(data.companies).toHaveLength(0);
    expect(data.page).toMatchObject({ offset: 100, hasMore: false });
    expect(data.page.total).toBeGreaterThan(PAGE_SIZE);

    await page.goto(`/companies?limit=${PAGE_SIZE}&offset=100`);
    await expect(page.getByRole("heading", { name: /^Companies$/i })).toBeVisible();
    await expect.poll(() => pageOffset(page)).toBe("100");

    const recovery = page.getByRole("button", { name: /Previous page|First page/i }).first();
    await expect(recovery).toBeVisible();
    await expect(recovery).toBeEnabled();
    await recovery.click();
    await expect.poll(() => pageOffset(page)).toMatch(/^(0|50)$/);
    await expect(page.locator("tbody tr").first()).toBeVisible();
  });

  test("reaches Companies on mobile and keeps filters/table usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    const mobileNav = page.getByRole("navigation", { name: "Primary" });
    const companiesLink = mobileNav.getByRole("link", { name: /Companies/i });
    await expect(companiesLink).toBeVisible();
    await companiesLink.click();
    await expect(page).toHaveURL(/\/companies/);
    await waitForCompanies(page);

    const filters = page.getByRole("button", { name: /Filters/i });
    await expect(filters).toBeVisible();
    await filters.click();
    const filterDialog = page.getByRole("dialog", { name: /filters/i });
    await expect(filterDialog).toBeVisible();
    await chooseOption(page, filterDialog.getByRole("combobox", { name: /Industry/i }), "E2E");
    await filterDialog.getByRole("button", { name: /Apply/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("industry")).toBe("E2E");
    await filters.click();
    await filterDialog.getByRole("button", { name: /Reset/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("industry")).toBeNull();

    const table = page.locator("table");
    await expect(table).toBeVisible();
    expect(
      await table.evaluate((node) => {
        const parent = node.parentElement;
        return Boolean(parent && ["auto", "scroll"].includes(getComputedStyle(parent).overflowX));
      }),
    ).toBe(true);
  });

  test("keeps desktop filters inline and leaves room for the search icon", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/companies");
    await waitForCompanies(page);

    await expect(page.getByRole("button", { name: /Filters/i })).toBeHidden();
    const query = searchBox(page);
    await expect(query).toBeVisible();
    const paddingLeft = await query.evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft));
    expect(paddingLeft).toBeGreaterThanOrEqual(36);
  });

  test("toggles the icon sidebar with its trigger and rail and persists the cookie", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.context().clearCookies({ name: "sidebar_state" });
    await page.goto("/companies");
    await waitForCompanies(page);

    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    const trigger = page.locator('[data-sidebar="trigger"]').first();
    const rail = page.locator('[data-sidebar="rail"]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(trigger).toBeVisible();
    await expect(rail).toBeVisible();

    await trigger.click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect
      .poll(async () => {
        const cookie = (await page.context().cookies()).find(
          (candidate) => candidate.name === "sidebar_state",
        );
        return cookie?.value ?? null;
      })
      .toBe("false");

    await rail.click();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect
      .poll(async () => {
        const cookie = (await page.context().cookies()).find(
          (candidate) => candidate.name === "sidebar_state",
        );
        return cookie?.value ?? null;
      })
      .toBe("true");

    await trigger.click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await page.reload();
    await waitForCompanies(page);
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  });

  test("wraps Shift+Tab from the first preview control to the last", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination 55")}`);
    await waitForCompanies(page);

    const row = companyRow(page, "E2E Pagination 55");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Preview/i }).click();

    const dialog = page.getByRole("dialog", { name: /preview/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: /full detail|View full details/i })).toBeVisible();
    const focusables = dialog.locator(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    await expect(focusables.first()).toBeVisible();
    await expect(focusables.last()).toBeVisible();
    await focusables.first().focus();
    await page.keyboard.press("Shift+Tab");
    await expect(focusables.last()).toBeFocused();
  });

  test("keeps the list selection when opening preview without refetching the list", async ({
    page,
  }) => {
    let listRequests = 0;
    await page.route("**/api/companies**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/companies") listRequests += 1;
      await route.continue();
    });

    await page.goto(`/companies?limit=${PAGE_SIZE}`);
    await waitForCompanies(page);
    await page.waitForLoadState("networkidle");
    await expect.poll(() => listRequests).toBeGreaterThan(0);
    const baselineRequests = listRequests;

    const row = companyRow(page, "E2E Pagination 55");
    await expect(row).toBeVisible();
    const id = await selectedRowId(row);
    const checkbox = page.locator(
      `[data-company-id="${id}"] [data-slot="checkbox"]`,
    );
    await checkbox.check();
    await row.getByRole("button", { name: /Preview/i }).click();

    await expect(page.getByRole("dialog", { name: /preview/i })).toBeVisible();
    await expect(checkbox).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/1 selected/i)).toBeVisible();
    await expect.poll(() => listRequests).toBe(baselineRequests);
    await page.unroute("**/api/companies**");
  });

  test("closes a Companies preview deep-link without leaving Companies", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination 55")}`);
    await waitForCompanies(page);
    const id = await selectedRowId(companyRow(page, "E2E Pagination 55"));

    const deepLink = new URL(page.url());
    deepLink.searchParams.set("preview", id);
    await page.goto(deepLink.toString());
    const dialog = page.getByRole("dialog", { name: /preview/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const closed = new URL(page.url());
    expect(closed.pathname).toBe("/companies");
    expect(closed.searchParams.get("preview")).toBeNull();
    expect(closed.searchParams.get("q")).toBe("E2E Pagination 55");
  });

  test("renders a cross-workspace preview deep-link as not found", async ({ page }) => {
    const response = await page.request.get("/api/companies/e2e-id-hidden-company");
    expect(response.status()).toBe(404);

    await page.goto("/companies?limit=50&preview=e2e-id-hidden-company");
    const dialog = page.getByRole("dialog", { name: /preview/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toContainText("Company not found");
    await expect(dialog.getByRole("link", { name: /full detail|View full details/i })).toHaveCount(0);
  });

  test("ignores a stale preview response after switching records", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination")}`);
    await waitForCompanies(page);
    const row55 = companyRow(page, "E2E Pagination 55");
    const row54 = companyRow(page, "E2E Pagination 54");
    const id55 = await selectedRowId(row55);
    let release55: (() => void) | undefined;
    let resolve55Started: (() => void) | undefined;
    const preview55Started = new Promise<void>((resolve) => {
      resolve55Started = resolve;
    });
    const delayed55 = new Promise<void>((resolve) => {
      release55 = resolve;
    });

    await page.route("**/api/companies/*", async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1);
      if (id === id55) {
        resolve55Started?.();
        await delayed55;
      }
      await route.continue();
    });

    await row55.getByRole("button", { name: /Preview/i }).click();
    await preview55Started;
    const dialog = page.getByRole("dialog", { name: /preview/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await row54.getByRole("button", { name: /Preview/i }).click();
    await expect(dialog.getByRole("heading", { name: "E2E Pagination 54", exact: true })).toBeVisible();
    release55?.();
    await expect(dialog.getByRole("heading", { name: "E2E Pagination 55", exact: true })).toHaveCount(0);
    await page.unroute("**/api/companies/*");
  });

  test("retries a failed preview request and renders the selected company", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination 55")}`);
    await waitForCompanies(page);
    const row = companyRow(page, "E2E Pagination 55");
    const id = await selectedRowId(row);
    let failed = false;
    await page.route("**/api/companies/*", async (route) => {
      const requestId = new URL(route.request().url()).pathname.split("/").at(-1);
      if (requestId === id && !failed) {
        failed = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporary preview failure" }),
        });
        return;
      }
      await route.continue();
    });

    await row.getByRole("button", { name: /Preview/i }).click();
    const dialog = page.getByRole("dialog", { name: /preview/i });
    await expect(dialog.getByRole("alert")).toContainText("Could not load company preview");
    await dialog.getByRole("button", { name: /Retry/i }).click();
    await expect(dialog.getByRole("heading", { name: "E2E Pagination 55", exact: true })).toBeVisible();
    await page.unroute("**/api/companies/*");
  });

  test("keeps the preview open while nested command palette closes only its top layer", async ({
    page,
  }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination 55")}`);
    await waitForCompanies(page);
    await companyRow(page, "E2E Pagination 55").getByRole("button", { name: /Preview/i }).click();

    const preview = page.getByRole("dialog", { name: /preview/i });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("tabindex", "-1");
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+KeyK`);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('[role="dialog"]')),
        ),
      )
      .toBe(true);
  });

  test("keeps nested palette focus when browser Back closes its preview underneath", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination 55")}`);
    await waitForCompanies(page);
    await companyRow(page, "E2E Pagination 55").getByRole("button", { name: /Preview/i }).click();

    const preview = page.getByRole("dialog", { name: /preview/i });
    await expect(preview).toBeVisible();
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+KeyK`);
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.goBack();
    await expect(preview).toBeHidden();
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("combobox")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(
      page.locator("[data-command-palette-trigger]:visible").first(),
    ).toBeFocused();
  });

  test("restores the preview from browser Forward after Back returns to the list", async ({ page }) => {
    await page.goto(`/companies?limit=${PAGE_SIZE}&q=${encodeURIComponent("E2E Pagination 55")}`);
    await waitForCompanies(page);
    const row = companyRow(page, "E2E Pagination 55");
    const id = await selectedRowId(row);
    await row.getByRole("button", { name: /Preview/i }).click();

    const preview = page.getByRole("dialog", { name: /preview/i });
    await expect(preview).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("preview")).toBe(id);

    await page.goBack();
    await expect(preview).toBeHidden();
    await expect.poll(() => new URL(page.url()).searchParams.get("preview")).toBeNull();
    await expect(page).toHaveURL(/\/companies\?/);

    await page.goForward();
    await expect(preview).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get("preview")).toBe(id);
  });

  test("toggles the icon sidebar with Meta/Ctrl+B and leaves reload unprevented", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.context().clearCookies({ name: "sidebar_state" });
    await page.goto("/companies");
    await waitForCompanies(page);

    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    await page.evaluate(() => {
      window.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() === "r") {
          sessionStorage.setItem(
            "__e2eSidebarReloadPrevented",
            String(event.defaultPrevented),
          );
        }
      });
      sessionStorage.removeItem("__e2eSidebarReloadPrevented");
    });
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+KeyB`);
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect
      .poll(async () => {
        const cookie = (await page.context().cookies()).find(
          (candidate) => candidate.name === "sidebar_state",
        );
        return cookie?.value ?? null;
      })
      .toBe("false");

    await page.keyboard.press(`${modifier}+KeyB`);
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    await page.keyboard.press(`${modifier}+KeyR`);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("__e2eSidebarReloadPrevented")))
      .toBe("false");
  });

  test("shows no-data separately from no-results in an empty workspace", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: RESTRICTED_EMPTY_STORAGE_STATE,
    });
    const page = await context.newPage();
    try {
      const response = await page.request.get(`/api/companies?limit=${PAGE_SIZE}`);
      expect(response.ok()).toBeTruthy();
      const data = (await response.json()) as {
        companies: unknown[];
        page?: { total?: number };
      };
      expect(data.companies).toHaveLength(0);
      expect(data.page?.total).toBe(0);

      await page.goto("/companies");
      await expect(page.getByRole("heading", { name: /^Companies$/i })).toBeVisible();
      await expect(page.getByText("No companies yet", { exact: true })).toBeVisible();
      await expect(page.getByText("No companies match these filters", { exact: true })).toHaveCount(0);

      await searchBox(page).fill("company-that-does-not-exist-in-empty-workspace");
      await expect(page.getByText("No companies match these filters", { exact: true })).toBeVisible();
      await expect(page.getByText("No companies yet", { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("restricted browser session receives redacted rows and CSV headers", async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: RESTRICTED_STORAGE_STATE,
    });
    const page = await context.newPage();
    try {
      const response = await page.request.get(`/api/companies?limit=${PAGE_SIZE}`);
      expect(response.ok()).toBeTruthy();
      const data = (await response.json()) as {
        companies: Array<Record<string, unknown>>;
      };
      expect(data.companies.length).toBeGreaterThan(0);
      for (const company of data.companies) {
        expect(company).not.toHaveProperty("name");
        expect(company).not.toHaveProperty("domain");
        expect(company).not.toHaveProperty("updatedAt");
        expect(company).not.toHaveProperty("annualRevenue");
      }

      const csv = await page.request.get("/api/export/companies?scope=all");
      expect(csv.ok()).toBeTruthy();
      const header = (await csv.text()).replace(/^\uFEFF/, "").split("\n", 1)[0];
      expect(header).not.toMatch(/(^|,)name(,|$)/);
      expect(header).not.toMatch(/(^|,)domain(,|$)/);
      expect(header).not.toMatch(/annualRevenue/);

      await page.goto("/companies");
      await waitForCompanies(page);
      await expect(page.getByText("Acme Robotics", { exact: true })).toHaveCount(0);
      await expect(page.getByText("acmerobotics.io", { exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("restricted row with hidden id has no selection, preview, or detail affordance", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: RESTRICTED_ID_HIDDEN_STORAGE_STATE,
    });
    const page = await context.newPage();
    try {
      const response = await page.request.get("/api/companies?limit=50");
      expect(response.ok()).toBeTruthy();
      const data = (await response.json()) as {
        companies: Array<Record<string, unknown>>;
      };
      const hiddenIdCompany = data.companies.find(
        (company) => company.name === "E2E ID Hidden Company",
      );
      expect(hiddenIdCompany).toBeDefined();
      expect(hiddenIdCompany).not.toHaveProperty("id");

      await page.goto("/companies");
      await waitForCompanies(page);
      const row = companyRow(page, "E2E ID Hidden Company");
      await expect(row).toBeVisible();
      await expect(row.getByRole("checkbox")).toHaveCount(0);
      await expect(row.getByRole("button", { name: /Preview/i })).toHaveCount(0);
      await expect(row.locator('a[href^="/companies/"]')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

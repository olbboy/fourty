import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function failFirstGet(page: Page, pathname: string): Promise<() => number> {
  let requests = 0;
  await page.route(`**${pathname}**`, async (route: Route) => {
    const request = route.request();
    if (request.method() !== "GET" || new URL(request.url()).pathname !== pathname) {
      await route.continue();
      return;
    }
    requests += 1;
    if (requests === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary acceptance-test failure" }),
      });
      return;
    }
    await route.continue();
  });
  return () => requests;
}

async function expectRetryRecovery(
  page: Page,
  options: {
    path: string;
    apiPath: string;
    loaded: Locator;
  },
): Promise<void> {
  const requestCount = await failFirstGet(page, options.apiPath);
  await page.goto(options.path);
  const alert = page.locator("main#main").getByRole("alert");
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: /retry/i }).click();
  await expect(options.loaded).toBeVisible();
  await expect(alert).toBeHidden();
  expect(requestCount()).toBe(2);
  await page.unroute(`**${options.apiPath}**`);
}

async function expectMinimumTarget(locator: Locator, minimum = 44): Promise<void> {
  const count = await locator.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const control = locator.nth(index);
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    expect(box, `Control ${index} must have a layout box`).not.toBeNull();
    expect(box?.width, `Control ${index} width`).toBeGreaterThanOrEqual(minimum);
    expect(box?.height, `Control ${index} height`).toBeGreaterThanOrEqual(minimum);
  }
}

function rowRecordLink(page: Page, entity: "contacts" | "deals"): Locator {
  return page.locator(`tbody tr a[href^="/${entity}/"]`).first();
}

test.describe("responsive shell and data surfaces", () => {
  test("mobile shell exposes secondary routes and navigates to Settings", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");

    const trigger = page.locator('[data-slot="sidebar-trigger"]:visible').first();
    await expect(trigger).toHaveAccessibleName(/toggle sidebar/i);
    await expect(trigger).toBeVisible();
    await trigger.click();

    const sidebar = page.locator('[data-slot="sidebar"][data-mobile="true"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /^Reports$/i })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: /^Workflows$/i })).toBeVisible();
    const settings = sidebar.getByRole("link", { name: /^Settings$/i });
    await expect(settings).toBeVisible();
    await settings.click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: /^Settings$/i })).toBeVisible();
  });

  test("mobile shell controls meet the minimum touch target", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /^Dashboard$/i })).toBeVisible();
    await expectMinimumTarget(page.locator("header button:visible"));
    await expectMinimumTarget(page.locator('nav[aria-label="Primary"] :is(a, button):visible'));
  });

  for (const entity of ["companies", "contacts"] as const) {
    test(`${entity} explains horizontal table access on mobile`, async ({ page }) => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await page.goto(`/${entity}`);
      await expect(page.getByRole("heading", { name: new RegExp(`^${entity}$`, "i") })).toBeVisible();
      const table = page.locator("table").first();
      await expect(table).toBeVisible();
      await expect(page.getByText(/swipe horizontally|swipe to see more|scroll horizontally/i)).toBeVisible();
      expect(
        await table.evaluate((node) => {
          const scroller = node.parentElement;
          return Boolean(
            scroller &&
              ["auto", "scroll"].includes(getComputedStyle(scroller).overflowX) &&
              scroller.scrollWidth > scroller.clientWidth,
          );
        }),
      ).toBe(true);
    });
  }
});

test.describe("record-list interaction contracts", () => {
  test("Contacts keeps search, status, and sort in one compact desktop row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/contacts");
    await expect(page.locator("tbody tr").first()).toBeVisible();

    const search = page.getByRole("textbox", { name: /search name|search contacts/i });
    const status = page.getByRole("combobox", { name: /status/i });
    const sort = page.getByRole("combobox", { name: /sort/i });
    const boxes = await Promise.all([search.boundingBox(), status.boundingBox(), sort.boundingBox()]);
    for (const box of boxes) expect(box).not.toBeNull();
    const topEdges = boxes.map((box) => box?.y ?? 0);
    expect(Math.max(...topEdges) - Math.min(...topEdges)).toBeLessThanOrEqual(8);
    expect(boxes[1]?.width).toBeLessThanOrEqual(260);
    expect(boxes[2]?.width).toBeLessThanOrEqual(260);
  });

  test("Base UI select portals its options and restores focus on Escape", async ({ page }) => {
    await page.goto("/companies");
    const industry = page.getByRole("combobox", { name: /industry/i }).first();
    await expect(industry).toBeVisible();
    await industry.click();

    const listbox = page.getByRole("listbox").last();
    await expect(listbox).toBeVisible();
    expect(await listbox.evaluate((node) => node.closest("main#main"))).toBeNull();

    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(industry).toBeFocused();
  });

  test("the first Contact is a focusable link and Enter follows it", async ({ page }) => {
    await page.goto("/contacts");
    const link = rowRecordLink(page, "contacts");
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/contacts\/[^/]+$/);
    await link.focus();
    await expect(link).toBeFocused();
    await link.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${escapeRegExp(href ?? "")}$`));
  });

  test("Deal records are links in Kanban and list views", async ({ page }) => {
    await page.goto("/deals");
    const kanbanLink = page.locator('[data-testid="deal-card"] a[href^="/deals/"]').first();
    await expect(kanbanLink).toBeVisible();
    await kanbanLink.focus();
    await expect(kanbanLink).toBeFocused();

    await page.getByRole("button", { name: /list view/i }).click();
    const listLink = rowRecordLink(page, "deals");
    await expect(listLink).toBeVisible();
    await listLink.focus();
    await expect(listLink).toBeFocused();
    expect(await listLink.getAttribute("href")).toMatch(/^\/deals\/[^/]+$/);
  });

  test("mobile Kanban exposes a horizontal-stage cue", async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/deals");
    await expect(page.getByTestId("stage-column").first()).toBeVisible();
    await expect(page.getByText(/swipe horizontally|swipe.*stage|scroll.*stage/i)).toBeVisible();
  });
});

test.describe("recoverable async failures", () => {
  test("Contacts announces a failed first request and retries", async ({ page }) => {
    await expectRetryRecovery(page, {
      path: "/contacts",
      apiPath: "/api/contacts",
      loaded: page.locator("tbody tr").first(),
    });
  });

  test("Deals announces a failed first request and retries", async ({ page }) => {
    await expectRetryRecovery(page, {
      path: "/deals",
      apiPath: "/api/deals",
      loaded: page.getByTestId("deal-card").first(),
    });
  });

  test("Dashboard announces a failed first request and retries", async ({ page }) => {
    await expectRetryRecovery(page, {
      path: "/dashboard",
      apiPath: "/api/stats/dashboard",
      loaded: page.getByText("Open pipeline", { exact: true }),
    });
  });

  test("Tasks announces a failed first request and retries", async ({ page }) => {
    await expectRetryRecovery(page, {
      path: "/tasks",
      apiPath: "/api/tasks",
      loaded: page.locator('main#main input[type="checkbox"]').first(),
    });
  });
});

test.describe("preview and settings semantics", () => {
  test("Company Preview groups returned fields into labelled sections", async ({ page }) => {
    const response = await page.request.get("/api/companies?limit=50&sort=name_asc");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      companies: Array<Record<string, unknown>>;
    };
    const company = body.companies.find(
      (candidate) =>
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        [candidate.domain, candidate.industry, candidate.city, candidate.country].filter(
          (value) => typeof value === "string" && value.length > 0,
        ).length >= 2,
    );
    expect(company, "E2E seed must include a company with readable detail fields").toBeDefined();

    await page.goto(`/companies?q=${encodeURIComponent(String(company?.name))}`);
    const row = page.getByRole("row", { name: new RegExp(escapeRegExp(String(company?.name))) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /preview/i }).click();
    const dialog = page.getByRole("dialog", { name: /preview/i });
    await expect(dialog).toBeVisible();

    const sections = dialog.locator("section[aria-labelledby]");
    // The preview fills in after its request returns; count once it has.
    await expect(sections.first()).toBeVisible();
    expect(await sections.count()).toBeGreaterThanOrEqual(2);
    for (let index = 0; index < (await sections.count()); index += 1) {
      const section = sections.nth(index);
      const labelledBy = await section.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      await expect(dialog.locator(`#${labelledBy}`)).toBeVisible();
    }

    const returnedText = [company?.name, company?.domain, company?.industry, company?.city, company?.country]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .slice(0, 3);
    for (const value of returnedText) await expect(dialog.getByText(value, { exact: true }).first()).toBeVisible();
    await expect(dialog.getByRole("link", { name: /full detail|view full details/i })).toHaveAttribute(
      "href",
      `/companies/${company?.id}`,
    );
  });

  test("Settings names member deletion and pluralizes Companies", async ({ page }) => {
    const response = await page.request.get("/api/members");
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      members: Array<{ name: string; deactivatedAt: number | null }>;
    };
    const member = body.members.find((candidate) => !candidate.deactivatedAt);
    expect(member).toBeDefined();

    await page.goto("/settings");
    const membersCard = page.locator("[data-slot=card]").filter({
      has: page.getByRole("heading", { name: "Team members", exact: true }),
    });
    await expect(
      membersCard.getByRole("button", {
        name: new RegExp(`(remove|delete).*${escapeRegExp(member?.name ?? "")}`, "i"),
      }),
    ).toBeVisible();

    const customFieldsCard = page.locator("[data-slot=card]").filter({
      has: page.getByRole("heading", { name: "Custom fields", exact: true }),
    });
    const companies = customFieldsCard.getByRole("button", { name: "Companies", exact: true });
    await expect(companies).toBeVisible();
    await companies.click();
    await expect(customFieldsCard.getByText("Companys", { exact: true })).toHaveCount(0);
  });
});

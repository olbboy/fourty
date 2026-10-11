import { test, expect, type Page, type Route } from "@playwright/test";

type TestStage = {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  winProbability: number;
  type: "open" | "won" | "lost";
  color: string;
};

type TestPipeline = {
  id: string;
  name: string;
  isDefault: number;
  stages: TestStage[];
};

const pipelines: TestPipeline[] = [
  {
    id: "pipeline-sales",
    name: "Sales",
    isDefault: 0,
    stages: [
      {
        id: "sales-qualified",
        pipelineId: "pipeline-sales",
        name: "Qualified",
        order: 0,
        winProbability: 25,
        type: "open",
        color: "#6366f1",
      },
      {
        id: "sales-won",
        pipelineId: "pipeline-sales",
        name: "Won",
        order: 1,
        winProbability: 100,
        type: "won",
        color: "#22c55e",
      },
    ],
  },
  {
    id: "pipeline-enterprise",
    name: "Enterprise",
    isDefault: 1,
    stages: [
      {
        id: "enterprise-discovery",
        pipelineId: "pipeline-enterprise",
        name: "Discovery",
        order: 0,
        winProbability: 10,
        type: "open",
        color: "#6366f1",
      },
      {
        id: "enterprise-proposal",
        pipelineId: "pipeline-enterprise",
        name: "Proposal",
        order: 1,
        winProbability: 50,
        type: "open",
        color: "#f59e0b",
      },
    ],
  },
];

async function mockDealFormApi(
  page: Page,
  options: { failFirstPost?: boolean } = {},
): Promise<{
  getPostCount: () => number;
  getPostBodies: () => Record<string, unknown>[];
}> {
  let postCount = 0;
  const postBodies: Record<string, unknown>[] = [];

  await page.route("**/api/pipelines**", async (route: Route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/pipelines" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ pipelines }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/deals**", async (route: Route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/deals" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ deals: [] }),
      });
      return;
    }
    if (new URL(request.url()).pathname === "/api/deals" && request.method() === "POST") {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      postCount += 1;
      postBodies.push(body);
      if (options.failFirstPost && postCount === 1) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ deal: { id: "deal-created" } }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/companies**", async (route: Route) => {
    if (new URL(route.request().url()).pathname === "/api/companies") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ companies: [] }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/contacts**", async (route: Route) => {
    if (new URL(route.request().url()).pathname === "/api/contacts") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ contacts: [] }),
      });
      return;
    }
    await route.continue();
  });

  await page.route("**/api/custom-fields**", async (route: Route) => {
    if (new URL(route.request().url()).pathname === "/api/custom-fields") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ fields: [] }),
      });
      return;
    }
    await route.continue();
  });

  return {
    getPostCount: () => postCount,
    getPostBodies: () => postBodies,
  };
}

async function chooseOption(page: Page, name: string): Promise<void> {
  await page.getByRole("listbox").getByRole("option", { name, exact: true }).click();
}

test("new deal resets its stage when the pipeline changes", async ({ page }) => {
  const api = await mockDealFormApi(page);

  await page.goto("/deals?new=1");
  const dialog = page.getByRole("dialog", { name: "New deal" });
  await expect(dialog).toBeVisible();

  const stage = dialog.getByRole("combobox", { name: "Stage" });
  const pipeline = dialog.getByRole("combobox", { name: "Pipeline" });
  await expect(pipeline).toContainText("Enterprise");
  await expect(stage).toContainText("Discovery");

  await stage.click();
  await chooseOption(page, "Proposal");
  await expect(stage).toContainText("Proposal");

  await pipeline.click();
  await chooseOption(page, "Sales");
  await expect(stage).toContainText("Qualified");

  await dialog.getByRole("textbox", { name: "Deal name" }).fill("Enterprise expansion");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  await expect.poll(() => api.getPostBodies()[0]).toMatchObject({
    pipelineId: "pipeline-sales",
    stageId: "sales-qualified",
  });
  const submitted = api.getPostBodies()[0];
  const submittedPipeline = pipelines.find((pipeline) => pipeline.id === submitted?.pipelineId);
  expect(submittedPipeline?.stages.some((stage) => stage.id === submitted?.stageId)).toBe(true);
});

test("new deal submits only once for duplicate same-tick requestSubmit calls", async ({ page }) => {
  const api = await mockDealFormApi(page);

  await page.goto("/deals?new=1");
  const dialog = page.getByRole("dialog", { name: "New deal" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Pipeline" })).toContainText("Enterprise");
  await dialog.getByRole("textbox", { name: "Deal name" }).fill("Duplicate guard");

  await dialog.locator("form").evaluate((form) => {
    const dealForm = form as HTMLFormElement;
    dealForm.requestSubmit();
    dealForm.requestSubmit();
  });

  await expect.poll(() => api.getPostCount()).toBe(1);
  await expect(dialog).toBeHidden();
});

test("new deal can retry a network failure without losing entered values", async ({ page }) => {
  const api = await mockDealFormApi(page, { failFirstPost: true });

  await page.goto("/deals?new=1");
  const dialog = page.getByRole("dialog", { name: "New deal" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Pipeline" })).toContainText("Enterprise");

  const name = dialog.getByRole("textbox", { name: "Deal name" });
  const amount = dialog.getByRole("spinbutton", { name: "Amount" });
  await name.fill("Retryable deal");
  await amount.fill("12500");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  await expect(dialog.getByRole("alert")).toContainText("try again");
  await expect(name).toHaveValue("Retryable deal");
  await expect(amount).toHaveValue("12500");
  await expect(dialog.getByRole("button", { name: "Create deal" })).toBeEnabled();

  await dialog.getByRole("button", { name: "Create deal" }).click();
  await expect.poll(() => api.getPostCount()).toBe(2);
  await expect(dialog).toBeHidden();
  expect(api.getPostBodies()[1]).toMatchObject({ name: "Retryable deal", amount: 12500 });
});

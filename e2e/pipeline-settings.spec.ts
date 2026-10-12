import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import { RESTRICTED_STORAGE_STATE } from "./helpers/restricted-session";

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

const stagesFor = (pipelineId: string): TestStage[] => [
  {
    id: `${pipelineId}-qualified`,
    pipelineId,
    name: "Qualified",
    order: 0,
    winProbability: 25,
    type: "open",
    color: "#6366f1",
  },
  {
    id: `${pipelineId}-won`,
    pipelineId,
    name: "Won",
    order: 1,
    winProbability: 100,
    type: "won",
    color: "#22c55e",
  },
];

const initialPipelines = (): TestPipeline[] => [
  {
    id: "pipeline-sales",
    name: "Sales",
    isDefault: 1,
    stages: stagesFor("pipeline-sales"),
  },
  {
    id: "pipeline-enterprise",
    name: "Enterprise",
    isDefault: 0,
    stages: stagesFor("pipeline-enterprise"),
  },
];

async function mockPipelineApi(
  page: Page,
  options: {
    empty?: boolean;
    failFirstGet?: boolean;
    failGetOn?: number;
    rejectReorder?: boolean;
    failFirstCreate?: boolean;
    longPipelineName?: boolean;
  } = {},
): Promise<{ getCount: () => number; createCount: () => number; reorderCount: () => number }> {
  let pipelines = options.empty ? [] : initialPipelines();
  if (options.longPipelineName) {
    pipelines = pipelines.map((pipeline) =>
      pipeline.id === "pipeline-enterprise"
        ? {
            ...pipeline,
            name: "Enterprise partnerships across every international region and business unit",
          }
        : pipeline,
    );
  }
  let getCount = 0;
  let createCount = 0;
  let reorderCount = 0;
  let nextPipeline = 1;
  let nextStage = 1;

  await page.route("**/api/pipelines**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (path === "/api/pipelines" && method === "GET") {
      getCount += 1;
      if ((options.failFirstGet && getCount === 1) || options.failGetOn === getCount) {
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Pipeline service unavailable" }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pipelines }) });
      return;
    }

    if (path === "/api/pipelines" && method === "POST") {
      createCount += 1;
      if (options.failFirstCreate && createCount === 1) {
        await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Pipeline name already exists" }) });
        return;
      }
      const body = (request.postDataJSON() ?? {}) as { name?: string };
      const id = `pipeline-created-${nextPipeline++}`;
      const created: TestPipeline = {
        id,
        name: body.name ?? "Untitled",
        isDefault: 0,
        stages: stagesFor(id),
      };
      pipelines = [...pipelines, created];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ pipeline: created }) });
      return;
    }

    const pipelineMatch = path.match(/^\/api\/pipelines\/([^/]+)$/);
    if (pipelineMatch) {
      const pipelineId = pipelineMatch[1];
      const index = pipelines.findIndex((pipeline) => pipeline.id === pipelineId);
      if (index < 0) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Pipeline not found" }) });
        return;
      }

      if (method === "PATCH") {
        const body = (request.postDataJSON() ?? {}) as { name?: string; isDefault?: boolean };
        let next = pipelines.map((pipeline, currentIndex) =>
          currentIndex === index
            ? { ...pipeline, ...(body.name === undefined ? {} : { name: body.name }), ...(body.isDefault === undefined ? {} : { isDefault: body.isDefault ? 1 : 0 }) }
            : body.isDefault
              ? { ...pipeline, isDefault: 0 }
              : pipeline,
        );
        pipelines = next;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pipeline: next[index] }) });
        return;
      }

      if (method === "DELETE") {
        pipelines = pipelines.filter((pipeline) => pipeline.id !== pipelineId);
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
    }

    const stagesMatch = path.match(/^\/api\/pipelines\/([^/]+)\/stages$/);
    if (stagesMatch) {
      const pipelineId = stagesMatch[1];
      const pipelineIndex = pipelines.findIndex((pipeline) => pipeline.id === pipelineId);
      if (pipelineIndex < 0) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Pipeline not found" }) });
        return;
      }

      if (method === "POST") {
        const body = (request.postDataJSON() ?? {}) as Partial<TestStage> & { name: string };
        const current = pipelines[pipelineIndex];
        const firstTerminal = current.stages.findIndex((stage) => stage.type === "won" || stage.type === "lost");
        const insertAt = firstTerminal < 0 ? current.stages.length : firstTerminal;
        const stage: TestStage = {
          id: `stage-created-${nextStage++}`,
          pipelineId,
          name: body.name,
          order: insertAt,
          winProbability: body.winProbability ?? 50,
          type: "open",
          color: body.color ?? "#a89f99",
        };
        const stages = [...current.stages];
        stages.splice(insertAt, 0, stage);
        const next = { ...current, stages: stages.map((currentStage, order) => ({ ...currentStage, order })) };
        pipelines = pipelines.map((pipeline, index) => (index === pipelineIndex ? next : pipeline));
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ stage }) });
        return;
      }

      if (method === "PATCH") {
        reorderCount += 1;
        if (options.rejectReorder) {
          await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Stage order changed on the server" }) });
          return;
        }
        const body = (request.postDataJSON() ?? {}) as { stageIds?: string[] };
        const current = pipelines[pipelineIndex];
        const byId = new Map(current.stages.map((stage) => [stage.id, stage]));
        const stages = (body.stageIds ?? []).map((id, order) => ({ ...byId.get(id)!, order }));
        const next = { ...current, stages };
        pipelines = pipelines.map((pipeline, index) => (index === pipelineIndex ? next : pipeline));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stages: next.stages }) });
        return;
      }
    }

    const stageMatch = path.match(/^\/api\/pipelines\/([^/]+)\/stages\/([^/]+)$/);
    if (stageMatch) {
      const pipelineId = stageMatch[1];
      const stageId = stageMatch[2];
      const pipelineIndex = pipelines.findIndex((pipeline) => pipeline.id === pipelineId);
      const pipeline = pipelines[pipelineIndex];
      const stageIndex = pipeline?.stages.findIndex((stage) => stage.id === stageId) ?? -1;
      if (!pipeline || stageIndex < 0) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Stage not found" }) });
        return;
      }

      if (method === "PATCH") {
        const body = (request.postDataJSON() ?? {}) as Partial<TestStage>;
        const stage = { ...pipeline.stages[stageIndex], ...body };
        const next = { ...pipeline, stages: pipeline.stages.map((current, index) => (index === stageIndex ? stage : current)) };
        pipelines = pipelines.map((current, index) => (index === pipelineIndex ? next : current));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stage }) });
        return;
      }

      if (method === "DELETE") {
        const next = { ...pipeline, stages: pipeline.stages.filter((stage) => stage.id !== stageId).map((stage, order) => ({ ...stage, order })) };
        pipelines = pipelines.map((current, index) => (index === pipelineIndex ? next : current));
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
        return;
      }
    }

    await route.continue();
  });

  return { getCount: () => getCount, createCount: () => createCount, reorderCount: () => reorderCount };
}

async function confirmDeletion(page: Page, control: Locator, action = "Delete"): Promise<void> {
  await control.click();
  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: action, exact: true }).click();
  await expect(confirmation).toBeHidden();
}

function pipelineButton(card: Locator, name: string): Locator {
  return card
    .locator('div[aria-label="Pipelines"]')
    .getByRole("button", { name: new RegExp(`^${name}(?: Default)?$`) });
}

test.describe("Pipeline settings", () => {
  test("loads, creates, edits, and deletes pipelines and stages", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockPipelineApi(page);
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    await expect(card).toBeVisible();
    const pipelineList = card.locator('div[aria-label="Pipelines"]');
    await expect(pipelineButton(card, "Sales")).toBeVisible();
    await expect(card.getByText("Qualified", { exact: true })).toBeVisible();

    await card.getByRole("button", { name: "New pipeline" }).click();
    const createDialog = page.getByRole("dialog", { name: "New pipeline" });
    await createDialog.getByLabel("Pipeline name").fill("Partner");
    await createDialog.getByRole("button", { name: "Create pipeline" }).click();
    await expect(pipelineButton(card, "Partner")).toBeVisible();

    await pipelineButton(card, "Partner").click();
    await card.getByRole("button", { name: "Rename pipeline" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename pipeline" });
    await renameDialog.getByLabel("Pipeline name").fill("Partners");
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect(pipelineButton(card, "Partners")).toBeVisible();

    await card.getByRole("button", { name: "Set as default" }).click();
    const partnersButton = pipelineList.getByRole("button", { name: /^Partners/ });
    await expect(partnersButton).toHaveAttribute("aria-pressed", "true");
    await expect(partnersButton).toContainText("Default");

    await card.getByRole("button", { name: "Add stage" }).click();
    const stageDialog = page.getByRole("dialog", { name: "Add stage" });
    await stageDialog.getByLabel("Stage name").fill("Negotiation");
    await expect(stageDialog.getByRole("combobox", { name: "Type" })).toHaveCount(0);
    await stageDialog.getByRole("button", { name: "Add stage" }).click();
    await expect(card.getByText("Negotiation", { exact: true })).toBeVisible();
    await expect(card.getByRole("listitem", { name: "Negotiation" })).toContainText("Open");

    const negotiation = card.getByRole("listitem", { name: /Negotiation/ });
    await negotiation.getByRole("button", { name: "Edit stage Negotiation" }).click();
    const editStageDialog = page.getByRole("dialog", { name: /Edit stage/ });
    await editStageDialog.getByLabel("Stage name").fill("Negotiation ready");
    await expect(editStageDialog.getByRole("combobox", { name: "Type" })).toHaveCount(0);
    await editStageDialog.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Negotiation ready", { exact: true })).toBeVisible();

    await confirmDeletion(
      page,
      card.getByRole("button", { name: "Delete stage Negotiation ready" }),
    );
    await expect(card.getByText("Negotiation ready", { exact: true })).toHaveCount(0);

    await pipelineButton(card, "Sales").click();
    await card.getByRole("button", { name: "Set as default" }).click();
    await partnersButton.click();
    await confirmDeletion(page, card.getByRole("button", { name: "Delete pipeline Partners" }));
    await expect(pipelineList.getByRole("button", { name: /^Partners/ })).toHaveCount(0);
  });

  test("shows load errors, retries, and preserves server conflict errors", async ({ page }) => {
    const api = await mockPipelineApi(page, { failFirstGet: true, rejectReorder: true });
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    await expect(card.getByRole("alert")).toContainText("Pipeline service unavailable");
    await card.getByRole("button", { name: "Retry" }).click();
    await expect(pipelineButton(card, "Sales")).toBeVisible();
    expect(api.getCount()).toBe(2);

    const sales = pipelineButton(card, "Sales");
    await sales.click();
    const qualified = card.getByRole("listitem", { name: /Qualified/ });
    await qualified.getByRole("button", { name: "Move Qualified down" }).click();
    await expect(card.getByRole("alert")).toContainText("Stage order changed on the server");
    await expect(card.getByText("Qualified", { exact: true })).toBeVisible();
  });

  test("reorders stages after the server accepts the new order", async ({ page }) => {
    const api = await mockPipelineApi(page);
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    const qualified = card.getByRole("listitem", { name: "Qualified" });
    await qualified.getByRole("button", { name: "Move Qualified down" }).click();

    const stages = card.getByRole("list", { name: "Stages" });
    await expect(stages.getByRole("listitem").nth(0)).toHaveAccessibleName("Won");
    await expect(stages.getByRole("listitem").nth(1)).toHaveAccessibleName("Qualified");
    expect(api.reorderCount()).toBe(1);
  });

  test("keeps retry available when a successful mutation refresh fails", async ({ page }) => {
    const api = await mockPipelineApi(page, { failGetOn: 2 });
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    await card.getByRole("button", { name: "New pipeline" }).click();
    const dialog = page.getByRole("dialog", { name: "New pipeline" });
    await dialog.getByLabel("Pipeline name").fill("Partner");
    await dialog.getByRole("button", { name: "Create pipeline" }).click();

    await expect(card.getByRole("alert")).toContainText("Pipeline service unavailable");
    await expect(card.getByRole("button", { name: "Retry" })).toBeVisible();
    await card.getByRole("button", { name: "Retry" }).click();
    await expect(pipelineButton(card, "Partner")).toBeVisible();
    expect(api.getCount()).toBe(3);
  });

  test("keeps modal values visible for mutation retry and blocks duplicate submits", async ({ page }) => {
    const api = await mockPipelineApi(page, { failFirstCreate: true });
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    await card.getByRole("button", { name: "New pipeline" }).click();
    const dialog = page.getByRole("dialog", { name: "New pipeline" });
    const name = dialog.getByLabel("Pipeline name");
    await name.fill("Partner");
    await dialog.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });

    await expect(dialog.getByRole("alert")).toContainText("Pipeline name already exists");
    await expect(name).toHaveValue("Partner");
    expect(api.createCount()).toBe(1);

    await dialog.getByRole("button", { name: "Create pipeline" }).click();
    await expect(pipelineButton(card, "Partner")).toBeVisible();
    expect(api.createCount()).toBe(2);
  });

  test("shows read-only pipeline settings to a viewer", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, storageState: RESTRICTED_STORAGE_STATE });
    const page = await context.newPage();
    try {
      await mockPipelineApi(page);
      await page.goto("/settings");

      const card = page.getByRole("region", { name: "Pipelines" });
      await expect(card.getByRole("status")).toContainText("read-only");
      await expect(card.getByRole("button", { name: "New pipeline" })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Rename pipeline" })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Set as default" })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
      await expect(card.getByRole("button", { name: "Add stage" })).toHaveCount(0);
      await expect(card.getByRole("button", { name: /Move .* (up|down)/ })).toHaveCount(0);
      await expect(card.getByRole("button", { name: /Edit stage/ })).toHaveCount(0);
      await expect(card.getByRole("button", { name: /Delete stage/ })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("shows an empty state with a create action", async ({ page }) => {
    await mockPipelineApi(page, { empty: true });
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    await expect(card.getByText("No pipelines yet", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "New pipeline" })).toHaveCount(2);
  });

  test("renders an accessible, usable mobile editor", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockPipelineApi(page);
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "New pipeline" })).toBeVisible();
    const pipelineSelect = card.getByRole("combobox", { name: "Select pipeline" });
    await expect(pipelineSelect).toBeVisible();
    await expect(card.getByRole("button", { name: "Add stage" })).toBeVisible();
    await expect(card.getByRole("button", { name: /Move .* up/ }).first()).toBeDisabled();
    await expect(card.getByRole("button", { name: /Move .* down/ }).first()).toBeEnabled();

    await pipelineSelect.focus();
    await pipelineSelect.press("ArrowDown");
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(listbox.getByRole("option", { name: "Enterprise", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(card.getByRole("heading", { name: "Enterprise" })).toBeVisible();

    await pipelineSelect.click();
    await expect(listbox).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(listbox).toBeHidden();
    await expect(pipelineSelect).toBeFocused();
  });

  test("constrains long mobile options and keeps stage type read-only", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await mockPipelineApi(page, { longPipelineName: true });
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Pipelines" });
    const pipelineSelect = card.getByRole("combobox", { name: "Select pipeline" });
    await pipelineSelect.click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const popupBox = await listbox.boundingBox();
    expect(popupBox).not.toBeNull();
    expect(popupBox!.x).toBeGreaterThanOrEqual(0);
    expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(320);
    await page.keyboard.press("Escape");

    await card.getByRole("button", { name: "Add stage" }).click();
    const dialog = page.getByRole("dialog", { name: "Add stage" });
    const stageName = dialog.getByLabel("Stage name");
    await stageName.fill("Evaluation");
    await expect(dialog.getByRole("combobox", { name: "Type" })).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(stageName).toHaveValue("Evaluation");
  });
});

import { test, expect } from "@playwright/test";
import { dropCard } from "./helpers/drag";

/**
 * Once an admin names a lost-reason field, dropping a deal on a lost stage asks
 * for the reason before anything is saved (Phase 5). The setting is put back
 * afterwards so other kanban specs drag freely.
 */
test("closing a deal as lost on the board asks for the lost reason", async ({ page }) => {
  const stamp = Date.now();
  const key = `e2e_loss_${stamp}`;
  const field = await page.request.post("/api/custom-fields", {
    data: { entity: "deal", key, label: "E2E loss reason", type: "select", options: ["Price", "Competitor"] },
  });
  expect(field.status()).toBe(201);
  expect((await page.request.patch("/api/settings/reporting", { data: { lostReasonField: key } })).ok()).toBeTruthy();
  try {
    const { pipelines } = (await (await page.request.get("/api/pipelines")).json()) as {
      pipelines: { id: string; isDefault: number; stages: { id: string; type: string }[] }[];
    };
    const pipeline = pipelines.find((p) => p.isDefault === 1) ?? pipelines[0];
    const lost = pipeline.stages.find((s) => s.type === "lost")!;
    const created = await page.request.post("/api/deals", { data: { name: `Lost reason ${stamp}`, pipelineId: pipeline.id } });
    const dealId = ((await created.json()) as { deal: { id: string } }).deal.id;

    await page.goto("/deals");
    const card = page.locator(`[data-testid="deal-card"][data-deal-id="${dealId}"]`);
    const lostColumn = page.locator(`[data-testid="stage-column"][data-stage-id="${lost.id}"]`);
    await dropCard(page, card, lostColumn);

    const dialog = page.getByRole("dialog", { name: "Why is this deal lost?" });
    await expect(dialog).toBeVisible();
    await expect(lostColumn.locator(`[data-deal-id="${dealId}"]`)).toHaveCount(0);

    await dialog.getByRole("combobox", { name: "E2E loss reason" }).selectOption("Competitor");
    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/deals/${dealId}`) && r.request().method() === "PATCH"),
      dialog.getByRole("button", { name: "Close as lost" }).click(),
    ]);
    expect(saved.ok()).toBeTruthy();
    await expect(lostColumn.locator(`[data-deal-id="${dealId}"]`)).toBeVisible();
  } finally {
    await page.request.patch("/api/settings/reporting", { data: { lostReasonField: null } });
  }
});

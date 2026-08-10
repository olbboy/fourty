import { test, expect, type Page } from "@playwright/test";
import { dragCardToColumn } from "./helpers/drag";

/**
 * The two pieces of motion this product actually promises, held to their word.
 *
 * Both are invisible to every other suite. `kanban.spec.ts` asserts the board's
 * data after a drop and passes whether the card travelled or teleported; nothing
 * at all looks at what happens under `prefers-reduced-motion`, which is how a
 * blanket `animation-iteration-count: 1` came to freeze the loading spinner into
 * a static half-circle without a single test noticing. A frozen spinner is not a
 * cosmetic defect: it is the only signal that a request is still in flight, and
 * stopped it reads as a stuck app.
 *
 * So these assert the mechanism, not the pixels — that a transition is started,
 * that it is *not* started when the user asked for less motion, and that the
 * spinner is the one animation exempt from the freeze.
 */

/** Count the View Transitions the page starts from here on. */
async function watchTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __vt: number };
    w.__vt = 0;
    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    if (typeof doc.startViewTransition !== "function") return;
    const original = doc.startViewTransition.bind(doc);
    doc.startViewTransition = (callback: () => void) => {
      w.__vt++;
      return original(callback);
    };
  });
}

const transitionCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vt: number }).__vt);

/** The first card on the board, and a stage column that is not its own. */
async function pickMove(page: Page) {
  const dealId = await page.getByTestId("deal-card").first().getAttribute("data-deal-id");
  expect(dealId).toBeTruthy();

  const sourceStageId = await page
    .locator('[data-testid="stage-column"]', {
      has: page.locator(`[data-deal-id="${dealId}"]`),
    })
    .getAttribute("data-stage-id");
  const stageIds = await page
    .getByTestId("stage-column")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-stage-id")));
  const targetStageId = stageIds.find((id) => id && id !== sourceStageId);
  expect(targetStageId).toBeTruthy();

  return {
    dealId,
    card: page.locator(`[data-testid="deal-card"][data-deal-id="${dealId}"]`),
    target: page.locator(`[data-testid="stage-column"][data-stage-id="${targetStageId}"]`),
  };
}

test("every board card claims a transition name of its own", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByTestId("deal-card").first()).toBeVisible();

  const names = await page
    .getByTestId("deal-card")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).viewTransitionName));

  expect(names.length).toBeGreaterThan(1);
  // The `deal-` prefix is load-bearing: an id may open with a digit, and a bare
  // CSS custom-ident may not.
  expect(names.every((n) => /^deal-[A-Za-z0-9]+$/.test(n))).toBe(true);
  // Two elements sharing a name abort the whole transition.
  expect(new Set(names).size).toBe(names.length);
});

test("moving a deal to another stage runs through a View Transition", async ({ page }) => {
  await page.goto("/deals");
  await expect(page.getByTestId("deal-card").first()).toBeVisible();

  const supported = await page.evaluate(
    () => typeof (document as { startViewTransition?: unknown }).startViewTransition === "function",
  );
  expect(supported, "this browser has no View Transition API to exercise").toBe(true);

  await watchTransitions(page);
  const { card, target, dealId } = await pickMove(page);
  const response = await dragCardToColumn(page, card, target);

  expect(response.ok()).toBeTruthy();
  expect(await transitionCount(page)).toBe(1);
  await expect(target.locator(`[data-deal-id="${dealId}"]`)).toBeVisible();
});

test.describe("when the user asks for less motion", () => {
  test("the spinner keeps turning while everything else freezes", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/deals");

    // Measured on elements built here rather than on a spinner the app rendered:
    // a real one only exists while a request is in flight, which is too short a
    // window to catch reliably. What is under test is the CSS rule, and these
    // carry the same class and attribute the component does.
    const probe = await page.evaluate(() => {
      const measure = (slot: string | null) => {
        const el = document.createElement("div");
        el.className = "animate-spin";
        if (slot) el.setAttribute("data-slot", slot);
        document.body.appendChild(el);
        const style = getComputedStyle(el);
        const measured = {
          duration: style.animationDuration,
          iterations: style.animationIterationCount,
        };
        el.remove();
        return measured;
      };
      return { spinner: measure("spinner"), everythingElse: measure(null) };
    });

    expect(probe.spinner).toEqual({ duration: "1.6s", iterations: "infinite" });
    expect(probe.everythingElse).toEqual({ duration: "0.001s", iterations: "1" });
  });

  test("moving a deal skips the View Transition and lands anyway", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/deals");
    await expect(page.getByTestId("deal-card").first()).toBeVisible();

    await watchTransitions(page);
    const { card, target, dealId } = await pickMove(page);
    const response = await dragCardToColumn(page, card, target);

    expect(response.ok()).toBeTruthy();
    expect(await transitionCount(page)).toBe(0);
    await expect(target.locator(`[data-deal-id="${dealId}"]`)).toBeVisible();
  });
});

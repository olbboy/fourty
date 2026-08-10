import { expect, type Page } from "@playwright/test";

/**
 * The checks every view has to survive, run in the browser against the real DOM.
 *
 * These exist because a design pass migrated every control in the app onto the
 * component layer and a workflow row silently became a vertical stack: unit
 * tests, e2e and the production build all went green over a visibly broken page.
 * Nothing here asserts what a view looks like — only that it has not fallen into
 * one of the three failure modes that produce no error of any kind.
 */
export type ViewProblem = { kind: string; detail: string };

export async function findViewProblems(page: Page): Promise<ViewProblem[]> {
  return page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const describe = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className : "";
      return `${el.tagName.toLowerCase()} ${cls.slice(0, 100)}`.trim();
    };

    // 1. The page scrolls sideways. Always a layout that escaped its column.
    if (document.documentElement.scrollWidth > window.innerWidth + 1) {
      out.push({
        kind: "horizontal-overflow",
        detail: `scrollWidth ${document.documentElement.scrollWidth} exceeds viewport ${window.innerWidth}`,
      });
    }

    // 2. A flex column that is also told to wrap. Wrapping a column only means
    //    something inside a bounded height, which no view here has — so the
    //    pair is the fingerprint of a row whose `flex-col` was never cancelled.
    //    A caller cannot cancel it: `flex-row` is the only class in that group,
    //    so a component shipping `flex-col` in its base wins every merge.
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (!cs.display.includes("flex")) continue;
      if (cs.flexDirection === "column" && cs.flexWrap === "wrap") {
        out.push({ kind: "row-became-column", detail: describe(el) });
      }
    }

    // 3. A visible control with nothing to announce. Icons here are decorative
    //    and hidden from assistive tech, so an icon-only button with no label is
    //    a control a screen-reader user cannot identify.
    for (const el of document.querySelectorAll<HTMLElement>(
      'button, [role="button"], input[type="checkbox"]',
    )) {
      if (el.closest('[aria-hidden="true"], [hidden]')) continue;
      if (el.offsetParent === null) continue;
      const labels = (el as HTMLInputElement).labels;
      const named =
        (el.textContent ?? "").trim() ||
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.getAttribute("aria-labelledby") ||
        (labels && labels.length ? "label-for" : "") ||
        (el.closest("label")?.textContent ?? "").trim();
      if (!named) out.push({ kind: "unnamed-control", detail: describe(el) });
    }
    return out;
  });
}

/** Fail with the offending elements listed, not just a count. */
export async function expectHealthyView(page: Page): Promise<void> {
  const problems = await findViewProblems(page);
  expect(
    problems.map((p) => `${p.kind}: ${p.detail}`),
    "this view is in one of the states that produces no error anywhere else",
  ).toEqual([]);
}

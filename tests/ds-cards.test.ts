import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";

/**
 * Renders every design-system card that is not a component preview.
 *
 * The converter's own render check covers `components/**`. It does not cover the
 * two card families this repo adds, and they fail differently:
 *
 *   guidelines/  paint themselves from `var(--token)`, so they cannot show a
 *                wrong VALUE — but a renamed token leaves a swatch blank.
 *   screens/     CALL component APIs. When a component changes shape, a screen
 *                renders wrong or throws, and nothing else in the repo notices.
 *
 * The bundle is build output, so this skips when it is absent — a fresh clone
 * has no ds-bundle until `design-sync` runs. It is a drift guard for whoever
 * builds, not a gate on the app's own test run.
 */
const BUNDLE = path.join(process.cwd(), "ds-bundle");
const HAS_BUNDLE = existsSync(path.join(BUNDLE, "_ds_bundle.js"));

const cardsIn = (dir: string) =>
  existsSync(path.join(BUNDLE, dir))
    ? readdirSync(path.join(BUNDLE, dir))
        .filter((f) => f.endsWith(".html"))
        .map((f) => `${dir}/${f}`)
    : [];

const CARDS = HAS_BUNDLE ? [...cardsIn("screens"), ...cardsIn("guidelines")] : [];

describe.skipIf(!HAS_BUNDLE)("design-system cards render", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it("finds cards to check", () => {
    expect(CARDS.length).toBeGreaterThan(0);
  });

  it.each(CARDS)("%s", async (card) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(`file://${path.join(BUNDLE, card)}`, { waitUntil: "networkidle" });
    // React mounts in a microtask after load; give the commit a frame.
    await page.waitForTimeout(400);

    const body = await page.evaluate(() => document.body.innerText.trim());
    await page.close();

    expect(errors, `${card} logged errors`).toEqual([]);
    // The card writes its own mount failure as the only body text, prefixed
    // with a warning sign. Matching at the START matters: a legitimate card
    // heading ("⚠️ Stale deals") contains the same character.
    expect(/^⚠/.test(body), `${card} failed to mount: ${body.slice(0, 120)}`).toBe(false);
    // Low on purpose: a legitimate swatch card can be three words. This is a
    // blank-page check, not a richness check — the screenshots are for richness.
    expect(body.length, `${card} rendered almost nothing`).toBeGreaterThan(10);
  }, 45_000);
});

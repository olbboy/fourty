/**
 * Compile the screen compositions in .design-sync/screens/ into cards under
 * ds-bundle/screens/.
 *
 *   npm run build:ds-screens        # after the design-sync converter has run
 *
 * WHY SCREENS AT ALL. Component cards teach a design agent what a Button is.
 * They do not teach it what a page looks like — where the header sits, how a
 * KPI row relates to the cards under it, how dense a table should be. These are
 * the compositions that answer that, built from the real exported components so
 * the layout an agent copies is one that compiles.
 *
 * WHY THIS SHAPE. It reuses the mechanism the converter already proved: React
 * from the vendored copies, components from window.Fourty, the screen compiled
 * to the same `__dsPreview` global a component preview uses. No CDN, no Babel
 * in the browser — a card that needs the network is a card that breaks.
 *
 * The screens are checked by tests/ds-screen-cards.test.ts, which renders each
 * one headlessly. Unlike the foundation swatches (which paint themselves from
 * `var(--token)` and cannot go stale) a screen CALLS component APIs — so when a
 * component changes shape, a screen can silently render wrong. The test is what
 * makes that loud.
 */
import { build } from "esbuild";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), ".design-sync", "screens");
const OUT = path.join(process.cwd(), "ds-bundle", "screens");

/** Card titles and framing, keyed by file name. */
const META: Record<string, { name: string; subtitle: string; viewport: string }> = {
  login: { name: "Login", subtitle: "The lockup carries the name; one card, one action", viewport: "1200x760" },
  dashboard: { name: "Dashboard", subtitle: "KPI row, two charts, three list panels", viewport: "1440x900" },
  "deals-kanban": { name: "Deals — kanban", subtitle: "Stage columns with totals and draggable cards", viewport: "1440x900" },
  "deals-list": { name: "Deals — list", subtitle: "The same records as a dense table", viewport: "1440x760" },
  contacts: { name: "Contacts", subtitle: "Table with avatar, status and score", viewport: "1440x760" },
  "contact-detail": { name: "Contact detail", subtitle: "Record page: details, timeline, related", viewport: "1440x900" },
  settings: { name: "Settings", subtitle: "Form rows, switches and a members table", viewport: "1440x820" },
  overlays: { name: "Command palette in situ", subtitle: "An overlay over the page it was opened from", viewport: "1440x900" },
};

const card = (slug: string) => {
  const m = META[slug] ?? { name: slug, subtitle: "", viewport: "1440x900" };
  return `<!-- @dsCard group="Screens" name="${m.name}" subtitle="${m.subtitle}" viewport="${m.viewport}" -->
<!doctype html>
<html><head><meta charset="utf-8">
  <link rel="stylesheet" href="../styles.css">
  <link rel="stylesheet" href="../_ds_bundle.css">
  <style>html,body{margin:0;height:100%}body{background:var(--bg)}</style>
</head><body>
  <div id="root"></div>
  <script src="../_vendor/react.js"></script>
  <script src="../_vendor/react-dom.js"></script>
  <script src="../_ds_bundle.js"></script>
  <script src="./${slug}.js"></script>
  <script>
    var S = (window.__dsPreview && window.__dsPreview.Screen) || null;
    var el = document.getElementById('root');
    if (!S) { el.textContent = '⚠ ${slug}.js exported no Screen'; }
    else {
      try { ReactDOM.createRoot(el).render(React.createElement(S)); }
      catch (e) { el.textContent = '⚠ ' + (e && e.message || e); }
    }
  </script>
</body></html>
`;
};

const slugs = readdirSync(SRC)
  .filter((f) => f.endsWith(".tsx") && !f.startsWith("_"))
  .map((f) => f.replace(/\.tsx$/, ""));

async function main() {
  mkdirSync(OUT, { recursive: true });

  for (const slug of slugs) {
    await build({
      entryPoints: [path.join(SRC, `${slug}.tsx`)],
      outfile: path.join(OUT, `${slug}.js`),
      bundle: true,
      format: "iife",
      globalName: "__dsPreview",
      jsx: "transform",
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      // React and the design system are already on the page as globals; the
      // screen must not carry a second copy of either.
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "warning",
    });
    writeFileSync(path.join(OUT, `${slug}.html`), card(slug));
  }

  console.log(`screens: ${slugs.length} card(s) → ${path.relative(process.cwd(), OUT)}`);
}

main();

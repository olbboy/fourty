import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { Modal, Field } from "@/components/ui";
import { IconDashboard } from "@/components/icons";
import { SavedViewsBar } from "@/components/saved-views";
import { SsoSection } from "@/app/(app)/settings/sections/sso";
import { MailboxSection } from "@/app/(app)/settings/sections/mailbox";

/**
 * Accessibility guarantees (Gate C5). Two layers: render the reusable primitives
 * and assert the real a11y attributes appear in the markup, and source-scan the
 * router-bound components (shell, command palette) whose rendering needs a Next
 * router context. Locks the a11y contract against regressions.
 */
function src(rel: string): string {
  return readFileSync(path.resolve(__dirname, "..", rel), "utf8");
}

describe("rendered a11y attributes", () => {
  it("Field wraps its control in a <label> (implicit association)", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { label: "Email", children: createElement("input", { type: "email" }) }),
    );
    expect(html).toContain("<label");
    expect(html).toContain("Email");
    expect(html).toContain("<input");
  });

  it("Modal is a labelled modal dialog", () => {
    const html = renderToStaticMarkup(
      createElement(Modal, { title: "New contact", open: true, onClose: () => {}, children: "body" }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby");
  });

  it("decorative icons are hidden from assistive tech", () => {
    const html = renderToStaticMarkup(createElement(IconDashboard, {}));
    expect(html).toContain('aria-hidden="true"');
  });

  it("saved-views bar is a toolbar with toggle buttons", () => {
    const html = renderToStaticMarkup(
      createElement(SavedViewsBar, {
        entity: "contacts",
        current: {},
        activeId: null,
        onApply: () => {},
      }),
    );
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("aria-pressed");
  });
});

/**
 * The settings panels for SSO and mailboxes are the only screens driving those
 * two features, and no end-to-end spec visits /settings — so without this a crash
 * on render would reach a release with a green suite behind it. Rendering to
 * static markup runs no effects, so neither panel fetches; both show their
 * loading state, which is exactly the first frame a user sees.
 */
describe("settings panels render", () => {
  it("the SSO panel renders while its providers are still loading", () => {
    const html = renderToStaticMarkup(createElement(SsoSection));
    expect(html).toContain("Single sign-on");
    expect(html).toContain("Add provider");
  });

  it("the mailbox panel renders while its accounts are still loading", () => {
    const html = renderToStaticMarkup(createElement(MailboxSection));
    expect(html).toContain("Mailboxes");
    expect(html).toContain("Add mailbox");
  });
});

/**
 * Every form control must end up with an accessible name.
 *
 * This is a source scan, so it can only see the shapes it knows: an aria-label
 * or aria-labelledby on the tag, a wrapping <Field> or <label>, or an id some
 * htmlFor in the same file points at. A control named some other way would be
 * reported here as a false positive — fix that by teaching this check, not by
 * silencing it. A placeholder does not count: it is a fallback name at best,
 * disappears the moment anything is typed, and several of these controls had
 * nothing else.
 *
 * A regex cannot find where a JSX tag ends — `onChange={(e) => ...}` puts a `>`
 * inside a brace expression — so the attributes are read with a depth-aware walk.
 * Getting that wrong is silent: the scan sees truncated attributes and calls a
 * labelled control unlabelled, or worse, misses one entirely.
 */
describe("every form control has an accessible name", () => {
  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
      else if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  /** Attributes of the tag whose `<` is at `start`, honouring braces and quotes. */
  function readTagAttrs(source: string, start: number): string {
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) return source.slice(start, i);
    }
    return source.slice(start);
  }

  function unnamedControls(file: string): string[] {
    const source = readFileSync(file, "utf8");
    const labelledIds = new Set(
      [...source.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]),
    );
    const found: string[] = [];

    for (const m of source.matchAll(/<(input|textarea|select)\b/g)) {
      const attrs = readTagAttrs(source, m.index + m[1].length + 1);
      if (/type="hidden"/.test(attrs)) continue;

      const before = source.slice(0, m.index);
      const openCount = (open: RegExp, close: RegExp) =>
        (before.match(open) ?? []).length - (before.match(close) ?? []).length;

      const id = attrs.match(/\bid="([^"]+)"/)?.[1];
      const named =
        /\baria-label\b|\baria-labelledby\b|\btitle=/.test(attrs) ||
        openCount(/<Field\b/g, /<\/Field>/g) > 0 ||
        openCount(/<label\b/g, /<\/label>/g) > 0 ||
        (id !== undefined && labelledIds.has(id));

      if (!named) {
        const line = before.split("\n").length;
        found.push(`${path.relative(path.resolve(__dirname, ".."), file)}:${line} <${m[1]}>`);
      }
    }
    return found;
  }

  it("names every input, textarea and select in the app", () => {
    const unnamed = tsxFiles(path.resolve(__dirname, "../src")).flatMap(unnamedControls);
    expect(unnamed, `form controls with no accessible name:\n${unnamed.join("\n")}`).toEqual([]);
  });
});

describe("source-level a11y contract (router-bound components)", () => {
  it("shell has a skip link, nav landmarks, and aria-current", () => {
    const shell = src("src/components/shell.tsx");
    expect(shell).toContain("Skip to content");
    expect(shell).toContain('href="#main"');
    expect(shell).toContain('id="main"');
    expect(shell).toContain('aria-label="Main"');
    expect(shell).toContain("aria-current");
  });

  it("command palette exposes combobox + listbox semantics", () => {
    const palette = src("src/components/command-palette.tsx");
    expect(palette).toContain('role="dialog"');
    expect(palette).toContain('role="combobox"');
    expect(palette).toContain('role="listbox"');
    expect(palette).toContain('role="option"');
    expect(palette).toContain("aria-activedescendant");
    expect(palette).toContain("aria-selected");
  });
});

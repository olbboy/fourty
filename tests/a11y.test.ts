import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Drawer, Modal, Field } from "@/components/ui";
import { IconDashboard } from "@/components/icons";
import { SavedViewsBar } from "@/components/saved-views";

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
    expect(html).toContain('tabindex="-1"');
  });

  it("Drawer is a labelled modal dialog with a close control", () => {
    const html = renderToStaticMarkup(
      createElement(Drawer, { title: "Company preview", open: true, onClose: () => {}, children: "body" }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("aria-labelledby");
    expect(html).toContain('aria-label="Close"');
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

describe("source-level a11y contract (router-bound components)", () => {
  it("shell has a skip link, nav landmarks, and aria-current", () => {
    const shell = src("src/components/shell.tsx");
    expect(shell).toContain("Skip to content");
    expect(shell).toContain('href="#main"');
    expect(shell).toContain('id="main"');
    expect(shell).toContain('aria-label="Main"');
    expect(shell).toContain("aria-current");
    expect(shell).toContain('role="separator"');
    expect(shell).toContain("SIDEBAR_MIN");
    expect(shell).toContain("fourty-sidebar-width");
    expect(shell).toContain("data-dialog-focus-fallback");
    expect(shell).toContain('a11y.sidebarResize');
  });

  it("command palette exposes combobox + listbox semantics", () => {
    const palette = src("src/components/command-palette.tsx");
    expect(palette).toContain('role="dialog"');
    expect(palette).toContain('role="combobox"');
    expect(palette).toContain('role="listbox"');
    expect(palette).toContain('role="option"');
    expect(palette).toContain("aria-activedescendant");
    expect(palette).toContain("aria-selected");
    expect(palette).toContain('role="group"');
    expect(palette).toContain("cmdk-badge");
    expect(palette).toContain("requestIdRef");
    expect(palette).toContain('role="alert"');
    expect(palette).toContain("useT");
    expect(palette).toContain("cmdk.group.records");
    expect(palette).toContain("cmdk.type.contact");
    expect(palette).toContain("cmdk.search.loading");
    expect(palette).toContain("cmdk.search.error");
    expect(palette).toContain('t("action.retry")');
    expect(palette).toContain("event.target !== inputRef.current");
  });

  it("shared dialog focus scope traps the top surface and has a safe fallback", () => {
    const ui = src("src/components/ui.tsx");
    expect(ui).toContain("dialogStack");
    expect(ui).toContain('event.key !== "Tab"');
    expect(ui).toContain("restoreFocus(trigger)");
    expect(ui).toContain("data-dialog-focus-fallback");
    expect(ui).toContain("getClientRects");
    expect(ui).toContain("getComputedStyle");
    expect(ui).toContain("element.tabIndex >= 0");
  });
});

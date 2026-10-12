import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");
}

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing CSS block: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

function customProperties(block: string): Set<string> {
  return new Set(Array.from(block.matchAll(/(--[a-z0-9-]+)\s*:/gi), (match) => match[1]));
}

function render(component: unknown, props: Record<string, unknown>, children?: React.ReactNode) {
  expect(typeof component).toBe("function");
  return renderToStaticMarkup(
    createElement(component as ComponentType<Record<string, unknown>>, props, children),
  );
}

describe("semantic design tokens", () => {
  const css = source("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const light = customProperties(cssBlock(css, ":root"));
  const dark = customProperties(cssBlock(css, ".dark"));

  it.each([
    "--bg",
    "--surface",
    "--surface-2",
    "--border",
    "--text",
    "--text-muted",
  ])("defines %s in both light and dark themes", (token) => {
    expect(light.has(token), `${token} is missing from :root`).toBe(true);
    expect(dark.has(token), `${token} is missing from .dark`).toBe(true);
  });

  it("bridges the app palette into Base UI's shadcn utility vocabulary", () => {
    const theme = cssBlock(css, "@theme inline");
    for (const token of [
      "bg",
      "surface",
      "surface-2",
      "line",
      "ink",
      "ink-muted",
      "background",
      "foreground",
      "primary",
      "primary-foreground",
      "border",
      "ring",
    ]) {
      expect(theme).toMatch(new RegExp(`--color-${token}\\s*:`));
    }
  });

  it("provides reusable radius and motion values", () => {
    for (const token of [
      "--radius",
      "--duration-fast",
      "--duration-base",
      "--duration-enter",
      "--ease-out",
      "--ease-out-expo",
      "--ease-in-out",
    ]) {
      expect(css, `${token} is missing from globals.css`).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("keeps a 44px coarse-pointer target and the reduced-motion override", () => {
    const coarsePointer = css.match(/@media\s*\([^)]*pointer\s*:\s*coarse[^)]*\)\s*\{[\s\S]*?min-(?:height|block-size)\s*:\s*(\d+(?:\.\d+)?)px[\s\S]*?\}/i);
    expect(coarsePointer, "Missing coarse-pointer minimum target rule").not.toBeNull();
    expect(Number(coarsePointer?.[1])).toBeGreaterThanOrEqual(44);

    const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(reducedMotionStart, "Missing reduced-motion rule").toBeGreaterThanOrEqual(0);
    const reducedMotion = css.slice(reducedMotionStart);
    expect(reducedMotion).toMatch(/animation-duration\s*:/);
    expect(reducedMotion).toMatch(/transition-duration\s*:/);
    expect(reducedMotion).toMatch(/scroll-behavior\s*:\s*auto/);
  });
});

describe("shared UI render contracts", () => {
  it("Base UI Button defaults to type=button and applies variant and size", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const defaultButton = render(ui.Button, {}, "Save");
    const destructiveButton = render(ui.Button, { variant: "destructive" }, "Delete");
    const compactButton = render(ui.Button, { size: "sm" }, "Compact");

    expect(defaultButton).toContain('type="button"');
    expect(defaultButton).toContain('data-slot="button"');
    expect(destructiveButton).toContain("text-feedback-error");
    expect(compactButton).toContain("h-8");
  });

  it("Button uses Base UI's disabled contract for unavailable actions", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const html = render(ui.Button, { disabled: true }, "Save");
    expect(html).toMatch(/\bdisabled(?:="")?/);
    expect(html).not.toContain('busy="true"');
  });

  it("icon-sized Buttons keep their accessible name and safe default type", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const html = render(
      ui.Button,
      { size: "icon", "aria-label": "Delete Ada Lovelace" },
      "×",
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Delete Ada Lovelace"');
    expect(html).toContain("size-9");
  });

  it("Field associates label, hint, and alerting error with its control", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const html = render(
      ui.Field,
      {
        id: "work-email",
        label: "Work email",
        hint: "Use the address your team recognizes",
        error: "Enter a valid email address",
        required: true,
      },
      createElement("input", { type: "email" }),
    );

    expect(html).toContain('for="work-email"');
    expect(html).toContain('id="work-email"');
    expect(html).toContain('required=""');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain("Use the address your team recognizes");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Enter a valid email address");
  });

  it("AsyncError and Spinner announce async state", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const error = render(
      ui.AsyncError,
      { message: "Could not load contacts", onRetry: () => {} },
    );
    const spinner = render(ui.Spinner, { label: "Loading contacts" });

    expect(error).toContain('role="alert"');
    expect(error).toContain("Could not load contacts");
    expect(error).toContain("<button");
    expect(error).toContain("Retry");
    expect(spinner).toContain('role="status"');
    expect(spinner).toContain("Loading contacts");
  });

  it("LoadError announces both full and compact failures", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const full = render(ui.LoadError, { onRetry: () => {} });
    const compact = render(ui.LoadError, { compact: true, onRetry: () => {} });

    expect(full).toContain('role="alert"');
    expect(compact).toContain('role="alert"');
  });

  it("ContextToolbar keeps page-owned slots behind one labelled toolbar", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const html = render(
      ui.ContextToolbar,
      {
        search: createElement("input", { "aria-label": "Search" }),
        filters: createElement("button", { type: "button" }, "Filter"),
        meta: "12 results",
      },
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Context toolbar"');
    expect(html).toContain('aria-label="Search"');
    expect(html).toContain("Filter");
    expect(html).toContain("12 results");
  });

  it("keeps one Base UI primitive layer without legacy entrypoints", () => {
    for (const relativePath of [
      "src/components/button.tsx",
      "src/components/select.tsx",
      "src/components/dropdown-menu.tsx",
      "src/components/async-state.tsx",
      "src/components/context-toolbar.tsx",
    ]) {
      expect(
        existsSync(path.resolve(__dirname, "..", relativePath)),
        `${relativePath} must not reintroduce a parallel primitive entrypoint`,
      ).toBe(false);
    }

    expect(source("package.json")).not.toContain("@radix-ui/react-");
  });
});

describe("shared dialog behavior", () => {
  it("lets Base UI choose the first tabbable modal target", () => {
    const ui = source("src/components/ui.tsx");
    const modal = ui.slice(ui.indexOf("export function Modal"), ui.indexOf("/**\n * Compatibility wrapper"));

    expect(modal).toContain("<DialogContent");
    expect(modal).not.toContain("requestAnimationFrame");
    expect(modal).not.toContain("contentRef.current?.focus");
  });

  it("AI chat delegates portal and focus behavior to the shared Base UI Sheet", () => {
    const aiChat = source("src/components/ai-chat.tsx");
    expect(aiChat).toMatch(/Sheet[\s\S]*from\s+["']@\/components\/ui\/sheet["']/);
    expect(aiChat).toContain("<Sheet ");
    expect(aiChat).toContain("<SheetContent");
  });
});

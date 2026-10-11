import { readFileSync } from "node:fs";
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
    "--danger",
    "--success",
    "--warning",
    "--info",
    "--surface-raised",
    "--surface-hover",
    "--border-strong",
  ])("defines %s in both light and dark themes", (token) => {
    expect(light.has(token), `${token} is missing from :root`).toBe(true);
    expect(dark.has(token), `${token} is missing from .dark`).toBe(true);
  });

  it("exposes semantic colors to utilities", () => {
    const theme = cssBlock(css, "@theme inline");
    for (const token of [
      "danger",
      "success",
      "warning",
      "info",
      "surface-raised",
      "surface-hover",
      "line-strong",
    ]) {
      expect(theme).toMatch(new RegExp(`--color-${token}\\s*:`));
    }
  });

  it("provides reusable elevation, radius, and motion values", () => {
    for (const token of [
      "--shadow-raised",
      "--radius-control",
      "--radius-surface",
      "--duration-fast",
      "--ease-standard",
    ]) {
      expect(light.has(token), `${token} is missing from :root`).toBe(true);
    }
  });

  it("keeps a 44px coarse-pointer target and the reduced-motion override", () => {
    const coarsePointer = css.match(/@media\s*\([^)]*pointer\s*:\s*coarse[^)]*\)\s*\{[\s\S]*?min-(?:height|block-size)\s*:\s*(\d+(?:\.\d+)?)px[\s\S]*?\}/i);
    expect(coarsePointer, "Missing coarse-pointer minimum target rule").not.toBeNull();
    expect(Number(coarsePointer?.[1])).toBeGreaterThanOrEqual(44);

    const reducedMotion = css.match(
      /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)\s*\{([\s\S]*?)\n\s*\}/i,
    )?.[1];
    expect(reducedMotion).toBeTruthy();
    expect(reducedMotion).toMatch(/animation-duration\s*:/);
    expect(reducedMotion).toMatch(/transition-duration\s*:/);
    expect(reducedMotion).toMatch(/scroll-behavior\s*:\s*auto/);
  });
});

describe("shared UI render contracts", () => {
  it("Button defaults to type=button and applies variant and size", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const defaultButton = render(ui.Button, {}, "Save");
    const dangerButton = render(ui.Button, { variant: "danger" }, "Delete");
    const compactButton = render(ui.Button, { size: "compact" }, "Compact");

    expect(defaultButton).toContain('type="button"');
    expect(dangerButton).not.toBe(render(ui.Button, {}, "Delete"));
    expect(compactButton).not.toBe(render(ui.Button, {}, "Compact"));
  });

  it("Button announces busy state and cannot be activated", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const html = render(ui.Button, { busy: true }, "Save");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
  });

  it("IconButton keeps its accessible label and safe default type", async () => {
    const ui = (await import("@/components/ui")) as Record<string, unknown>;
    const html = render(ui.IconButton, { "aria-label": "Delete Ada Lovelace" }, "×");
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Delete Ada Lovelace"');
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
});

describe("shared dialog behavior", () => {
  it("AI chat uses DialogFocusScope instead of a private focus boundary", () => {
    const aiChat = source("src/components/ai-chat.tsx");
    expect(aiChat).toMatch(/import[\s\S]*DialogFocusScope[\s\S]*from\s+["']\.\/ui["']/);
    expect(aiChat).toMatch(/<DialogFocusScope\b/);
  });
});

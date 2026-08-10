import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * `Button` is Base UI's button primitive, and several controls here are
 * genuinely links wearing a button: a CSV export, the OAuth connect that has to
 * be a real navigation rather than a fetch, the SSO sign-in buttons.
 *
 * Base UI's `nativeButton` says whether the thing being rendered really is a
 * `<button>`. It defaults to true, and leaving it true while rendering an anchor
 * does not merely warn in development — it emits `type="button"` on an `<a>`,
 * where `type` means the MIME type of the linked resource, and it skips the
 * `role` that tells assistive tech what the control does. The dev warning is
 * stripped from a production build; the wrong markup is not.
 *
 * `Button` answers this for its call sites by looking at what it is about to
 * render, so these assertions are on the markup rather than on a console.
 */
describe("Button rendered as something other than a button", () => {
  const anchor = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(
        Button,
        {
          variant: "outline",
          render: createElement("a", { href: "/api/export/companies" }),
          ...props,
        },
        "Export",
      ),
    );

  it("carries the button role and no bogus type", () => {
    const html = anchor();
    expect(html).toContain("<a");
    expect(html).toContain('href="/api/export/companies"');
    expect(html).toContain('role="button"');
    expect(html, '`type` on an anchor is the MIME type of the target, not a button type')
      .not.toContain('type="button"');
  });

  it("still emits a real button when nothing says otherwise", () => {
    const html = renderToStaticMarkup(createElement(Button, {}, "Save"));
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
  });

  it("needs cn() to style a link, or the base border cancels the variant's", () => {
    // A navigation is a real <a> wearing `buttonVariants()`. The base sets
    // `border-transparent` and the outline variant sets `border-border`; both
    // are border-colour, so without tailwind-merge they both survive and which
    // one paints is decided by stylesheet order, not by intent. That shipped
    // once as a bordered control with no border.
    const raw = buttonVariants({ variant: "outline" });
    expect(raw).toContain("border-transparent");
    expect(raw).toContain("border-border");

    const merged = cn(buttonVariants({ variant: "outline" }));
    expect(merged, "cn() must drop the base border colour").not.toContain("border-transparent");
    expect(merged).toContain("border-border");
  });

  it("lets a caller override the inference", () => {
    // The escape hatch has to keep working, and it is also what the defect
    // looked like: an anchor insisting it was a native button.
    const html = anchor({ nativeButton: true });
    expect(html).toContain('type="button"');
    expect(html).not.toContain('role="button"');
  });
});

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreBadge, StatusChip, HealthBadge, PriorityChip, LoadError } from "@/components/ui";
import { LocaleProvider } from "@/lib/i18n/provider";

describe("ScoreBadge / StatusChip omit redacted values", () => {
  it("renders nothing when score is missing", () => {
    expect(renderToStaticMarkup(createElement(ScoreBadge, { score: undefined }))).toBe("");
    expect(renderToStaticMarkup(createElement(ScoreBadge, { score: null }))).toBe("");
  });

  it("renders a 0 score as cold, not as missing", () => {
    const html = renderToStaticMarkup(createElement(ScoreBadge, { score: 0 }));
    expect(html).toContain("cold");
    expect(html).toContain("0");
  });

  it("renders nothing when status is missing", () => {
    expect(renderToStaticMarkup(createElement(StatusChip, { status: undefined }))).toBe("");
    expect(renderToStaticMarkup(createElement(StatusChip, { status: null }))).toBe("");
  });

  it("translates known status and priority at display time", () => {
    const status = renderToStaticMarkup(
      createElement(LocaleProvider, { locale: "vi", children: createElement(StatusChip, { status: "customer" }) }),
    );
    expect(status).toContain("Khách hàng");
    expect(status).not.toContain(">customer<");
    const priority = renderToStaticMarkup(
      createElement(LocaleProvider, { locale: "vi", children: createElement(PriorityChip, { priority: "high" }) }),
    );
    expect(priority).toContain("Cao");
    expect(priority).not.toContain(">high<");
  });

  it("leaves unknown status tokens as written", () => {
    const html = renderToStaticMarkup(createElement(StatusChip, { status: "partner" }));
    expect(html).toContain("partner");
  });
});

describe("HealthBadge", () => {
  it("renders nothing when score is missing", () => {
    expect(renderToStaticMarkup(createElement(HealthBadge, { score: undefined }))).toBe("");
    expect(renderToStaticMarkup(createElement(HealthBadge, { score: null }))).toBe("");
  });

  it("renders a 0 score as stalled, not as missing", () => {
    const html = renderToStaticMarkup(createElement(HealthBadge, { score: 0 }));
    expect(html).toContain("stalled");
    expect(html).toContain("0");
    expect(html).toContain("Health score");
    expect(html).toContain('data-testid="health-badge"');
    expect(html).toContain('data-band="stalled"');
  });

  it("bands with the deal-health labels, not lead hot/warm/cold", () => {
    expect(renderToStaticMarkup(createElement(HealthBadge, { score: 80 }))).toContain("healthy");
    expect(renderToStaticMarkup(createElement(HealthBadge, { score: 50 }))).toContain("at risk");
    expect(renderToStaticMarkup(createElement(HealthBadge, { score: 20 }))).toContain("stalled");
  });

  it("translates health bands at display time", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, { locale: "vi", children: createElement(HealthBadge, { score: 80 }) }),
    );
    expect(html).toContain("khỏe");
    expect(html).toContain("Điểm sức khỏe");
    expect(html).toContain('data-band="healthy"');
    expect(html).not.toContain(">healthy ");
  });
});

describe("LoadError", () => {
  it("names a retry control instead of spinning", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, { locale: "en", children: createElement(LoadError, { onRetry: () => {} }) }),
    );
    expect(html).toContain("Retry");
    expect(html).toContain("couldn’t load");
  });

  it("fits a nested panel without the page-level empty-state hint", () => {
    const html = renderToStaticMarkup(
      createElement(LocaleProvider, {
        locale: "en",
        children: createElement(LoadError, { onRetry: () => {}, compact: true }),
      }),
    );
    expect(html).toContain("Retry");
    expect(html).toContain("couldn’t load");
    expect(html).not.toContain("go back");
  });
});

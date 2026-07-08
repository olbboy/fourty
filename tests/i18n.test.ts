import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/locales/en";
import { LOCALES, SUPPORTED_LOCALES, t, resolveLocale, isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * i18n (Gate C4): every locale must cover exactly the en key set (no missing or
 * extra keys), interpolation works, unknown keys/locales fall back safely, and
 * locale resolution honours cookie → Accept-Language → default in that order.
 */
describe("i18n catalog completeness", () => {
  const enKeys = Object.keys(en).sort();

  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale} defines exactly the en key set`, () => {
      const keys = Object.keys(LOCALES[locale]).sort();
      expect(keys).toEqual(enKeys);
      // No blank translations.
      for (const k of keys) expect((LOCALES[locale] as Record<string, string>)[k].length).toBeGreaterThan(0);
    });
  }
});

describe("t() translation + interpolation", () => {
  it("translates a known key per locale", () => {
    expect(t("en", "nav.contacts")).toBe("Contacts");
    expect(t("vi", "nav.contacts")).toBe("Liên hệ");
  });

  it("interpolates named vars", () => {
    expect(t("en", "greeting.welcome", { name: "Ada" })).toBe("Welcome, Ada");
    expect(t("vi", "greeting.welcome", { name: "Ada" })).toBe("Chào mừng, Ada");
  });

  it("leaves an unmatched placeholder intact", () => {
    // greeting.welcome expects {name}; passing nothing leaves the token.
    expect(t("en", "greeting.welcome")).toBe("Welcome, {name}");
  });
});

describe("resolveLocale precedence", () => {
  it("prefers a valid cookie", () => {
    expect(resolveLocale({ cookie: "vi", acceptLanguage: "en-US" })).toBe("vi");
  });

  it("falls back to Accept-Language when no cookie", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "vi-VN,vi;q=0.9,en;q=0.8" })).toBe("vi");
  });

  it("ignores an unsupported cookie and header, defaulting", () => {
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "fr-FR,de;q=0.9" })).toBe(DEFAULT_LOCALE);
  });

  it("guards isLocale", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("klingon")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

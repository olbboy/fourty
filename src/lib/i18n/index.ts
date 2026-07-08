import { en, type MessageKey } from "./locales/en";
import { vi } from "./locales/vi";

/**
 * Minimal i18n (Gate C4). A locale is a flat key→string catalog; en is the
 * source of truth and the fallback. `t()` interpolates `{var}` placeholders.
 * No runtime dependency — the whole thing is a few maps and a regex.
 */
export const LOCALES = { en, vi } as const;
export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES = Object.keys(LOCALES) as Locale[];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  vi: "Tiếng Việt",
};

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (SUPPORTED_LOCALES as string[]).includes(v);
}

/** Translate `key` in `locale`, falling back to en then the raw key; interpolates {vars}. */
export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = LOCALES[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/** A bound translator for a fixed locale (used by the React provider + server render). */
export function translator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
}

/**
 * Resolve the active locale from an explicit cookie value, else the first
 * supported tag in an Accept-Language header, else the default. Kept pure so it
 * is trivially testable and reusable on both server and edge.
 */
export function resolveLocale(opts: { cookie?: string | null; acceptLanguage?: string | null }): Locale {
  if (isLocale(opts.cookie)) return opts.cookie;
  const header = opts.acceptLanguage ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export const LOCALE_COOKIE = "fourty_locale";
export type { MessageKey };

"use client";

import { createContext, useContext } from "react";
import { DEFAULT_LOCALE, t as translate, type Locale, type MessageKey } from "./index";

/**
 * Locale context (Gate C4). The server layout resolves the locale from the
 * cookie/Accept-Language and passes it in; client components read it via useT().
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Bound translator for the active locale: `const t = useT(); t("nav.contacts")`. */
export function useT() {
  const locale = useContext(LocaleContext);
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

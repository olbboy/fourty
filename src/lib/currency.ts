/**
 * Multi-currency support with built-in reference rates — a gap users
 * repeatedly call out in Twenty. Each workspace picks a Reporting currency and
 * may override any rate in Settings → Reporting (src/lib/reporting.ts); the
 * pure helpers below take those settings as an argument.
 */

export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "SGD",
  "INR",
  "VND",
  "BRL",
  "CNY",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

// Reference rates: 1 unit of currency → USD
export const DEFAULT_RATES_TO_USD: Record<string, number> = {
  USD: 1,
  EUR: 1.09,
  GBP: 1.27,
  JPY: 0.0067,
  AUD: 0.66,
  CAD: 0.73,
  CHF: 1.12,
  SGD: 0.74,
  INR: 0.012,
  VND: 0.000039,
  BRL: 0.18,
  CNY: 0.14,
};

export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number> = DEFAULT_RATES_TO_USD,
): number {
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount; // unknown currency → pass through
  return (amount * fromRate) / toRate;
}

/** Intl tag for the app's UI language; English keeps the long-standing en-US look. */
function intlLocale(locale?: string): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}

export function formatMoney(amount: number | null | undefined, currency?: string | null, locale?: string): string {
  if (amount == null) return "—";
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat(intlLocale(locale), {
      style: "currency",
      currency: code,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}

export function formatCompact(amount: number | null | undefined, currency?: string | null, locale?: string): string {
  if (amount == null) return "—";
  const code = currency || "USD";
  try {
    if (locale === "vi") {
      // Intl's Vietnamese currency style abbreviates (293,9 T ₫); readers say
      // the unit in full, so spell the number and add the symbol ourselves.
      const number = new Intl.NumberFormat("vi-VN", {
        notation: "compact",
        compactDisplay: "long",
        maximumFractionDigits: 1,
      }).format(amount);
      const symbol = new Intl.NumberFormat("vi-VN", { style: "currency", currency: code })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value;
      return `${number}\u00a0${symbol ?? code}`;
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount).toLocaleString()}`;
  }
}

/**
 * A workspace's Reporting currency and its Exchange rate overrides, written as
 * units of each currency per 1 USD (how people quote them: 1 USD = 25,500 VND).
 */
export type ReportingRates = { currency: string; perUsd: Record<string, number> };

export const DEFAULT_REPORTING_RATES: ReportingRates = { currency: "USD", perUsd: {} };

function ratesToUsd(perUsd: Record<string, number>): Record<string, number> {
  const rates = { ...DEFAULT_RATES_TO_USD };
  for (const [code, units] of Object.entries(perUsd)) if (units > 0) rates[code] = 1 / units;
  return rates;
}

/** `amount` of `from` expressed in the Reporting currency. */
export function toReporting(amount: number, from: string, reporting: ReportingRates): number {
  return convert(amount, from || "USD", reporting.currency, ratesToUsd(reporting.perUsd));
}

/** `amount` of `from` in `to`, at the workspace's rates. */
export function convertAt(amount: number, from: string, to: string, reporting: ReportingRates): number {
  return convert(amount, from || "USD", to || "USD", ratesToUsd(reporting.perUsd));
}

/** `amount` of `from` in USD at the workspace's rates (for USD-labelled API fields). */
export function toUsd(amount: number, from: string, reporting: ReportingRates): number {
  return convert(amount, from || "USD", "USD", ratesToUsd(reporting.perUsd));
}

/** Total in the Reporting currency, or null when any amount is absent (field-level hide). */
export function sumInReporting(
  rows: readonly { amount?: number | null; currency?: string | null }[],
  reporting: ReportingRates,
): number | null {
  let total = 0;
  for (const row of rows) {
    if (row.amount == null) return null;
    total += toReporting(row.amount, row.currency || "USD", reporting);
  }
  return total;
}

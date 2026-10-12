/**
 * Multi-currency support with built-in reference rates — a gap users
 * repeatedly call out in Twenty. Rates can be overridden in Settings
 * (stored in the `settings` table under "fx_rates") or via env.
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

export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null) return "—";
  const code = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}

export function formatCompact(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null) return "—";
  const code = currency || "USD";
  try {
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

/** USD total, or null when any amount is absent (field-level hide). */
export function sumUsd(
  rows: readonly { amount?: number | null; currency?: string | null }[],
): number | null {
  let total = 0;
  for (const row of rows) {
    if (row.amount == null) return null;
    total += convert(row.amount, row.currency || "USD", "USD");
  }
  return total;
}

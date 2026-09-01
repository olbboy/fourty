import { DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n";

/** Client-safe formatting helpers. */

export function timeAgo(
  ts: number | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
  now = Date.now(),
): string {
  if (!ts) return "—";
  const t = translator(locale);
  const diff = now - ts;
  const abs = Math.abs(diff);
  const future = diff < 0;
  const min = Math.round(abs / 60_000);
  if (min < 1) return t("time.justNow");
  if (min < 60) return t(future ? "time.minutesIn" : "time.minutesAgo", { n: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t(future ? "time.hoursIn" : "time.hoursAgo", { n: hr });
  const d = Math.round(hr / 24);
  if (d < 30) return t(future ? "time.daysIn" : "time.daysAgo", { n: d });
  const mo = Math.round(d / 30);
  if (mo < 12) return t(future ? "time.monthsIn" : "time.monthsAgo", { n: mo });
  const y = Math.round(mo / 12);
  return t(future ? "time.yearsIn" : "time.yearsAgo", { n: y });
}

const DATE_TAGS: Record<Locale, string> = { en: "en-US", vi: "vi-VN" };

export function formatDate(ts: number | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(DATE_TAGS[locale] ?? "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function toDateInputValue(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fromDateInputValue(v: string): number | null {
  if (!v) return null;
  const ts = new Date(`${v}T12:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

/** Join visible name parts. Skips omitted (redacted) fields; empty → "—". */
export function displayName(...parts: Array<string | null | undefined>): string {
  const s = parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" ").trim();
  return s || "—";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

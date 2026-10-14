"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/provider";

type Quote = {
  number: string;
  issuedAt: number;
  validUntil: number;
  currency: string;
  total: number;
  terms: string | null;
  deal: string;
  buyer: { company: string | null; contact: string | null; email: string | null };
  seller: { workspace: string; by: string | null; email: string | null };
  lines: { name: string; quantity: number; unitPrice: number; total: number }[];
};

export function QuoteSheet({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/quotes/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((body: { quote: Quote }) => setQuote(body.quote))
      .catch(() => setFailed(true));
  }, [id]);

  if (failed) return <p className="p-8 text-sm text-feedback-error">{t("quote.notFound")}</p>;
  if (!quote) return null;
  const money = (n: number) => formatMoney(n, quote.currency, locale);

  return (
    <main className="mx-auto max-w-3xl bg-surface p-8 text-sm text-ink print:p-0">
      <div className="mb-6 flex justify-end gap-2 print:hidden">
        <Button onClick={() => window.print()}>{t("quote.print")}</Button>
      </div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold">{quote.seller.workspace}</p>
          {quote.seller.by && (
            <p className="text-ink-muted">
              {quote.seller.by}
              {quote.seller.email && ` · ${quote.seller.email}`}
            </p>
          )}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold tracking-tight">{t("quote.heading")}</h1>
          <p className="font-medium">{quote.number}</p>
          <p className="text-ink-muted">{t("quote.issued", { date: formatDate(quote.issuedAt, locale) })}</p>
          <p className="text-ink-muted">{t("quote.validUntil", { date: formatDate(quote.validUntil, locale) })}</p>
        </div>
      </header>
      <section className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("quote.to")}</p>
        <p className="font-medium">{quote.buyer.company ?? quote.buyer.contact ?? "—"}</p>
        {quote.buyer.company && quote.buyer.contact && <p>{quote.buyer.contact}</p>}
        {quote.buyer.email && <p className="text-ink-muted">{quote.buyer.email}</p>}
        <p className="mt-2 text-ink-muted">{t("quote.for", { deal: quote.deal })}</p>
      </section>
      <table className="mb-6 w-full border-collapse">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
            <th className="py-2">{t("quote.item")}</th>
            <th className="py-2 text-right">{t("quote.quantity")}</th>
            <th className="py-2 text-right">{t("quote.unitPrice")}</th>
            <th className="py-2 text-right">{t("quote.lineTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((line, i) => (
            <tr key={i} className="border-b border-line/60">
              <td className="py-2">{line.name}</td>
              <td className="py-2 text-right tabular-nums">{line.quantity}</td>
              <td className="py-2 text-right tabular-nums">{money(line.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{money(line.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 text-right font-semibold">
              {t("quote.total")}
            </td>
            <td className="pt-3 text-right text-base font-bold tabular-nums">{money(quote.total)}</td>
          </tr>
        </tfoot>
      </table>
      {quote.terms && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("quote.terms")}</p>
          <p className="whitespace-pre-line">{quote.terms}</p>
        </section>
      )}
    </main>
  );
}

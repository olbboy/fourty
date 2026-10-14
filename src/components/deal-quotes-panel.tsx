"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/provider";

type QuoteSummary = { id: string; number: string; issuedAt: number; validUntil: number; currency: string; total: number };

/**
 * A deal's Quotes (D16): each opens as a printable page; a new one is made
 * from the deal's line items as they are now.
 */
export function DealQuotesPanel({ dealId, hasLines, canCreate, onCreated }: { dealId: string; hasLines: boolean; canCreate: boolean; onCreated?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("30");
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals/${dealId}/quotes`).catch(() => null);
    setQuotes(res?.ok ? ((await res.json()) as { quotes: QuoteSummary[] }).quotes : []);
  }, [dealId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/deals/${dealId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validDays: Number(days) || 30, ...(terms.trim() ? { terms: terms.trim() } : {}) }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(((res ? await res.json().catch(() => ({})) : {}) as { error?: string }).error ?? t("quote.failed"));
      return;
    }
    const { quote } = (await res.json()) as { quote: QuoteSummary };
    setOpen(false);
    setTerms("");
    await load();
    onCreated?.();
    window.open(`/quote/${quote.id}`, "_blank", "noopener");
  }

  if (!quotes) return null;
  return (
    <div className="space-y-2">
      {quotes.length === 0 ? (
        <p className="text-sm text-ink-muted">{hasLines ? t("quote.none") : t("quote.needLines")}</p>
      ) : (
        <ul className="space-y-1.5">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-center gap-2 text-sm">
              <a href={`/quote/${q.id}`} target="_blank" rel="noopener" className="font-medium text-accent-700 hover:underline dark:text-accent-400">
                {q.number}
              </a>
              <span className="text-xs text-ink-muted">{formatDate(q.issuedAt, locale)}</span>
              <span className="ml-auto tabular-nums">{formatMoney(q.total, q.currency, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      {canCreate &&
        (open ? (
          <form className="space-y-2" onSubmit={create}>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-label={t("quote.validDaysAria")}
              className="h-8 w-28"
            />
            <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} aria-label={t("quote.termsAria")} placeholder={t("quote.termsPlaceholder")} rows={2} maxLength={4000} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t("action.cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {t("quote.make")}
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="outline" disabled={!hasLines} onClick={() => setOpen(true)}>
            {t("quote.new")}
          </Button>
        ))}
      {error && (
        <p role="alert" className="text-xs text-feedback-error">
          {error}
        </p>
      )}
    </div>
  );
}

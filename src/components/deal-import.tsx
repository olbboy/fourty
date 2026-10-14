"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/provider";

type Row = {
  line: number;
  name: string;
  amount: number | null;
  currency: string;
  stage: string | null;
  owner: string | null;
  company: string | null;
  newCompany: boolean;
  contact: string | null;
  expectedCloseDate: number | null;
  error?: string;
};
type Preview = { rows: Row[]; valid: number; invalid: number; companiesToCreate: number };

/**
 * Deals from a CSV (D14): the file is read first and every row shown as it
 * would be stored, with what is wrong; only a file with no wrong row imports,
 * all of it at once.
 */
export function DealImport() {
  const t = useT();
  const locale = useLocale();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; companiesCreated: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string, dryRun: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/import/deals${dryRun ? "?dryRun=1" : ""}`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: text,
    }).catch(() => null);
    setBusy(false);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError((body as { error?: string }).error ?? t("page.import.failed"));
      return;
    }
    if (dryRun) setPreview(body as Preview);
    else {
      setDone(body as { created: number; companiesCreated: number });
      setPreview(null);
      setCsv(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card size="flush" className="p-4">
        <label className="flex cursor-pointer flex-col gap-2 text-sm">
          <span className="font-medium">{busy ? t("page.import.busy") : t("dealImport.pick")}</span>
          <span className="text-ink-muted">{t("dealImport.columns")}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label={t("dealImport.fileAria")}
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const text = await file.text();
              setCsv(text);
              setDone(null);
              await send(text, true);
            }}
          />
        </label>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}

      {preview && (
        <Card size="flush" className="space-y-3 p-4">
          <p className="text-sm" role="status">
            {t("dealImport.summary", { valid: preview.valid, invalid: preview.invalid, companies: preview.companiesToCreate })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="text-ink-muted">
                <tr>
                  {["line", "name", "amount", "stage", "owner", "company", "contact", "close"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">
                      {t(`dealImport.col.${h}` as Parameters<typeof t>[0])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className={`border-t border-line/60 ${row.error ? "bg-feedback-error/5" : ""}`}>
                    <td className="px-2 py-1.5 tabular-nums">{row.line}</td>
                    <td className="px-2 py-1.5 font-medium">
                      {row.name || "—"}
                      {row.error && <span className="block font-normal text-feedback-error">{row.error}</span>}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{row.amount !== null ? formatMoney(row.amount, row.currency, locale) : "—"}</td>
                    <td className="px-2 py-1.5">{row.stage ?? t("dealImport.firstStage")}</td>
                    <td className="px-2 py-1.5">{row.owner ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {row.company ?? "—"}
                      {row.newCompany && <span className="ml-1 text-ink-muted">({t("dealImport.newCompany")})</span>}
                    </td>
                    <td className="px-2 py-1.5">{row.contact ?? "—"}</td>
                    <td className="px-2 py-1.5">{row.expectedCloseDate ? formatDate(row.expectedCloseDate, locale) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button disabled={busy || preview.invalid > 0 || !csv} onClick={() => csv && void send(csv, false)}>
              {t("dealImport.import", { count: preview.valid })}
            </Button>
          </div>
        </Card>
      )}

      {done && (
        <Card size="flush" className="space-y-1 p-4">
          <p className="font-medium text-feedback-ok" role="status">
            {t("dealImport.done", { created: done.created, companies: done.companiesCreated })}
          </p>
          <Link href="/deals" className="inline-block text-sm font-medium text-accent-700 hover:underline dark:text-accent-400">
            {t("dealImport.viewDeals")}
          </Link>
        </Card>
      )}

      <Card size="flush" className="p-4">
        <h2 className="mb-2 text-sm font-semibold">{t("page.import.example")}</h2>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">
{`name,amount,currency,stage,expected close date,owner,company,contact
Fiesta,"20.000.000.000",VND,Proposal,2026-12-15,lthoa@example.com,Fiesta Resort,khoi@example.com
Vạn Cát,5000,USD,,31/12/2026,,,`}
        </pre>
      </Card>
    </div>
  );
}

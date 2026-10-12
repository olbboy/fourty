"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { IconUpload } from "@/components/icons";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import { formatImportError } from "@/lib/import-display";

type Result = { created: number; updated?: number; skipped: number; companiesCreated: number; total: number };

export function ImportClient() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    const text = await file.text();
    const res = await fetch("/api/import/contacts", {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: text,
    });
    if (res.ok) setResult(await res.json());
    else setError(formatImportError((await res.json().catch(() => ({}))).error, t));
    setBusy(false);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title={t("page.import.title")} subtitle={t("page.import.subtitle")} />

      <Card
        size="flush"
        render={
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) upload(file);
            }}
          />
        }
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragOver ? "border-accent-500 bg-accent-600/5" : ""
        }`}
      >
        <IconUpload width={28} height={28} className="text-ink-muted" />
        <div>
          <p className="font-medium">{busy ? t("page.import.busy") : t("page.import.drop")}</p>
          <p className="mt-1 text-sm text-ink-muted">{t("page.import.columns")}</p>
        </div>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </Card>

      {error && <p className="mt-4 text-sm text-feedback-error">{error}</p>}
      {result && (
        <Card size="flush" className="mt-4 space-y-1 p-4">
          <p className="font-medium text-feedback-ok">{t("page.import.done")}</p>
          <p className="text-sm text-ink-muted">
            {t("page.import.summary", {
              created: result.created,
              updated: result.updated ?? 0,
              companies: result.companiesCreated,
              skipped: result.skipped,
              total: result.total,
            })}
          </p>
          <Link href="/contacts" className="inline-block pt-1 text-sm font-medium text-accent-700 hover:underline dark:text-accent-400">
            {t("page.import.viewContacts")}
          </Link>
        </Card>
      )}

      <Card size="flush" className="mt-6 p-4">
        <h2 className="mb-2 text-sm font-semibold">{t("page.import.example")}</h2>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">
{`name,email,title,company,status,source
Jane Doe,jane@acme.com,VP Sales,Acme Inc,qualified,referral
John Smith,john@globex.io,CTO,Globex,lead,website`}
        </pre>
      </Card>
    </div>
  );
}

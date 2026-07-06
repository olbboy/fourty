"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { IconUpload } from "@/components/icons";

type Result = { created: number; skipped: number; companiesCreated: number; total: number };

export function ImportClient() {
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
    else setError((await res.json().catch(() => ({}))).error ?? "Import failed");
    setBusy(false);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Import contacts"
        subtitle="CSV with a header row. Column names are matched flexibly — firstName/first_name/First Name all work."
      />

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
        className={`card flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-16 text-center transition ${
          dragOver ? "border-accent-500 bg-accent-600/5" : ""
        }`}
      >
        <IconUpload width={28} height={28} className="text-ink-muted" />
        <div>
          <p className="font-medium">{busy ? "Importing…" : "Drop a CSV here or click to browse"}</p>
          <p className="mt-1 text-sm text-ink-muted">
            Recognized columns: name / first / last, email, phone, title, company, status, source,
            linkedin, city, country
          </p>
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
      </label>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {result && (
        <div className="card mt-4 space-y-1 p-4">
          <p className="font-medium text-emerald-600 dark:text-emerald-400">Import complete ✓</p>
          <p className="text-sm text-ink-muted">
            {result.created} contacts created · {result.companiesCreated} companies auto-created ·{" "}
            {result.skipped} rows skipped (duplicates or missing name) · {result.total} rows total
          </p>
          <Link href="/contacts" className="inline-block pt-1 text-sm font-medium text-accent-600 hover:underline dark:text-accent-400">
            View contacts →
          </Link>
        </div>
      )}

      <div className="card mt-6 p-4">
        <h2 className="mb-2 text-sm font-semibold">Example CSV</h2>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed">
{`name,email,title,company,status,source
Jane Doe,jane@acme.com,VP Sales,Acme Inc,qualified,referral
John Smith,john@globex.io,CTO,Globex,lead,website`}
        </pre>
      </div>
    </div>
  );
}

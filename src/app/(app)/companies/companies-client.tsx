"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { formatCompact } from "@/lib/currency";
import { PageHeader, Modal, EmptyState, Spinner } from "@/components/ui";
import { IconPlus, IconDownload } from "@/components/icons";
import { CompanyForm } from "./company-form";

export function CompaniesClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await fetch(`/api/companies?${params}`);
    if (res.ok) setCompanies((await res.json()).companies);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 150 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Companies"
        subtitle={companies ? `${companies.length} organizations` : undefined}
        actions={
          <>
            <a href="/api/export/companies" className="btn-ghost">
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </a>
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">New company</span>
              <span className="sm:hidden">New</span>
            </button>
          </>
        }
      />

      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, domain, industry…"
          className="input max-w-xs"
        />
      </div>

      {!companies ? (
        <Spinner />
      ) : companies.length === 0 ? (
        <EmptyState
          title="No companies yet"
          hint="Companies group your contacts and deals by organization."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} /> New company
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Name</th>
                <th className="th">Industry</th>
                <th className="th">Size</th>
                <th className="th hidden lg:table-cell">Location</th>
                <th className="th">Revenue</th>
                <th className="th">Updated</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/companies/${c.id}`)}
                  className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-surface-2"
                >
                  <td className="td font-medium">
                    {c.name}
                    {c.domain && (
                      <span className="block text-xs font-normal text-ink-muted">{c.domain}</span>
                    )}
                  </td>
                  <td className="td text-ink-muted">{c.industry ?? "—"}</td>
                  <td className="td text-ink-muted">{c.size ?? "—"}</td>
                  <td className="td hidden text-ink-muted lg:table-cell">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="td text-ink-muted">
                    {c.annualRevenue ? formatCompact(c.annualRevenue, "USD") : "—"}
                  </td>
                  <td className="td text-ink-muted">{timeAgo(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="New company" open={showNew} onClose={() => setShowNew(false)} wide>
        <CompanyForm
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { formatMoney, formatCompact } from "@/lib/currency";
import { Modal, Avatar, StatusChip, ScoreBadge, Spinner } from "@/components/ui";
import { Timeline, NotesPanel, TasksPanel } from "@/components/record-panels";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { IconEdit, IconTrash } from "@/components/icons";
import { CompanyForm } from "../company-form";

export function CompanyDetail({ id }: { id: string }) {
  const router = useRouter();
  const defs = useCustomFields("company");
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/companies/${id}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    if (res.ok) setCompany((await res.json()).company);
    const [c, d] = await Promise.all([
      fetch(`/api/contacts?companyId=${id}`),
      fetch(`/api/deals?companyId=${id}`),
    ]);
    if (c.ok) setContacts((await c.json()).contacts);
    if (d.ok) setDeals((await d.json()).deals);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((d) => setPipelines(d.pipelines ?? []));
  }, [load]);

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    load();
  }, [load]);

  if (missing)
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Company not found.{" "}
        <Link href="/companies" className="text-accent-600 underline">
          Back to companies
        </Link>
      </p>
    );
  if (!company) return <Spinner />;

  const stageOf = (deal: Deal) =>
    pipelines.flatMap((p) => p.stages).find((s) => s.id === deal.stageId);

  async function remove() {
    if (!confirm(`Delete ${company!.name}? Contacts and deals will be kept but detached.`)) return;
    await fetch(`/api/companies/${id}`, { method: "DELETE" });
    router.push("/companies");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={company.name} size={11} />
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">{company.name}</h1>
            <p className="text-sm text-ink-muted">
              {[company.industry, company.size, [company.city, company.country].filter(Boolean).join(", ")]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="btn-ghost">
            <IconEdit width={15} height={15} /> Edit
          </button>
          <button onClick={remove} className="btn-ghost !text-red-500">
            <IconTrash width={15} height={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Details</h2>
            {[
              ["Domain", company.domain],
              ["Website", company.website],
              ["LinkedIn", company.linkedin],
              ["Annual revenue", company.annualRevenue ? formatCompact(company.annualRevenue, "USD") : null],
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {label}
                </p>
                <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
              </div>
            ))}
            <CustomFieldsDisplay defs={defs} values={company.custom} />
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">People ({contacts.length})</h2>
            <div className="space-y-2">
              {contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
                >
                  <Avatar name={`${c.firstName} ${c.lastName}`} size={7} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{c.jobTitle ?? c.email ?? ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusChip status={c.status} />
                    <ScoreBadge score={c.score} />
                  </div>
                </Link>
              ))}
              {contacts.length === 0 && <p className="text-sm text-ink-muted">No contacts.</p>}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Deals ({deals.length})</h2>
            <div className="space-y-2">
              {deals.map((d) => {
                const stage = stageOf(d);
                return (
                  <Link
                    key={d.id}
                    href={`/deals/${d.id}`}
                    className="block rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
                  >
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-ink-muted">
                      {formatMoney(d.amount, d.currency)}
                      {stage && (
                        <span className="ml-2 font-medium" style={{ color: stage.color }}>
                          {stage.name}
                        </span>
                      )}
                    </p>
                  </Link>
                );
              })}
              {deals.length === 0 && <p className="text-sm text-ink-muted">No deals.</p>}
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <Timeline entityType="company" entityId={id} refreshKey={refreshKey} />
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Notes</h2>
            <NotesPanel entityType="company" entityId={id} onChanged={bump} />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
            <TasksPanel entityType="company" entityId={id} onChanged={bump} />
          </div>
        </div>
      </div>

      <Modal title="Edit company" open={editing} onClose={() => setEditing(false)} wide>
        <CompanyForm
          company={company}
          onSaved={() => {
            setEditing(false);
            bump();
          }}
        />
      </Modal>
      <p className="mt-6 text-xs text-ink-muted">Updated {timeAgo(company.updatedAt)}</p>
    </div>
  );
}

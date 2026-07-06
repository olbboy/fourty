"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company, Contact, Deal, Pipeline, Stage } from "@/lib/types";
import { convert, formatCompact, formatMoney } from "@/lib/currency";
import { timeAgo, formatDate } from "@/lib/format";
import { PageHeader, Modal, EmptyState, Spinner } from "@/components/ui";
import { IconPlus, IconKanban, IconList, IconDownload } from "@/components/icons";
import { DealForm } from "./deal-form";

export function DealsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/deals");
    if (res.ok) setDeals((await res.json()).deals);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((d) => {
        setPipelines(d.pipelines ?? []);
        if (d.pipelines?.[0]) setPipelineId((prev) => prev || d.pipelines[0].id);
      });
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []));
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []));
  }, [load]);

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const pipelineDeals = useMemo(
    () => (deals ?? []).filter((d) => d.pipelineId === pipelineId),
    [deals, pipelineId],
  );

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name;

  async function moveDeal(dealId: string, stageId: string) {
    // optimistic update
    setDeals((prev) =>
      prev ? prev.map((d) => (d.id === dealId ? { ...d, stageId } : d)) : prev,
    );
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (!res.ok) load(); // rollback on failure
  }

  function stageTotals(stage: Stage) {
    const inStage = pipelineDeals.filter((d) => d.stageId === stage.id);
    const totalUsd = inStage.reduce((sum, d) => sum + convert(d.amount, d.currency, "USD"), 0);
    return { count: inStage.length, totalUsd };
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Deals"
        subtitle={
          pipelineDeals.length
            ? `${pipelineDeals.length} deals · ${formatCompact(
                pipelineDeals.reduce((s, d) => s + convert(d.amount, d.currency, "USD"), 0),
                "USD",
              )} total`
            : undefined
        }
        actions={
          <>
            {pipelines.length > 1 && (
              <select
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
                className="input w-auto"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex rounded-lg border border-line">
              <button
                onClick={() => setView("kanban")}
                className={`px-2.5 py-2 ${view === "kanban" ? "bg-accent-600/10 text-accent-600" : "text-ink-muted"} rounded-l-lg`}
                aria-label="Kanban view"
              >
                <IconKanban width={16} height={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`px-2.5 py-2 ${view === "list" ? "bg-accent-600/10 text-accent-600" : "text-ink-muted"} rounded-r-lg`}
                aria-label="List view"
              >
                <IconList width={16} height={16} />
              </button>
            </div>
            <a href="/api/export/deals" className="btn-ghost">
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </a>
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">New deal</span>
              <span className="sm:hidden">New</span>
            </button>
          </>
        }
      />

      {!deals || !pipeline ? (
        <Spinner />
      ) : pipelineDeals.length === 0 ? (
        <EmptyState
          title="No deals in this pipeline"
          hint="Create your first deal and drag it through the stages as it progresses."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} /> New deal
            </button>
          }
        />
      ) : view === "kanban" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex min-w-max gap-3">
            {pipeline.stages.map((stage) => {
              const { count, totalUsd } = stageTotals(stage);
              const inStage = pipelineDeals.filter((d) => d.stageId === stage.id);
              return (
                <div
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverStage(stage.id);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    if (dragId) moveDeal(dragId, stage.id);
                    setDragId(null);
                  }}
                  className={`w-64 shrink-0 rounded-xl border p-2 transition ${
                    overStage === stage.id
                      ? "border-accent-500 bg-accent-600/5"
                      : "border-line bg-surface-2/50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: stage.color }}
                      />
                      <span className="text-sm font-semibold">{stage.name}</span>
                      <span className="text-xs text-ink-muted">{count}</span>
                    </div>
                    <span className="text-xs font-medium text-ink-muted">
                      {formatCompact(totalUsd, "USD")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {inStage.map((deal) => (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => setDragId(deal.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => router.push(`/deals/${deal.id}`)}
                        className={`card cursor-grab p-3 shadow-sm transition hover:border-accent-400 active:cursor-grabbing ${
                          dragId === deal.id ? "opacity-40" : ""
                        }`}
                      >
                        <p className="text-sm font-medium leading-snug">{deal.name}</p>
                        <p className="mt-1 text-sm font-semibold text-accent-600 dark:text-accent-400">
                          {formatMoney(deal.amount, deal.currency)}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-ink-muted">
                          <span className="truncate">{companyName(deal.companyId) ?? ""}</span>
                          {deal.expectedCloseDate && (
                            <span
                              className={
                                stage.type === "open" && deal.expectedCloseDate < Date.now()
                                  ? "font-medium text-red-500"
                                  : ""
                              }
                            >
                              {formatDate(deal.expectedCloseDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Deal</th>
                <th className="th">Amount</th>
                <th className="th">Stage</th>
                <th className="th">Company</th>
                <th className="th">Close date</th>
                <th className="th">Updated</th>
              </tr>
            </thead>
            <tbody>
              {pipelineDeals.map((d) => {
                const stage = pipeline.stages.find((s) => s.id === d.stageId);
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/deals/${d.id}`)}
                    className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-surface-2"
                  >
                    <td className="td font-medium">{d.name}</td>
                    <td className="td">{formatMoney(d.amount, d.currency)}</td>
                    <td className="td">
                      {stage && (
                        <span
                          className="chip"
                          style={{ background: `${stage.color}20`, color: stage.color }}
                        >
                          {stage.name}
                        </span>
                      )}
                    </td>
                    <td className="td text-ink-muted">{companyName(d.companyId) ?? "—"}</td>
                    <td className="td text-ink-muted">{formatDate(d.expectedCloseDate)}</td>
                    <td className="td text-ink-muted">{timeAgo(d.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal title="New deal" open={showNew} onClose={() => setShowNew(false)} wide>
        <DealForm
          pipelines={pipelines}
          companies={companies}
          contacts={contacts}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>
      {view === "kanban" && (
        <p className="mt-2 hidden text-xs text-ink-muted md:block">
          Drag cards between stages — totals and win-probability forecasts update instantly.
        </p>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Company, Contact, Deal, Pipeline, Stage } from "@/lib/types";
import { convert, formatCompact, formatMoney } from "@/lib/currency";
import { timeAgo, formatDate } from "@/lib/format";
import { AsyncError, ContextToolbar, EmptyState, Modal, PageHeader, Spinner } from "@/components/ui";
import { IconPlus, IconKanban, IconList, IconDownload } from "@/components/icons";
import { Select } from "@/components/select";
import { DealForm } from "./deal-form";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDealsResponse(value: unknown): value is { deals: Deal[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.deals) &&
    value.deals.every(
      (deal) => isRecord(deal) && typeof deal.id === "string" && typeof deal.name === "string",
    )
  );
}

function isPipelinesResponse(value: unknown): value is { pipelines: Pipeline[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.pipelines) &&
    value.pipelines.every(
      (pipeline) =>
        isRecord(pipeline) &&
        typeof pipeline.id === "string" &&
        typeof pipeline.name === "string" &&
        Array.isArray(pipeline.stages),
    )
  );
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pipelinesLoading, setPipelinesLoading] = useState(true);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const requestRef = useRef<{ controller: AbortController; generation: number } | null>(null);
  const generationRef = useRef(0);
  const pipelineRequestRef = useRef<{ controller: AbortController; generation: number } | null>(null);
  const pipelineGenerationRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    requestRef.current = { controller, generation };
    setLoadError(null);

    try {
      const res = await fetch("/api/deals", { signal: controller.signal });
      if (!res.ok) throw new Error(`Deals request failed with ${res.status}`);
      const body: unknown = await res.json();
      if (!isDealsResponse(body)) throw new Error("Deals response was invalid");
      if (generation !== generationRef.current || controller.signal.aborted) return;
      setDeals(body.deals);
      setLoadError(null);
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Unable to load deals");
    } finally {
      if (requestRef.current?.generation === generation) requestRef.current = null;
    }
  }, []);

  const loadPipelines = useCallback(async (): Promise<void> => {
    const generation = pipelineGenerationRef.current + 1;
    pipelineGenerationRef.current = generation;
    pipelineRequestRef.current?.controller.abort();
    const controller = new AbortController();
    pipelineRequestRef.current = { controller, generation };
    setPipelinesLoading(true);
    setPipelineError(null);

    try {
      const response = await fetch("/api/pipelines", { signal: controller.signal });
      if (!response.ok) throw new Error(`Pipelines request failed with ${response.status}`);
      const body: unknown = await response.json();
      if (!isPipelinesResponse(body) || body.pipelines.length === 0) {
        throw new Error("No sales pipeline is available");
      }
      if (generation !== pipelineGenerationRef.current || controller.signal.aborted) return;
      setPipelines(body.pipelines);
      setPipelineId((current) => {
        if (body.pipelines.some((pipeline) => pipeline.id === current)) return current;
        return (body.pipelines.find((pipeline) => pipeline.isDefault === 1) ?? body.pipelines[0]).id;
      });
    } catch (error) {
      if (controller.signal.aborted || generation !== pipelineGenerationRef.current) return;
      setPipelineError(error instanceof Error ? error.message : "Unable to load pipelines");
    } finally {
      if (pipelineRequestRef.current?.generation === generation) {
        pipelineRequestRef.current = null;
        setPipelinesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    void loadPipelines();
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []));
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []));
  }, [load, loadPipelines]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      requestRef.current?.controller.abort();
      pipelineGenerationRef.current += 1;
      pipelineRequestRef.current?.controller.abort();
    },
    [],
  );

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const pipelineDeals = useMemo(
    () => (deals ?? []).filter((d) => d.pipelineId === pipelineId),
    [deals, pipelineId],
  );

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name;

  async function moveDeal(dealId: string, stageId: string) {
    // optimistic update
    const previousDeals = deals;
    setDeals((prev) =>
      prev ? prev.map((d) => (d.id === dealId ? { ...d, stageId } : d)) : prev,
    );
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!res.ok) {
        setDeals(previousDeals);
        void load();
      }
    } catch {
      setDeals(previousDeals);
      void load();
    }
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
      />

      <ContextToolbar
        className="mb-4"
        filters={
          pipelines.length > 1 ? (
            <Select
              aria-label="Select pipeline"
              value={pipelineId}
              onValueChange={setPipelineId}
              className="min-h-11 !w-full sm:!w-[13rem] sm:min-h-0 md:!w-[15rem]"
              options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
            />
          ) : undefined
        }
        view={
          <div className="flex rounded-lg border border-line" role="group" aria-label="Deal view">
            <button
              type="button"
              onClick={() => setView("kanban")}
              className={`min-h-11 min-w-11 rounded-l-lg px-2.5 py-2 sm:min-h-0 ${view === "kanban" ? "bg-accent-600/10 text-accent-600" : "text-ink-muted"}`}
              aria-label="Kanban view"
              aria-pressed={view === "kanban"}
            >
              <IconKanban width={16} height={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`min-h-11 min-w-11 rounded-r-lg px-2.5 py-2 sm:min-h-0 ${view === "list" ? "bg-accent-600/10 text-accent-600" : "text-ink-muted"}`}
              aria-label="List view"
              aria-pressed={view === "list"}
            >
              <IconList width={16} height={16} aria-hidden="true" />
            </button>
          </div>
        }
        actions={
          <>
            <a href="/api/export/deals" className="btn-ghost min-h-11 sm:min-h-0">
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </a>
            <button onClick={() => setShowNew(true)} className="btn-primary min-h-11 sm:min-h-0">
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">New deal</span>
              <span className="sm:hidden">New</span>
            </button>
          </>
        }
      />

      {loadError || pipelineError ? (
        <AsyncError
          message={pipelineError ? "We couldn't load sales pipelines." : "We couldn't load deals."}
          hint="Check your connection and try again."
          onRetry={() => {
            if (loadError) void load();
            if (pipelineError) void loadPipelines();
          }}
        />
      ) : !deals || pipelinesLoading ? (
        <Spinner label="Loading deals" />
      ) : !pipeline ? (
        <AsyncError
          message="No sales pipeline is available."
          hint="Retry after a workspace administrator creates a pipeline."
          onRetry={() => void loadPipelines()}
        />
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
                  data-testid="stage-column"
                  data-stage-id={stage.id}
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
                    <span
                      data-testid="stage-total"
                      className="text-xs font-medium text-ink-muted"
                    >
                      {formatCompact(totalUsd, "USD")}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {inStage.map((deal) => (
                      <div
                        key={deal.id}
                        data-testid="deal-card"
                        data-deal-id={deal.id}
                        draggable
                        onDragStart={() => setDragId(deal.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={(event) => {
                          if (
                            event.target instanceof Element &&
                            event.target.closest("a,button,input,select,textarea,[role='button']")
                          ) {
                            return;
                          }
                          router.push(`/deals/${deal.id}`);
                        }}
                        className={`card cursor-grab p-3 shadow-sm transition hover:border-accent-400 active:cursor-grabbing ${
                          dragId === deal.id ? "opacity-40" : ""
                        }`}
                      >
                        <p className="text-sm font-medium leading-snug">
                          <Link href={`/deals/${deal.id}`} className="underline-offset-2 hover:underline">
                            {deal.name}
                          </Link>
                        </p>
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
                    onClick={(event) => {
                      if (
                        event.target instanceof Element &&
                        event.target.closest("a,button,input,select,textarea,[role='button']")
                      ) {
                        return;
                      }
                      router.push(`/deals/${d.id}`);
                    }}
                    className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-surface-2"
                  >
                    <td className="td font-medium">
                      <Link href={`/deals/${d.id}`} className="underline-offset-2 hover:underline">
                        {d.name}
                      </Link>
                    </td>
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
            void load();
          }}
        />
      </Modal>
      {view === "kanban" && (
        <>
          <p className="mt-2 text-xs text-ink-muted md:hidden">Swipe horizontally to see more stages.</p>
          <p className="mt-2 hidden text-xs text-ink-muted md:block">
            Drag cards between stages — totals and win-probability forecasts update instantly.
          </p>
        </>
      )}
    </div>
  );
}

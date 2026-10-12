"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { formatCompact, formatMoney, sumUsd } from "@/lib/currency";
import { timeAgo, formatDate, displayName } from "@/lib/format";
import { washedChip } from "@/lib/contrast-color";
import {
  PageHeader,
  Modal,
  EmptyState,
  Spinner,
  LoadError,
  StageDot,
  HealthBadge,
} from "@/components/ui";
import {
  IconPlus,
  IconKanban,
  IconList,
  IconDownload,
} from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { DealForm } from "./deal-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { withViewTransition } from "@/lib/view-transition";
import { canEditField } from "@/lib/field-access";
import { pipelineBoard } from "@/lib/deals-board";
import { useFieldAccess } from "@/hooks/use-field-access";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocale, useT } from "@/lib/i18n/provider";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDealsResponse(value: unknown): value is { deals: Deal[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.deals) &&
    value.deals.every(
      (deal) =>
        isRecord(deal) &&
        typeof deal.id === "string" &&
        typeof deal.name === "string",
    )
  );
}

function isPipelinesResponse(
  value: unknown,
): value is { pipelines: Pipeline[] } {
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
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const access = useFieldAccess("deals");
  const canMoveStage = canEditField(access, "stageId");
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupRetry, setLookupRetry] = useState(0);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const requestRef = useRef<{
    controller: AbortController;
    generation: number;
  } | null>(null);
  const generationRef = useRef(0);
  const lookupRequestRef = useRef<{
    controller: AbortController;
    generation: number;
  } | null>(null);
  const lookupGenerationRef = useRef(0);

  const applyView = useCallback((saved: SavedView | null) => {
    setActiveView(saved?.id ?? null);
    const cfg = saved?.config ?? {};
    if (typeof cfg.filters?.pipelineId === "string")
      setPipelineId(cfg.filters.pipelineId);
    setQ(typeof cfg.filters?.q === "string" ? cfg.filters.q : "");
    const nextView = cfg.filters?.view;
    if (nextView === "list" || nextView === "kanban") setView(nextView);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    requestRef.current = { controller, generation };
    setFailed(false);
    setDeals(null);

    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const query = params.toString();

    try {
      const response = await fetch(
        query ? `/api/deals?${query}` : "/api/deals",
        {
          signal: controller.signal,
        },
      );
      if (!response.ok)
        throw new Error(`Deals request failed with ${response.status}`);
      const payload: unknown = await response.json();
      if (!isDealsResponse(payload))
        throw new Error("Deals response was invalid");
      if (generation !== generationRef.current || controller.signal.aborted)
        return;
      setDeals(payload.deals);
      setFailed(false);
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current)
        return;
      setFailed(true);
    } finally {
      if (requestRef.current?.generation === generation)
        requestRef.current = null;
    }
  }, [q]);

  const loadLookups = useCallback(async (): Promise<void> => {
    const generation = lookupGenerationRef.current + 1;
    lookupGenerationRef.current = generation;
    lookupRequestRef.current?.controller.abort();
    const controller = new AbortController();
    lookupRequestRef.current = { controller, generation };
    setLookupsLoading(true);
    setLookupsFailed(false);

    try {
      const [p, co, ct] = await Promise.all(
        ["/api/pipelines", "/api/companies", "/api/contacts"].map((url) =>
          fetch(url, { signal: controller.signal }),
        ),
      );
      if (!p.ok || !co.ok || !ct.ok) throw new Error("Lookups request failed");
      const [pipelinePayload, companyPayload, contactPayload] =
        await Promise.all(
          [p, co, ct].map((response) => response.json() as Promise<unknown>),
        );
      if (
        !isPipelinesResponse(pipelinePayload) ||
        pipelinePayload.pipelines.length === 0
      ) {
        throw new Error("No sales pipeline is available");
      }
      if (
        generation !== lookupGenerationRef.current ||
        controller.signal.aborted
      )
        return;

      const pipelineList = pipelinePayload.pipelines;
      const companyList =
        isRecord(companyPayload) && Array.isArray(companyPayload.companies)
          ? (companyPayload.companies as Company[])
          : [];
      const contactList =
        isRecord(contactPayload) && Array.isArray(contactPayload.contacts)
          ? (contactPayload.contacts as Contact[])
          : [];
      setPipelines(pipelineList);
      setPipelineId((current) => {
        if (pipelineList.some((pipeline) => pipeline.id === current))
          return current;
        return (
          pipelineList.find((pipeline) => pipeline.isDefault === 1) ??
          pipelineList[0]
        ).id;
      });
      setCompanies(companyList);
      setContacts(contactList);
      setLookupsFailed(false);
    } catch {
      if (
        controller.signal.aborted ||
        generation !== lookupGenerationRef.current
      )
        return;
      setPipelines([]);
      setCompanies([]);
      setContacts([]);
      setLookupsFailed(true);
    } finally {
      if (lookupRequestRef.current?.generation === generation) {
        lookupRequestRef.current = null;
        setLookupsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    requestRef.current?.controller.abort();
    requestRef.current = null;
    const timer = setTimeout(() => void load(), q.trim() ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    void loadLookups();
    return () => {
      lookupGenerationRef.current += 1;
      lookupRequestRef.current?.controller.abort();
      lookupRequestRef.current = null;
    };
  }, [loadLookups, lookupRetry]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      requestRef.current?.controller.abort();
      requestRef.current = null;
    },
    [],
  );

  const pipeline = pipelines.find((candidate) => candidate.id === pipelineId);
  const board = useMemo(
    () => pipelineBoard(deals ?? [], pipelineId, pipeline?.stages ?? []),
    [deals, pipelineId, pipeline],
  );
  const pipelineDeals = board.deals;

  const companyName = (id: string | null): string | undefined =>
    companies.find((company) => company.id === id)?.name;

  async function moveDeal(dealId: string, stageId: string): Promise<void> {
    if (!canMoveStage) return;
    const previousDeals = deals;
    withViewTransition(() => {
      setDeals((current) =>
        current
          ? current.map((deal) =>
              deal.id === dealId ? { ...deal, stageId } : deal,
            )
          : current,
      );
      setDragId(null);
    });

    try {
      const response = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      if (!response.ok) throw new Error("Deal move failed");
    } catch {
      setDeals(previousDeals);
      void load();
    }
  }

  const hideAmounts = pipelineDeals.some((deal) => deal.amount == null);
  const pipelineTotal = hideAmounts ? null : sumUsd(pipelineDeals);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("nav.deals")}
        subtitle={
          pipelineDeals.length
            ? pipelineTotal != null
              ? t("page.deals.countTotal", {
                  count: pipelineDeals.length,
                  total: formatCompact(pipelineTotal, "USD"),
                })
              : t("page.deals.count", { count: pipelineDeals.length })
            : undefined
        }
        actions={
          <>
            {pipelines.length > 1 && board.filterByPipeline && (
              <NativeSelect
                value={pipelineId}
                onChange={(event) => {
                  setPipelineId(event.target.value);
                  setActiveView(null);
                }}
                aria-label={t("page.deals.pipelineAria")}
              >
                {pipelines.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            <div className="flex rounded-lg border border-line">
              <button
                type="button"
                onClick={() => {
                  setView("kanban");
                  setActiveView(null);
                }}
                className={`px-2.5 py-2 ${view === "kanban" ? "bg-accent-600/10 text-accent-700" : "text-ink-muted"} rounded-l-lg`}
                aria-label={t("page.deals.kanban")}
                aria-pressed={view === "kanban"}
              >
                <IconKanban width={16} height={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setView("list");
                  setActiveView(null);
                }}
                className={`px-2.5 py-2 ${view === "list" ? "bg-accent-600/10 text-accent-700" : "text-ink-muted"} rounded-r-lg`}
                aria-label={t("page.deals.list")}
                aria-pressed={view === "list"}
              >
                <IconList width={16} height={16} aria-hidden="true" />
              </button>
            </div>
            <a
              href="/api/export/deals"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <IconDownload width={15} height={15} aria-hidden="true" />
              <span className="hidden sm:inline">{t("action.export")}</span>
            </a>
            <Button
              onClick={() => setShowNew(true)}
              disabled={lookupsFailed || lookupsLoading}
            >
              <IconPlus width={15} height={15} aria-hidden="true" />
              <span className="hidden sm:inline">{t("page.deals.new")}</span>
              <span className="sm:hidden">{t("action.new")}</span>
            </Button>
          </>
        }
      />

      <SavedViewsBar
        entity="deals"
        activeId={activeView}
        current={{
          filters: {
            ...(pipelineId ? { pipelineId } : {}),
            ...(q.trim() ? { q: q.trim() } : {}),
            view,
          },
        }}
        onApply={applyView}
      />

      <div className="mb-4">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setActiveView(null);
          }}
          aria-label={t("page.deals.searchAria")}
          placeholder={t("page.deals.searchPlaceholder")}
          className="max-w-xs"
        />
      </div>

      {failed ? (
        <LoadError
          onRetry={() => {
            setDeals(null);
            void load();
          }}
        />
      ) : lookupsFailed ? (
        <LoadError onRetry={() => setLookupRetry((n) => n + 1)} />
      ) : lookupsLoading || !deals ? (
        <Spinner label="Loading deals" />
      ) : !pipeline ? (
        <EmptyState
          title="No sales pipeline is available"
          hint="Ask a workspace administrator to create a pipeline before adding deals."
        />
      ) : pipelineDeals.length === 0 ? (
        <EmptyState
          title={t("page.deals.empty")}
          hint={t("page.deals.emptyHint")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} aria-hidden="true" />{" "}
              {t("page.deals.new")}
            </Button>
          }
        />
      ) : view === "kanban" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex min-w-max gap-3">
            {board.columns.map((column) => {
              const stage = column.stage;
              const inStage = column.deals;
              const totalUsd = hideAmounts ? null : (sumUsd(inStage) ?? 0);
              const canDrop = canMoveStage && stage != null;
              return (
                <div
                  key={stage?.id ?? "unplaced"}
                  data-testid="stage-column"
                  {...(stage
                    ? { "data-stage-id": stage.id }
                    : { "data-unplaced": "true" })}
                  onDragOver={(event) => {
                    if (!canDrop) return;
                    event.preventDefault();
                    setOverStage(stage.id);
                  }}
                  onDragLeave={() =>
                    setOverStage((current) =>
                      current === stage?.id ? null : current,
                    )
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    setOverStage(null);
                    if (canDrop && dragId) void moveDeal(dragId, stage.id);
                    setDragId(null);
                  }}
                  className={`w-64 shrink-0 rounded-xl border p-2 transition ${
                    stage && overStage === stage.id
                      ? "border-accent-500 bg-accent-600/5"
                      : "border-line bg-surface-2/50"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                    <div className="flex items-center gap-1.5">
                      {stage && <StageDot color={stage.color} />}
                      <span className="text-sm font-semibold">
                        {stage?.name ??
                          (board.groupByStage
                            ? t("common.unassigned")
                            : t("nav.deals"))}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {inStage.length}
                      </span>
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
                      <Card
                        size="flush"
                        key={deal.id}
                        data-testid="deal-card"
                        data-deal-id={deal.id}
                        draggable={canMoveStage}
                        onDragStart={
                          canMoveStage ? () => setDragId(deal.id) : undefined
                        }
                        onDragEnd={() => setDragId(null)}
                        onClick={() => router.push(`/deals/${deal.id}`)}
                        style={{ viewTransitionName: `deal-${deal.id}` }}
                        className={`p-3 transition-colors hover:border-accent-400 ${
                          canMoveStage
                            ? "cursor-grab active:cursor-grabbing"
                            : "cursor-pointer"
                        } ${dragId === deal.id ? "opacity-40" : ""}`}
                      >
                        <p className="text-sm font-medium leading-snug">
                          <Link
                            href={`/deals/${deal.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-accent-700 hover:underline dark:text-accent-400"
                          >
                            {displayName(deal.name)}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm font-semibold text-accent-700 dark:text-accent-400">
                          {formatMoney(deal.amount, deal.currency)}
                        </p>
                        {deal.score != null && (
                          <div className="mt-1.5">
                            <HealthBadge score={deal.score} />
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between text-xs text-ink-muted">
                          <span className="truncate">
                            {companyName(deal.companyId) ?? ""}
                          </span>
                          {deal.expectedCloseDate && (
                            <span
                              className={
                                stage?.type === "open" &&
                                deal.expectedCloseDate < Date.now()
                                  ? "font-medium text-feedback-error"
                                  : ""
                              }
                            >
                              {formatDate(deal.expectedCloseDate, locale)}
                            </span>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Card size="flush">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.deal")}</TableHead>
                <TableHead>{t("col.amount")}</TableHead>
                <TableHead>{t("col.health")}</TableHead>
                <TableHead>{t("col.stage")}</TableHead>
                <TableHead>{t("col.company")}</TableHead>
                <TableHead>{t("col.closeDate")}</TableHead>
                <TableHead>{t("col.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipelineDeals.map((deal) => {
                const stage = pipeline.stages.find(
                  (candidate) => candidate.id === deal.stageId,
                );
                const chip = stage && washedChip(stage.color);
                return (
                  <TableRow
                    key={deal.id}
                    onClick={() => router.push(`/deals/${deal.id}`)}
                    className="cursor-pointer transition hover:bg-surface-2"
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={`/deals/${deal.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-accent-700 hover:underline dark:text-accent-400"
                      >
                        {displayName(deal.name)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {formatMoney(deal.amount, deal.currency)}
                    </TableCell>
                    <TableCell>
                      <HealthBadge score={deal.score} />
                    </TableCell>
                    <TableCell>
                      {stage && chip && (
                        <span
                          className="chip data-ink"
                          style={
                            {
                              background: chip.background,
                              "--data-ink-light": chip.light,
                              "--data-ink-dark": chip.dark,
                            } as React.CSSProperties
                          }
                        >
                          {stage.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {companyName(deal.companyId) ?? "—"}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {formatDate(deal.expectedCloseDate, locale)}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {timeAgo(deal.updatedAt, locale)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal
        title={t("page.deals.newModal")}
        open={showNew}
        onClose={() => setShowNew(false)}
        wide
      >
        <DealForm
          key={pipelineId || "new"}
          pipelines={pipelines}
          defaultPipelineId={pipelineId}
          companies={companies}
          contacts={contacts}
          onSaved={() => {
            setShowNew(false);
            void load();
          }}
        />
      </Modal>
      {view === "kanban" && board.groupByStage && (
        <>
          <p className="mt-2 text-xs text-ink-muted md:hidden">
            Swipe horizontally to see more stages.
          </p>
          {canMoveStage && (
            <p className="mt-2 hidden text-xs text-ink-muted md:block">
              Drag cards between stages — totals and win-probability forecasts
              update instantly.
            </p>
          )}
        </>
      )}
    </div>
  );
}

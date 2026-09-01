"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { formatCompact, formatMoney, sumUsd } from "@/lib/currency";
import { timeAgo, formatDate, displayName } from "@/lib/format";
import { washedChip } from "@/lib/contrast-color";
import { PageHeader, Modal, EmptyState, Spinner, LoadError, StageDot, HealthBadge } from "@/components/ui";
import { IconPlus, IconKanban, IconList, IconDownload } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { DealForm } from "./deal-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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
  const [lookupRetry, setLookupRetry] = useState(0);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");

  const applyView = useCallback((saved: SavedView | null) => {
    setActiveView(saved?.id ?? null);
    const cfg = saved?.config ?? {};
    if (typeof cfg.filters?.pipelineId === "string") setPipelineId(cfg.filters.pipelineId);
    const nextView = cfg.filters?.view;
    if (nextView === "list" || nextView === "kanban") setView(nextView);
  }, []);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/deals");
      if (!res.ok) throw new Error("deals");
      setDeals((await res.json()).deals);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/pipelines"), fetch("/api/companies"), fetch("/api/contacts")])
      .then(async ([p, co, ct]) => {
        if (!p.ok || !co.ok || !ct.ok) throw new Error("lookups");
        const [pipelines, companies, contacts] = await Promise.all([p.json(), co.json(), ct.json()]);
        if (cancelled) return;
        const list = Array.isArray(pipelines.pipelines) ? pipelines.pipelines : [];
        setPipelines(list);
        if (list[0]) setPipelineId((prev) => prev || list[0].id);
        setCompanies(Array.isArray(companies.companies) ? companies.companies : []);
        setContacts(Array.isArray(contacts.contacts) ? contacts.contacts : []);
        setLookupsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPipelines([]);
        setCompanies([]);
        setContacts([]);
        setLookupsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lookupRetry]);

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const board = useMemo(
    () => pipelineBoard(deals ?? [], pipelineId, pipeline?.stages ?? []),
    [deals, pipelineId, pipeline],
  );
  const pipelineDeals = board.deals;

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name;

  async function moveDeal(dealId: string, stageId: string) {
    if (!canMoveStage) return;
    // Optimistic, and inside a View Transition so the card is seen travelling
    // to its new column instead of appearing there. The drag state clears in
    // the same flush on purpose: the transition photographs the DOM the moment
    // this callback settles, and a card still wearing its dragging opacity
    // would animate down to 40% and then snap back.
    withViewTransition(() => {
      setDeals((prev) =>
        prev ? prev.map((d) => (d.id === dealId ? { ...d, stageId } : d)) : prev,
      );
      setDragId(null);
    });
    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    // Rollback on failure, and deliberately not inside a transition of its own:
    // a rejected move should correct itself at once, not play the journey back.
    if (!res.ok) load();
  }

  const hideAmounts = pipelineDeals.some((d) => d.amount == null);
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
                onChange={(e) => {
                  setPipelineId(e.target.value);
                  setActiveView(null);
                }}
                aria-label={t("page.deals.pipelineAria")}>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            )}
            <div className="flex rounded-lg border border-line">
              <button
                onClick={() => {
                  setView("kanban");
                  setActiveView(null);
                }}
                className={`px-2.5 py-2 ${view === "kanban" ? "bg-accent-600/10 text-accent-700" : "text-ink-muted"} rounded-l-lg`}
                aria-label={t("page.deals.kanban")}
              >
                <IconKanban width={16} height={16} />
              </button>
              <button
                onClick={() => {
                  setView("list");
                  setActiveView(null);
                }}
                className={`px-2.5 py-2 ${view === "list" ? "bg-accent-600/10 text-accent-700" : "text-ink-muted"} rounded-r-lg`}
                aria-label={t("page.deals.list")}
              >
                <IconList width={16} height={16} />
              </button>
            </div>
            <a href="/api/export/deals" className={cn(buttonVariants({ variant: "outline" }))}>
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">{t("action.export")}</span>
            </a>
            <Button onClick={() => setShowNew(true)} disabled={lookupsFailed}>
              <IconPlus width={15} height={15} />
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
            view,
          },
        }}
        onApply={applyView}
      />

      {failed ? (
        <LoadError
          onRetry={() => {
            setDeals(null);
            void load();
          }}
        />
      ) : lookupsFailed ? (
        <LoadError onRetry={() => setLookupRetry((n) => n + 1)} />
      ) : !deals || !pipeline ? (
        <Spinner />
      ) : pipelineDeals.length === 0 ? (
        <EmptyState
          title={t("page.deals.empty")}
          hint={t("page.deals.emptyHint")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} /> {t("page.deals.new")}
            </Button>
          }
        />
      ) : view === "kanban" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          <div className="flex min-w-max gap-3">
            {board.columns.map((col) => {
              const stage = col.stage;
              const inStage = col.deals;
              const totalUsd = hideAmounts ? null : (sumUsd(inStage) ?? 0);
              const canDrop = canMoveStage && stage != null;
              return (
                <div
                  key={stage?.id ?? "unplaced"}
                  data-testid="stage-column"
                  {...(stage ? { "data-stage-id": stage.id } : { "data-unplaced": "true" })}
                  onDragOver={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                    setOverStage(stage.id);
                  }}
                  onDragLeave={() => setOverStage((s) => (s === stage?.id ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOverStage(null);
                    if (canDrop && dragId) moveDeal(dragId, stage.id);
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
                        {stage?.name ?? (board.groupByStage ? t("common.unassigned") : t("nav.deals"))}
                      </span>
                      <span className="text-xs text-ink-muted">{inStage.length}</span>
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
                        onDragStart={canMoveStage ? () => setDragId(deal.id) : undefined}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => router.push(`/deals/${deal.id}`)}
                        // What makes the card a single object across the move
                        // rather than one leaving and another arriving. The
                        // prefix matters: an id may open with a digit, which a
                        // bare CSS custom-ident may not. Only the board names
                        // its cards — the list view below renders the same
                        // deals, and two elements sharing a name abort the
                        // transition.
                        style={{ viewTransitionName: `deal-${deal.id}` }}
                        className={`p-3 transition-colors hover:border-accent-400 ${
                          canMoveStage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${dragId === deal.id ? "opacity-40" : ""}`}
                      >
                        <p className="text-sm font-medium leading-snug">{displayName(deal.name)}</p>
                        <p className="mt-1 text-sm font-semibold text-accent-700 dark:text-accent-400">
                          {formatMoney(deal.amount, deal.currency)}
                        </p>
                        {deal.score != null && (
                          <div className="mt-1.5">
                            <HealthBadge score={deal.score} />
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between text-xs text-ink-muted">
                          <span className="truncate">{companyName(deal.companyId) ?? ""}</span>
                          {deal.expectedCloseDate && (
                            <span
                              className={
                                stage?.type === "open" && deal.expectedCloseDate < Date.now()
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
              {pipelineDeals.map((d) => {
                const stage = pipeline.stages.find((s) => s.id === d.stageId);
                const chip = stage && washedChip(stage.color);
                return (
                  <TableRow
                    key={d.id}
                    onClick={() => router.push(`/deals/${d.id}`)}
                    className="cursor-pointer transition hover:bg-surface-2"
                  >
                    <TableCell className="font-medium">{displayName(d.name)}</TableCell>
                    <TableCell>{formatMoney(d.amount, d.currency)}</TableCell>
                    <TableCell>
                      <HealthBadge score={d.score} />
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
                    <TableCell className="text-ink-muted">{companyName(d.companyId) ?? "—"}</TableCell>
                    <TableCell className="text-ink-muted">{formatDate(d.expectedCloseDate, locale)}</TableCell>
                    <TableCell className="text-ink-muted">{timeAgo(d.updatedAt, locale)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal title={t("page.deals.newModal")} open={showNew} onClose={() => setShowNew(false)} wide>
        <DealForm
          key={pipelineId || "new"}
          pipelines={pipelines}
          defaultPipelineId={pipelineId}
          companies={companies}
          contacts={contacts}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>
      {view === "kanban" && canMoveStage && board.groupByStage && (
        <p className="mt-2 hidden text-xs text-ink-muted md:block">
          Drag cards between stages — totals and win-probability forecasts update instantly.
        </p>
      )}
    </div>
  );
}

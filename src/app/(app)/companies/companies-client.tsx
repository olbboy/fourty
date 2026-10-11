"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompanyListQuery, CompanyRead, CompanySort, CompaniesListResponse } from "@/lib/types";
import { PageHeader, EmptyState, Modal, Spinner } from "@/components/ui";
import { IconDownload, IconPlus, IconSearch } from "@/components/icons";
import { CompanyPreview } from "@/components/company-preview";
import { SavedViewsBar, type SavedView, type ViewConfig } from "@/components/saved-views";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/dropdown-menu";
import { Select } from "@/components/select";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import {
  buildCompanyExportUrl,
  companyListQueryKey,
  parseCompanyListQuery,
  toCompanyApiParams,
} from "@/lib/company-list-query";
import { CompaniesTable } from "./companies-table";
import { CompanyForm } from "./company-form";

const SORT_OPTIONS: Array<{ value: CompanySort; label: MessageKey }> = [
  { value: "updatedAt_desc", label: "companies.sortUpdatedDesc" },
  { value: "updatedAt_asc", label: "companies.sortUpdatedAsc" },
  { value: "name_asc", label: "companies.sortNameAsc" },
  { value: "name_desc", label: "companies.sortNameDesc" },
  { value: "annualRevenue_desc", label: "companies.sortRevenueDesc" },
  { value: "annualRevenue_asc", label: "companies.sortRevenueAsc" },
];

const SORT_VALUES = new Set<CompanySort>(SORT_OPTIONS.map(({ value }) => value));

function parseSort(value: unknown): CompanySort | null {
  return typeof value === "string" && SORT_VALUES.has(value as CompanySort) ? (value as CompanySort) : null;
}

function errorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return "Request failed";
}

function responsePage(data: CompaniesListResponse, query: CompanyListQuery) {
  return data.page ?? {
    offset: query.offset,
    limit: query.limit,
    total: data.companies.length,
    hasMore: false,
  };
}

export function CompaniesClient({ workspaceKey = "" }: { workspaceKey?: string }) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(() => parseCompanyListQuery(searchParams), [searchParams]);
  const apiQuery = useMemo(
    () => toCompanyApiParams(query).toString(),
    [query.q, query.industry, query.sort, query.offset, query.limit],
  );
  const listKey = companyListQueryKey(query, workspaceKey);
  const previewId = searchParams.get("preview");

  const [companies, setCompanies] = useState<CompanyRead[] | null>(null);
  const [page, setPage] = useState<CompaniesListResponse["page"]>(undefined);
  const [facets, setFacets] = useState<CompaniesListResponse["facets"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [qDraft, setQDraft] = useState(query.q);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileIndustry, setMobileIndustry] = useState(query.industry);
  const [mobileSort, setMobileSort] = useState<CompanySort | null>(query.sort);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");
  const [reloadVersion, setReloadVersion] = useState(0);
  const requestGeneration = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousListKey = useRef(listKey);
  const previousPreviewId = useRef<string | null>(previewId);

  const updateUrl = useCallback(
    (patch: Partial<CompanyListQuery>, mode: "push" | "replace" = "push") => {
      const next = new URLSearchParams(searchParams.toString());
      if ("q" in patch) {
        if (patch.q) next.set("q", patch.q);
        else next.delete("q");
      }
      if ("industry" in patch) {
        if (patch.industry) next.set("industry", patch.industry);
        else next.delete("industry");
      }
      if ("sort" in patch) {
        if (patch.sort) next.set("sort", patch.sort);
        else next.delete("sort");
      }
      if ("offset" in patch) {
        if (patch.offset && patch.offset > 0) next.set("offset", String(patch.offset));
        else next.delete("offset");
      }
      if ("limit" in patch) next.set("limit", String(patch.limit));
      if (["q", "industry", "sort", "offset"].some((key) => key in patch)) next.delete("preview");
      const target = `${pathname}${next.toString() ? `?${next.toString()}` : ""}`;
      if (mode === "replace") router.replace(target, { scroll: false });
      else router.push(target, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openPreview = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("preview", id);
      const target = `${pathname}?${next.toString()}`;
      if (previewId) router.replace(target, { scroll: false });
      else router.push(target, { scroll: false });
    },
    [pathname, previewId, router, searchParams],
  );

  const closePreview = useCallback(() => {
    if (!previewId) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("preview");
    const target = `${pathname}${next.toString() ? `?${next.toString()}` : ""}`;
    router.replace(target, { scroll: false });
  }, [pathname, previewId, router, searchParams]);

  useEffect(() => {
    const closedPreviewId = previousPreviewId.current && !previewId ? previousPreviewId.current : null;
    previousPreviewId.current = previewId;
    if (!closedPreviewId) return;

    // A full-detail navigation can remount the list before the drawer closes,
    // so the shared focus scope may no longer have the original button node.
    // Restore only to a currently rendered readable-id trigger; otherwise the
    // Drawer scope keeps its safe main/list fallback for deep links and redacted rows.
    const frame = window.requestAnimationFrame(() => {
      const hasVisibleModal = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].some((dialog) => {
        if (dialog.hidden || dialog.getAttribute("aria-hidden") === "true") return false;
        const style = window.getComputedStyle(dialog);
        return style.display !== "none" && style.visibility !== "hidden" && dialog.getClientRects().length > 0;
      });
      if (hasVisibleModal) return;
      const trigger = [...document.querySelectorAll<HTMLButtonElement>("[data-preview-trigger-id]")]
        .find((candidate) => candidate.dataset.previewTriggerId === closedPreviewId);
      if (trigger?.isConnected) trigger.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [previewId]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    setQDraft(query.q);
    setMobileIndustry(query.industry);
    setMobileSort(query.sort);
  }, [query.q, query.industry, query.sort]);

  useEffect(() => {
    if (searchParams.get("limit") === "50") return;
    updateUrl({ limit: 50 }, "replace");
  }, [searchParams, updateUrl]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  useEffect(() => {
    const listChanged = previousListKey.current !== listKey;
    previousListKey.current = listKey;
    setSelectedIds(new Set());
    setExportOpen(false);
    setMobileFiltersOpen(false);
    if (listChanged && previewId) closePreview();
  }, [listKey]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    setCompanies(null);
    setPage(undefined);
    setFacets(undefined);

    fetch(`/api/companies?${apiQuery}`, { signal: controller.signal })
      .then(async (res) => {
        const body: unknown = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errorMessage(body));
        return body as CompaniesListResponse;
      })
      .then((data) => {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        if (!Array.isArray(data.companies)) throw new Error("Invalid companies response");
        setCompanies(data.companies);
        setPage(responsePage(data, query));
        setFacets(data.facets);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setError(reason instanceof Error ? reason.message : "Request failed");
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });

    return () => controller.abort();
  }, [listKey, reloadVersion]);

  const pageMeta = page ?? {
    offset: query.offset,
    limit: query.limit,
    total: companies?.length ?? 0,
    hasMore: false,
  };
  const total = pageMeta.total;
  const emptyPage = Boolean(companies && companies.length === 0 && total > 0);
  const lastPageOffset = total > 0 ? Math.max(0, Math.floor((total - 1) / query.limit) * query.limit) : 0;
  const hasFilters = Boolean(query.q || query.industry);
  const industries = useMemo(() => {
    const values = new Set(facets?.industries ?? []);
    if (query.industry) values.add(query.industry);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [facets?.industries, query.industry]);
  const selectedOnPage = useMemo(() => {
    const ids = new Set((companies ?? []).flatMap((company) => (typeof company.id === "string" ? [company.id] : [])));
    return [...selectedIds].filter((id) => ids.has(id));
  }, [companies, selectedIds]);
  const currentView = useMemo<ViewConfig>(
    () => ({
      filters: { q: query.q || undefined, industry: query.industry || undefined },
      sort: query.sort ?? undefined,
    }),
    [query.q, query.industry, query.sort],
  );
  const exportUrls = useMemo(
    () => ({
      selected: buildCompanyExportUrl("selected", query, selectedOnPage),
      filtered: buildCompanyExportUrl("filtered", query, []),
      all: buildCompanyExportUrl("all", query, []),
    }),
    [query, selectedOnPage],
  );

  const cancelSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
  };

  const scheduleSearch = (value: string) => {
    setQDraft(value);
    cancelSearch();
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      setActiveViewId(null);
      updateUrl({ q: value.trim(), offset: 0 });
    }, 150);
  };

  const applyFilters = (patch: Partial<CompanyListQuery>) => {
    cancelSearch();
    setActiveViewId(null);
    const pageOnly = Object.keys(patch).length === 1 && "offset" in patch;
    const nextPatch: Partial<CompanyListQuery> = { ...patch };
    if (!pageOnly) nextPatch.offset = 0;
    // A filter or page action can happen before the search debounce fires.
    // Commit the visible draft first so the action does not resurrect the old q.
    if (!("q" in patch) && qDraft.trim() !== query.q) {
      nextPatch.q = qDraft.trim();
      nextPatch.offset = 0;
    }
    updateUrl(nextPatch);
  };

  const clearFilters = () => {
    cancelSearch();
    setQDraft("");
    setActiveViewId(null);
    updateUrl({ q: "", industry: "", sort: null, offset: 0 });
  };

  const applySavedView = (view: SavedView | null) => {
    cancelSearch();
    const filters = view?.config.filters ?? {};
    const q = typeof filters.q === "string" ? filters.q : "";
    const industry = typeof filters.industry === "string" ? filters.industry : "";
    setQDraft(q);
    setActiveViewId(view?.id ?? null);
    updateUrl({ q, industry, sort: parseSort(view?.config.sort), offset: 0 });
  };

  const reload = () => setReloadVersion((value) => value + 1);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("companies.title")}
        subtitle={companies ? t("companies.subtitle", { count: total }) : undefined}
        actions={
          <>
            <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
              <DropdownMenuTrigger asChild>
                <button type="button" className="btn-ghost">
                  <IconDownload width={15} height={15} />
                  <span>{t("companies.export")}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  asChild
                  disabled={selectedOnPage.length === 0}
                  onSelect={() => setExportOpen(false)}
                >
                  <a href={exportUrls.selected} download>
                    {t("companies.exportSelected")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild onSelect={() => setExportOpen(false)}>
                  <a href={exportUrls.filtered} download>
                    {t("companies.exportFiltered")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild onSelect={() => setExportOpen(false)}>
                  <a href={exportUrls.all} download>
                    {t("companies.exportAll")}
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">{t("companies.new")}</span>
              <span className="sm:hidden">{t("companies.newShort")}</span>
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] max-w-xl grow">
          <span className="sr-only">{t("companies.searchLabel")}</span>
          <IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={qDraft}
            onChange={(event) => scheduleSearch(event.target.value)}
            placeholder={t("companies.searchPlaceholder")}
            aria-label={t("companies.searchLabel")}
            className="input w-full !pl-9"
          />
        </label>
        <div className="hidden items-center gap-2 sm:flex">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span>{t("companies.industry")}</span>
            <Select
              value={query.industry}
              aria-label={t("companies.industry")}
              onValueChange={(value) => applyFilters({ industry: value })}
              className="input h-9 min-w-36 py-1"
              options={[
                { value: "", label: t("companies.allIndustries") },
                ...industries.map((industry) => ({ value: industry, label: industry })),
              ]}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span>{t("companies.sort")}</span>
            <Select
              value={query.sort ?? "updatedAt_desc"}
              aria-label={t("companies.sort")}
              onValueChange={(value) => applyFilters({ sort: parseSort(value) })}
              className="input h-9 min-w-44 py-1"
              options={SORT_OPTIONS.map(({ value, label }) => ({ value, label: t(label) }))}
            />
          </label>
        </div>
        <div className="sm:hidden">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setMobileIndustry(query.industry);
              setMobileSort(query.sort);
              setMobileFiltersOpen(true);
            }}
          >
            {t("companies.filters")}{hasFilters ? ` (${Number(Boolean(query.q)) + Number(Boolean(query.industry))})` : ""}
          </button>
        </div>
      </div>

      <SavedViewsBar entity="companies" current={currentView} activeId={activeViewId} onApply={applySavedView} />

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
          <div>
            <p className="font-medium">{t("companies.errorTitle")}</p>
            <p className="text-ink-muted">{t("companies.errorHint")}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={reload}>{t("companies.retry")}</button>
        </div>
      )}

      {loading && !companies && !error ? <Spinner /> : null}

      {companies && companies.length === 0 ? (
        total > 0 ? (
          <EmptyState title={t("companies.emptyPageTitle")} hint={t("companies.emptyPageHint")} />
        ) : hasFilters ? (
          <EmptyState
            title={t("companies.noResultsTitle")}
            hint={t("companies.noResultsHint")}
            action={<button type="button" onClick={clearFilters} className="btn-ghost">{t("companies.clearFilters")}</button>}
          />
        ) : (
          <EmptyState
            title={t("companies.noDataTitle")}
            hint={t("companies.noDataHint")}
            action={<button type="button" onClick={() => setShowNew(true)} className="btn-primary"><IconPlus width={15} height={15} /> {t("companies.new")}</button>}
          />
        )
      ) : null}

      {companies && (companies.length > 0 || emptyPage) ? (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span aria-live="polite">{t("companies.selected", { count: selectedOnPage.length })}</span>
            <span>{t("companies.pageSummary", {
              from: companies.length === 0 ? 0 : query.offset + 1,
              to: companies.length === 0 ? 0 : Math.min(query.offset + companies.length, total),
              total,
            })}</span>
          </div>
          {companies.length > 0 ? (
            <CompaniesTable
              companies={companies}
              selectedIds={selectedIds}
              onPreview={openPreview}
              onToggle={(id, checked) => setSelectedIds((current) => {
                const next = new Set(current);
                if (checked) next.add(id);
                else next.delete(id);
                return next;
              })}
              onToggleAll={(checked) => setSelectedIds((current) => {
                const next = new Set(current);
                for (const company of companies) {
                  if (typeof company.id !== "string" || !company.id) continue;
                  if (checked) next.add(company.id);
                  else next.delete(company.id);
                }
                return next;
              })}
            />
          ) : null}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              disabled={query.offset <= 0 || loading}
              onClick={() => applyFilters({ offset: emptyPage ? lastPageOffset : Math.max(0, query.offset - query.limit) })}
            >
              {t("companies.previousPage")}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!pageMeta.hasMore || loading}
              onClick={() => applyFilters({ offset: query.offset + query.limit })}
            >
              {t("companies.nextPage")}
            </button>
          </div>
        </>
      ) : null}

      <Modal title={t("companies.filters")} open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)}>
        <div className="grid gap-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("companies.industry")}</span>
            <Select
              value={mobileIndustry}
              aria-label={t("companies.industry")}
              onValueChange={setMobileIndustry}
              className="input w-full"
              options={[
                { value: "", label: t("companies.allIndustries") },
                ...industries.map((industry) => ({ value: industry, label: industry })),
              ]}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{t("companies.sort")}</span>
            <Select
              value={mobileSort ?? "updatedAt_desc"}
              aria-label={t("companies.sort")}
              onValueChange={(value) => setMobileSort(parseSort(value))}
              className="input w-full"
              options={SORT_OPTIONS.map(({ value, label }) => ({ value, label: t(label) }))}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={clearFilters}>{t("companies.resetFilters")}</button>
            <button type="button" className="btn-primary" onClick={() => { applyFilters({ industry: mobileIndustry, sort: mobileSort }); setMobileFiltersOpen(false); }}>{t("companies.applyFilters")}</button>
          </div>
        </div>
      </Modal>

      <Modal title={t("companies.new")} open={showNew} onClose={() => setShowNew(false)} wide>
        <CompanyForm onSaved={() => { setShowNew(false); reload(); }} />
      </Modal>

      <CompanyPreview id={previewId} onClose={closePreview} />
    </div>
  );
}

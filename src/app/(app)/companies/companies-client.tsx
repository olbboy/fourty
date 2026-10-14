"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CompanyListQuery,
  CompanyRead,
  CompanySort,
  CompaniesListResponse,
} from "@/lib/types";
import { EmptyState, Modal, PageHeader, Spinner } from "@/components/ui";
import { IconDownload, IconPlus, IconSearch } from "@/components/icons";
import { CompanyPreview } from "@/components/company-preview";
import {
  SavedViewsBar,
  type SavedView,
  type ViewConfig,
} from "@/components/saved-views";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildCompanyExportUrl,
  companyListQueryKey,
  parseCompanyListQuery,
  toCompanyApiParams,
} from "@/lib/company-list-query";
import { useT } from "@/lib/i18n/provider";
import { useFieldAccess } from "@/hooks/use-field-access";
import { BulkBar, OwnerFilter, bulkDelete, reassignOwner, useOwnerPeople } from "@/components/owner-controls";
import { ownerOf } from "@/lib/owner-display";
import type { MessageKey } from "@/lib/i18n";
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

const SORT_VALUES = new Set<CompanySort>(
  SORT_OPTIONS.map(({ value }) => value),
);
const ALL_INDUSTRIES = "__all__";

function parseSort(value: unknown): CompanySort | null {
  return typeof value === "string" && SORT_VALUES.has(value as CompanySort)
    ? (value as CompanySort)
    : null;
}

function errorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "Request failed";
}

function responsePage(data: CompaniesListResponse, query: CompanyListQuery) {
  return (
    data.page ?? {
      offset: query.offset,
      limit: query.limit,
      total: data.companies.length,
      hasMore: false,
    }
  );
}

export function CompaniesClient({
  workspaceKey = "",
}: {
  workspaceKey?: string;
}) {
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => parseCompanyListQuery(searchParams),
    [searchParams],
  );
  const apiQuery = useMemo(
    () => toCompanyApiParams(query).toString(),
    [query.q, query.industry, query.ownerId, query.sort, query.offset, query.limit],
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
  const people = useOwnerPeople();
  const access = useFieldAccess("companies");
  const canBulkAssign = access.canUpdate && !access.hidden.has("ownerId") && !access.blockedWrites.has("ownerId");
  const requestGeneration = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousListKey = useRef(listKey);

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
      if ("ownerId" in patch) {
        if (patch.ownerId) next.set("ownerId", patch.ownerId);
        else next.delete("ownerId");
      }
      if ("sort" in patch) {
        if (patch.sort) next.set("sort", patch.sort);
        else next.delete("sort");
      }
      if ("offset" in patch) {
        if (patch.offset && patch.offset > 0)
          next.set("offset", String(patch.offset));
        else next.delete("offset");
      }
      if ("limit" in patch) next.set("limit", String(patch.limit));
      if (["q", "industry", "ownerId", "sort", "offset"].some((key) => key in patch))
        next.delete("preview");
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
    if (!listChanged) return;
    setSelectedIds(new Set());
    setExportOpen(false);
    setMobileFiltersOpen(false);
    if (previewId) closePreview();
  }, [listKey, previewId, closePreview]);

  // Preview-only URL changes keep apiQuery/listKey stable; query is intentionally
  // omitted so opening the drawer cannot refetch or clear the current list.
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
        if (
          controller.signal.aborted ||
          generation !== requestGeneration.current
        )
          return;
        if (!Array.isArray(data.companies))
          throw new Error("Invalid companies response");
        setCompanies(data.companies);
        setPage(responsePage(data, query));
        setFacets(data.facets);
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          generation !== requestGeneration.current
        )
          return;
        setError(reason instanceof Error ? reason.message : "Request failed");
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoading(false);
      });

    return () => controller.abort();
  }, [apiQuery, listKey, reloadVersion]);

  const pageMeta = page ?? {
    offset: query.offset,
    limit: query.limit,
    total: companies?.length ?? 0,
    hasMore: false,
  };
  const total = pageMeta.total;
  const emptyPage = Boolean(companies && companies.length === 0 && total > 0);
  const lastPageOffset =
    total > 0
      ? Math.max(0, Math.floor((total - 1) / query.limit) * query.limit)
      : 0;
  const hasFilters = Boolean(query.q || query.industry || query.ownerId);
  const industries = useMemo(() => {
    const values = new Set(facets?.industries ?? []);
    if (query.industry) values.add(query.industry);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [facets?.industries, query.industry]);
  const selectedOnPage = useMemo(() => {
    const ids = new Set(
      (companies ?? []).flatMap((company) =>
        typeof company.id === "string" ? [company.id] : [],
      ),
    );
    return [...selectedIds].filter((id) => ids.has(id));
  }, [companies, selectedIds]);
  const currentView = useMemo<ViewConfig>(
    () => ({
      filters: {
        q: query.q || undefined,
        industry: query.industry || undefined,
        ownerId: query.ownerId || undefined,
      },
      sort: query.sort ?? undefined,
    }),
    [query.q, query.industry, query.ownerId, query.sort],
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
    setMobileFiltersOpen(false);
    updateUrl({ q: "", industry: "", ownerId: "", sort: null, offset: 0 });
  };

  const applySavedView = (view: SavedView | null) => {
    cancelSearch();
    const filters = view?.config.filters ?? {};
    const q = typeof filters.q === "string" ? filters.q : "";
    const industry =
      typeof filters.industry === "string" ? filters.industry : "";
    const ownerId = typeof filters.ownerId === "string" ? filters.ownerId : "";
    setQDraft(q);
    setActiveViewId(view?.id ?? null);
    updateUrl({ q, industry, ownerId, sort: parseSort(view?.config.sort), offset: 0 });
  };

  const reload = () => setReloadVersion((value) => value + 1);

  const renderIndustrySelect = (
    value: string,
    onValueChange: (value: string) => void,
    className?: string,
  ) => (
    <Select
      value={value || ALL_INDUSTRIES}
      onValueChange={(next) => {
        const normalized = next ?? ALL_INDUSTRIES;
        onValueChange(normalized === ALL_INDUSTRIES ? "" : normalized);
      }}
    >
      <SelectTrigger aria-label={t("companies.industry")} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_INDUSTRIES}>
          {t("companies.allIndustries")}
        </SelectItem>
        {industries.map((industry) => (
          <SelectItem key={industry} value={industry}>
            {industry}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const renderSortSelect = (
    value: CompanySort | null,
    onValueChange: (value: CompanySort | null) => void,
    className?: string,
  ) => (
    <Select
      value={value ?? "updatedAt_desc"}
      onValueChange={(next) => onValueChange(parseSort(next))}
    >
      <SelectTrigger aria-label={t("companies.sort")} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map(({ value: sortValue, label }) => (
          <SelectItem key={sortValue} value={sortValue}>
            {t(label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("companies.title")}
        subtitle={
          companies ? t("companies.subtitle", { count: total }) : undefined
        }
        actions={
          <>
            <DropdownMenu open={exportOpen} onOpenChange={setExportOpen}>
              <DropdownMenuTrigger
                render={<Button variant="outline" type="button" />}
              >
                <IconDownload width={15} height={15} />
                <span>{t("companies.export")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  disabled={selectedOnPage.length === 0}
                  render={<a href={exportUrls.selected} download />}
                  onClick={() => setExportOpen(false)}
                >
                  {t("companies.exportSelected")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<a href={exportUrls.filtered} download />}
                  onClick={() => setExportOpen(false)}
                >
                  {t("companies.exportFiltered")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={<a href={exportUrls.all} download />}
                  onClick={() => setExportOpen(false)}
                >
                  {t("companies.exportAll")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">{t("companies.new")}</span>
              <span className="sm:hidden">{t("companies.newShort")}</span>
            </Button>
          </>
        }
      />

      <SavedViewsBar
        entity="companies"
        current={currentView}
        activeId={activeViewId}
        onApply={applySavedView}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] max-w-xl grow">
          <span className="sr-only">{t("companies.searchLabel")}</span>
          <IconSearch
            width={15}
            height={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <Input
            value={qDraft}
            onChange={(event) => scheduleSearch(event.target.value)}
            placeholder={t("companies.searchPlaceholder")}
            aria-label={t("companies.searchLabel")}
            className="min-h-11 w-full !pl-9 sm:min-h-0"
          />
        </label>
        <div className="hidden items-center gap-2 sm:flex">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span>{t("companies.industry")}</span>
            {renderIndustrySelect(
              query.industry,
              (value) => applyFilters({ industry: value }),
              "h-9 !w-36",
            )}
          </label>
          <OwnerFilter value={query.ownerId} people={people} onChange={(value) => applyFilters({ ownerId: value })} />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <span>{t("companies.sort")}</span>
            {renderSortSelect(
              query.sort,
              (value) => applyFilters({ sort: value }),
              "h-9 !w-44",
            )}
          </label>
        </div>
        <div className="sm:hidden">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:min-h-0"
            onClick={() => {
              setMobileIndustry(query.industry);
              setMobileSort(query.sort);
              setMobileFiltersOpen(true);
            }}
          >
            {t("companies.filters")}
            {hasFilters
              ? ` (${Number(Boolean(query.q)) + Number(Boolean(query.industry)) + Number(Boolean(query.ownerId))})`
              : ""}
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm"
        >
          <div>
            <p className="font-medium">{t("companies.errorTitle")}</p>
            <p className="text-ink-muted">{t("companies.errorHint")}</p>
          </div>
          <Button type="button" variant="outline" onClick={reload}>
            {t("companies.retry")}
          </Button>
        </div>
      )}

      {loading && !companies && !error ? <Spinner /> : null}

      {companies && companies.length === 0 ? (
        total > 0 ? (
          <EmptyState
            title={t("companies.emptyPageTitle")}
            hint={t("companies.emptyPageHint")}
          />
        ) : hasFilters ? (
          <EmptyState
            title={t("companies.noResultsTitle")}
            hint={t("companies.noResultsHint")}
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                {t("companies.clearFilters")}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t("companies.noDataTitle")}
            hint={t("companies.noDataHint")}
            action={
              <Button type="button" onClick={() => setShowNew(true)}>
                <IconPlus width={15} height={15} /> {t("companies.new")}
              </Button>
            }
          />
        )
      ) : null}

      {companies && (companies.length > 0 || emptyPage) ? (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
            <span aria-live="polite">
              {t("companies.selected", { count: selectedOnPage.length })}
            </span>
            <span>
              {t("companies.pageSummary", {
                from: companies.length === 0 ? 0 : query.offset + 1,
                to:
                  companies.length === 0
                    ? 0
                    : Math.min(query.offset + companies.length, total),
                total,
              })}
            </span>
          </div>
          {companies.length > 0 ? (
            <>
            <BulkBar
              // The selection itself is for export too; the bar only for a role that may change them.
              count={canBulkAssign || access.canDelete ? selectedOnPage.length : 0}
              // The selection count is already announced above the table.
              label=""
              people={people}
              onClear={() => setSelectedIds(new Set())}
              onReassign={
                canBulkAssign
                  ? async (ownerId) => {
                      const ok = await reassignOwner("companies", selectedOnPage, ownerId);
                      if (ok) reload();
                      return ok;
                    }
                  : undefined
              }
              onDelete={
                access.canDelete
                  ? async () => {
                      const ok = await bulkDelete("companies", selectedOnPage);
                      if (ok) {
                        setSelectedIds(new Set());
                        reload();
                      }
                      return ok;
                    }
                  : undefined
              }
            />
            <CompaniesTable
              companies={companies}
              selectedIds={selectedIds}
              ownerName={(company) => ownerOf(company, people, t)}
              onPreview={openPreview}
              onToggle={(id, checked) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
              onToggleAll={(checked) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  for (const company of companies) {
                    if (typeof company.id !== "string" || !company.id) continue;
                    if (checked) next.add(company.id);
                    else next.delete(company.id);
                  }
                  return next;
                })
              }
            />
            </>
          ) : null}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={query.offset <= 0 || loading}
              onClick={() =>
                applyFilters({
                  offset: emptyPage
                    ? lastPageOffset
                    : Math.max(0, query.offset - query.limit),
                })
              }
            >
              {t("companies.previousPage")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!pageMeta.hasMore || loading}
              onClick={() =>
                applyFilters({ offset: query.offset + query.limit })
              }
            >
              {t("companies.nextPage")}
            </Button>
          </div>
        </>
      ) : null}

      <Modal
        title={t("companies.filters")}
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
      >
        <div className="grid gap-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {t("companies.industry")}
            </span>
            {renderIndustrySelect(mobileIndustry, setMobileIndustry, "!w-full")}
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              {t("companies.sort")}
            </span>
            {renderSortSelect(mobileSort, setMobileSort, "!w-full")}
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={clearFilters}>
              {t("companies.resetFilters")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                applyFilters({ industry: mobileIndustry, sort: mobileSort });
                setMobileFiltersOpen(false);
              }}
            >
              {t("companies.applyFilters")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={t("companies.new")}
        open={showNew}
        onClose={() => setShowNew(false)}
        wide
      >
        <CompanyForm
          onSaved={() => {
            setShowNew(false);
            reload();
          }}
        />
      </Modal>

      <CompanyPreview id={previewId} onClose={closePreview} />
    </div>
  );
}

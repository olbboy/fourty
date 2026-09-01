"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company } from "@/lib/types";
import { timeAgo, displayName } from "@/lib/format";
import { formatCompact } from "@/lib/currency";
import { PageHeader, Modal, EmptyState, Spinner, LoadError } from "@/components/ui";
import { IconPlus, IconDownload } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { CompanyForm } from "./company-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLocale, useT } from "@/lib/i18n/provider";

export function CompaniesClient() {
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");

  const applyView = useCallback((view: SavedView | null) => {
    setActiveView(view?.id ?? null);
    const cfg = view?.config ?? {};
    setQ(typeof cfg.filters?.q === "string" ? cfg.filters.q : "");
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    try {
      const res = await fetch(`/api/companies?${params}`);
      if (!res.ok) throw new Error("companies");
      setCompanies((await res.json()).companies);
    } catch {
      setFailed(true);
    }
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 150 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("nav.companies")}
        subtitle={companies ? t("page.companies.count", { count: companies.length }) : undefined}
        actions={
          <>
            <a href="/api/export/companies" className={cn(buttonVariants({ variant: "outline" }))}>
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">{t("action.export")}</span>
            </a>
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">{t("page.companies.new")}</span>
              <span className="sm:hidden">{t("action.new")}</span>
            </Button>
          </>
        }
      />

      <SavedViewsBar
        entity="companies"
        activeId={activeView}
        current={{ filters: q.trim() ? { q: q.trim() } : {} }}
        onApply={applyView}
      />

      <div className="mb-4">
        {/* No visible label above the box, and a placeholder is a fallback name
            at best — say what it searches. */}
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActiveView(null);
          }}
          aria-label={t("page.companies.searchAria")}
          placeholder={t("page.companies.searchPlaceholder")} className="max-w-xs" />
      </div>

      {failed ? (
        <LoadError
          onRetry={() => {
            setCompanies(null);
            void load();
          }}
        />
      ) : !companies ? (
        <Spinner />
      ) : companies.length === 0 ? (
        <EmptyState
          title={t("page.companies.empty")}
          hint={t("page.companies.emptyHint")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} /> {t("page.companies.new")}
            </Button>
          }
        />
      ) : (
        <Card size="flush">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.name")}</TableHead>
                <TableHead>{t("col.industry")}</TableHead>
                <TableHead>{t("col.size")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("col.location")}</TableHead>
                <TableHead>{t("col.revenue")}</TableHead>
                <TableHead>{t("col.updated")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => router.push(`/companies/${c.id}`)}
                  className="cursor-pointer transition hover:bg-surface-2"
                >
                  <TableCell className="font-medium">
                    {displayName(c.name)}
                    {c.domain && (
                      <span className="block text-xs font-normal text-ink-muted">{c.domain}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-muted">{c.industry ?? "—"}</TableCell>
                  <TableCell className="text-ink-muted">{c.size ?? "—"}</TableCell>
                  <TableCell className="hidden text-ink-muted lg:table-cell">
                    {[c.city, c.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {c.annualRevenue ? formatCompact(c.annualRevenue, "USD") : "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">{timeAgo(c.updatedAt, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal title={t("page.companies.newModal")} open={showNew} onClose={() => setShowNew(false)} wide>
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

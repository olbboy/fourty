"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Contact, Company } from "@/lib/types";
import { timeAgo, displayName } from "@/lib/format";
import { PageHeader, Modal, Field, StatusChip, ScoreBadge, EmptyState, Spinner, LoadError } from "@/components/ui";
import { IconPlus, IconDownload, IconUpload } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { ContactForm } from "./contact-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
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

export function ContactsClient() {
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const [lookupRetry, setLookupRetry] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(searchParams.get("new") === "1");

  // Apply a saved view's config (or reset to defaults when cleared).
  const applyView = useCallback((view: SavedView | null) => {
    setActiveView(view?.id ?? null);
    const cfg = view?.config ?? {};
    setStatus(typeof cfg.filters?.status === "string" ? cfg.filters.status : "");
    setSort(cfg.sort ?? "updatedAt");
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("sort", sort);
    try {
      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error("contacts");
      setContacts((await res.json()).contacts);
    } catch {
      setFailed(true);
    }
  }, [q, status, sort]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 150 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/companies")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setCompanies(Array.isArray(d.companies) ? d.companies : []);
        setLookupsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCompanies([]);
        setLookupsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lookupRetry]);

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("nav.contacts")}
        subtitle={contacts ? t("page.contacts.count", { count: contacts.length }) : undefined}
        actions={
          <>
            <a
              href="/api/export/contacts"
              title={t("page.contacts.exportTitle")}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">{t("action.export")}</span>
            </a>
            <Link
              href="/settings/import"
              title={t("page.contacts.importTitle")}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <IconUpload width={15} height={15} />
              <span className="hidden sm:inline">{t("action.import")}</span>
            </Link>
            <Button onClick={() => setShowNew(true)} disabled={lookupsFailed}>
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">{t("page.contacts.new")}</span>
              <span className="sm:hidden">{t("action.new")}</span>
            </Button>
          </>
        }
      />

      <SavedViewsBar
        entity="contacts"
        activeId={activeView}
        current={{ filters: status ? { status } : {}, sort }}
        onApply={applyView}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {/* A filter bar has no visible labels, so each control carries its own —
            a placeholder is a fallback name at best, and the selects have none. */}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("page.contacts.searchAria")}
          placeholder={t("page.contacts.searchPlaceholder")} className="max-w-xs" />
        <NativeSelect
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setActiveView(null);
          }}
          aria-label={t("page.contacts.filterStatus")}>
          <option value="">{t("page.contacts.allStatuses")}</option>
          <option value="lead">{t("status.lead")}</option>
          <option value="qualified">{t("status.qualified")}</option>
          <option value="customer">{t("status.customer")}</option>
          <option value="churned">{t("status.churned")}</option>
        </NativeSelect>
        <NativeSelect
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setActiveView(null);
          }}
          aria-label={t("page.contacts.sortAria")}>
          <option value="updatedAt">{t("page.contacts.sortUpdated")}</option>
          <option value="score">{t("page.contacts.sortScore")}</option>
          <option value="name">{t("page.contacts.sortName")}</option>
          <option value="createdAt">{t("page.contacts.sortNewest")}</option>
        </NativeSelect>
      </div>

      {lookupsFailed && (
        <LoadError compact onRetry={() => setLookupRetry((n) => n + 1)} />
      )}

      {failed ? (
        <LoadError
          onRetry={() => {
            setContacts(null);
            void load();
          }}
        />
      ) : !contacts ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <EmptyState
          title={t("page.contacts.empty")}
          hint={t("page.contacts.emptyHint")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} /> {t("page.contacts.new")}
            </Button>
          }
        />
      ) : (
        <Card size="flush">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.name")}</TableHead>
                <TableHead>{t("col.company")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
                <TableHead>{t("col.score")}</TableHead>
                <TableHead className="hidden lg:table-cell">{t("col.email")}</TableHead>
                <TableHead>{t("col.lastActivity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow
                  key={c.id}
                  onClick={() => router.push(`/contacts/${c.id}`)}
                  className="cursor-pointer transition hover:bg-surface-2"
                >
                  <TableCell className="font-medium">
                    {displayName(c.firstName, c.lastName)}
                    {c.jobTitle && (
                      <span className="block text-xs font-normal text-ink-muted">{c.jobTitle}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-ink-muted">{companyName(c.companyId)}</TableCell>
                  <TableCell>
                    <StatusChip status={c.status} />
                  </TableCell>
                  <TableCell>
                    <ScoreBadge score={c.score} />
                  </TableCell>
                  <TableCell className="hidden text-ink-muted lg:table-cell">{c.email ?? "—"}</TableCell>
                  <TableCell className="text-ink-muted">{timeAgo(c.lastActivityAt, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal title={t("page.contacts.newModal")} open={showNew} onClose={() => setShowNew(false)} wide>
        <ContactForm
          companies={companies}
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>
    </div>
  );
}

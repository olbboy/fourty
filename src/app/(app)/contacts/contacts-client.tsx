"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Contact, Company } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { PageHeader, Modal, Field, StatusChip, ScoreBadge, EmptyState, Spinner } from "@/components/ui";
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

export function ContactsClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
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
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("sort", sort);
    const res = await fetch(`/api/contacts?${params}`);
    if (res.ok) setContacts((await res.json()).contacts);
  }, [q, status, sort]);

  useEffect(() => {
    const t = setTimeout(load, q ? 150 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []));
  }, []);

  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Contacts"
        subtitle={contacts ? `${contacts.length} people` : undefined}
        actions={
          <>
            <a
              href="/api/export/contacts"
              title="Export CSV"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </a>
            <Link
              href="/settings/import"
              title="Import CSV"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <IconUpload width={15} height={15} />
              <span className="hidden sm:inline">Import</span>
            </Link>
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">New contact</span>
              <span className="sm:hidden">New</span>
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
          aria-label="Search contacts"
          placeholder="Search name, email, title…" className="max-w-xs" />
        <NativeSelect
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setActiveView(null);
          }}
          aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="lead">Lead</option>
          <option value="qualified">Qualified</option>
          <option value="customer">Customer</option>
          <option value="churned">Churned</option>
        </NativeSelect>
        <NativeSelect
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setActiveView(null);
          }}
          aria-label="Sort contacts">
          <option value="updatedAt">Recently updated</option>
          <option value="score">Highest score</option>
          <option value="name">Name</option>
          <option value="createdAt">Newest</option>
        </NativeSelect>
      </div>

      {!contacts ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          hint="Add your first contact or import a CSV to get going."
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} /> New contact
            </Button>
          }
        />
      ) : (
        <Card size="flush">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead>Last activity</TableHead>
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
                    {c.firstName} {c.lastName}
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
                  <TableCell className="text-ink-muted">{timeAgo(c.lastActivityAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal title="New contact" open={showNew} onClose={() => setShowNew(false)} wide>
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

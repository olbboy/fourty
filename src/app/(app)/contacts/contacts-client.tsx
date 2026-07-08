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
            <a href="/api/export/contacts" className="btn-ghost" title="Export CSV">
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </a>
            <Link href="/settings/import" className="btn-ghost" title="Import CSV">
              <IconUpload width={15} height={15} />
              <span className="hidden sm:inline">Import</span>
            </Link>
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} />
              <span className="hidden sm:inline">New contact</span>
              <span className="sm:hidden">New</span>
            </button>
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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, title…"
          className="input max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setActiveView(null);
          }}
          className="input w-auto"
        >
          <option value="">All statuses</option>
          <option value="lead">Lead</option>
          <option value="qualified">Qualified</option>
          <option value="customer">Customer</option>
          <option value="churned">Churned</option>
        </select>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setActiveView(null);
          }}
          className="input w-auto"
        >
          <option value="updatedAt">Recently updated</option>
          <option value="score">Highest score</option>
          <option value="name">Name</option>
          <option value="createdAt">Newest</option>
        </select>
      </div>

      {!contacts ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          hint="Add your first contact or import a CSV to get going."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} /> New contact
            </button>
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-line">
              <tr>
                <th className="th">Name</th>
                <th className="th">Company</th>
                <th className="th">Status</th>
                <th className="th">Score</th>
                <th className="th hidden lg:table-cell">Email</th>
                <th className="th">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/contacts/${c.id}`)}
                  className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-surface-2"
                >
                  <td className="td font-medium">
                    {c.firstName} {c.lastName}
                    {c.jobTitle && (
                      <span className="block text-xs font-normal text-ink-muted">{c.jobTitle}</span>
                    )}
                  </td>
                  <td className="td text-ink-muted">{companyName(c.companyId)}</td>
                  <td className="td">
                    <StatusChip status={c.status} />
                  </td>
                  <td className="td">
                    <ScoreBadge score={c.score} />
                  </td>
                  <td className="td hidden text-ink-muted lg:table-cell">{c.email ?? "—"}</td>
                  <td className="td text-ink-muted">{timeAgo(c.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

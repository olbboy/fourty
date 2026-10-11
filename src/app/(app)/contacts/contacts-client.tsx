"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Contact, Company } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import {
  AsyncError,
  ContextToolbar,
  EmptyState,
  Modal,
  PageHeader,
  ScoreBadge,
  Spinner,
  StatusChip,
} from "@/components/ui";
import { IconPlus, IconDownload, IconUpload } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { Select } from "@/components/select";
import { ContactForm } from "./contact-form";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isContactsResponse(value: unknown): value is { contacts: Contact[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.contacts) &&
    value.contacts.every(
      (contact) =>
        isRecord(contact) &&
        typeof contact.id === "string" &&
        typeof contact.firstName === "string" &&
        typeof contact.lastName === "string",
    )
  );
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestRef = useRef<{ controller: AbortController; generation: number } | null>(null);
  const generationRef = useRef(0);

  // Apply a saved view's config (or reset to defaults when cleared).
  const applyView = useCallback((view: SavedView | null) => {
    setActiveView(view?.id ?? null);
    const cfg = view?.config ?? {};
    setStatus(typeof cfg.filters?.status === "string" ? cfg.filters.status : "");
    setSort(cfg.sort ?? "updatedAt");
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    requestRef.current = { controller, generation };
    setLoadError(null);

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    params.set("sort", sort);

    try {
      const res = await fetch(`/api/contacts?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Contacts request failed with ${res.status}`);
      const body: unknown = await res.json();
      if (!isContactsResponse(body)) throw new Error("Contacts response was invalid");
      if (generation !== generationRef.current || controller.signal.aborted) return;
      setContacts(body.contacts);
      setLoadError(null);
    } catch (error) {
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setLoadError(error instanceof Error ? error.message : "Unable to load contacts");
    } finally {
      if (requestRef.current?.generation === generation) requestRef.current = null;
    }
  }, [q, status, sort]);

  useEffect(() => {
    const t = setTimeout(load, q ? 150 : 0);
    return () => {
      clearTimeout(t);
      requestRef.current?.controller.abort();
    };
  }, [load, q]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      requestRef.current?.controller.abort();
    },
    [],
  );

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
            <a href="/api/export/contacts" className="btn-ghost min-h-11 sm:min-h-0" title="Export CSV">
              <IconDownload width={15} height={15} />
              <span className="hidden sm:inline">Export</span>
            </a>
            <Link href="/settings/import" className="btn-ghost min-h-11 sm:min-h-0" title="Import CSV">
              <IconUpload width={15} height={15} />
              <span className="hidden sm:inline">Import</span>
            </Link>
            <button onClick={() => setShowNew(true)} className="btn-primary min-h-11 sm:min-h-0">
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

      <ContextToolbar
        className="mb-4"
        search={
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, title…"
            aria-label="Search contacts"
            className="input min-h-11 w-full sm:min-h-0 md:max-w-sm"
          />
        }
        filters={
          <>
            <Select
              aria-label="Filter by status"
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setActiveView(null);
              }}
              className="min-h-11 !w-full sm:!w-[11rem] sm:min-h-0 md:!w-[12rem]"
              options={[
                { value: "", label: "All statuses" },
                { value: "lead", label: "Lead" },
                { value: "qualified", label: "Qualified" },
                { value: "customer", label: "Customer" },
                { value: "churned", label: "Churned" },
              ]}
            />
            <Select
              aria-label="Sort contacts"
              value={sort}
              onValueChange={(value) => {
                setSort(value);
                setActiveView(null);
              }}
              className="min-h-11 !w-full sm:!w-[12rem] sm:min-h-0 md:!w-[13rem]"
              options={[
                { value: "updatedAt", label: "Recently updated" },
                { value: "score", label: "Highest score" },
                { value: "name", label: "Name" },
                { value: "createdAt", label: "Newest" },
              ]}
            />
          </>
        }
      />

      {loadError ? (
        <AsyncError
          message="We couldn't load contacts."
          hint="Check your connection and try again."
          onRetry={() => void load()}
        />
      ) : !contacts ? (
        <Spinner label="Loading contacts" />
      ) : contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          hint="Add your first contact or import a CSV to get going."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary min-h-11 sm:min-h-0">
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
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest("a,button,input,select,textarea,[role='button']")
                    ) {
                      return;
                    }
                    router.push(`/contacts/${c.id}`);
                  }}
                  className="cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-surface-2"
                >
                  <td className="td font-medium">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
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
      {contacts && contacts.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted sm:hidden">Swipe horizontally to see more contact fields.</p>
      )}

      <Modal title="New contact" open={showNew} onClose={() => setShowNew(false)} wide>
        <ContactForm
          companies={companies}
          onSaved={() => {
            setShowNew(false);
            void load();
          }}
        />
      </Modal>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Contact, Company, Deal, Pipeline } from "@/lib/types";
import { timeAgo, formatDate } from "@/lib/format";
import { Modal, StatusChip, ScoreBadge, Avatar, Spinner } from "@/components/ui";
import { Timeline, NotesPanel, TasksPanel, LogTouchpoint } from "@/components/record-panels";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { IconEdit, IconTrash } from "@/components/icons";
import { ContactForm } from "../contact-form";
import { formatMoney } from "@/lib/currency";

export function ContactDetail({ id }: { id: string }) {
  const router = useRouter();
  const defs = useCustomFields("contact");
  const [contact, setContact] = useState<Contact | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${id}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    if (res.ok) setContact((await res.json()).contact);
    const d = await fetch(`/api/deals?contactId=${id}`);
    if (d.ok) setDeals((await d.json()).deals);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/companies")
      .then((r) => r.json())
      .then((d) => setCompanies(d.companies ?? []));
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((d) => setPipelines(d.pipelines ?? []));
  }, [load]);

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    load();
  }, [load]);

  if (missing)
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Contact not found. <Link href="/contacts" className="text-accent-600 underline">Back to contacts</Link>
      </p>
    );
  if (!contact) return <Spinner />;

  const company = companies.find((c) => c.id === contact.companyId);
  const stageOf = (deal: Deal) =>
    pipelines.flatMap((p) => p.stages).find((s) => s.id === deal.stageId);

  async function remove() {
    if (!confirm(`Delete ${contact!.firstName} ${contact!.lastName}? This cannot be undone.`))
      return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    router.push("/contacts");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={`${contact.firstName} ${contact.lastName}`} size={11} />
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              {contact.firstName} {contact.lastName}
            </h1>
            <p className="text-sm text-ink-muted">
              {contact.jobTitle ?? "—"}
              {company && (
                <>
                  {" · "}
                  <Link href={`/companies/${company.id}`} className="text-accent-600 hover:underline dark:text-accent-400">
                    {company.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={contact.status} />
          <ScoreBadge score={contact.score} />
          <button onClick={() => setEditing(true)} className="btn-ghost">
            <IconEdit width={15} height={15} /> Edit
          </button>
          <button onClick={remove} className="btn-ghost !text-red-500">
            <IconTrash width={15} height={15} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: profile */}
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Details</h2>
            {[
              ["Email", contact.email],
              ["Phone", contact.phone],
              ["Source", contact.source],
              ["LinkedIn", contact.linkedin],
              ["City", contact.city],
              ["Country", contact.country],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {label}
                </p>
                <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
              </div>
            ))}
            <CustomFieldsDisplay defs={defs} values={contact.custom} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Last activity
              </p>
              <p className="mt-0.5 text-sm">{timeAgo(contact.lastActivityAt)}</p>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Log a touchpoint</h2>
            <LogTouchpoint entityType="contact" entityId={id} onLogged={bump} />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Deals</h2>
            {deals.length === 0 && <p className="text-sm text-ink-muted">No deals.</p>}
            <div className="space-y-2">
              {deals.map((d) => {
                const stage = stageOf(d);
                return (
                  <Link
                    key={d.id}
                    href={`/deals/${d.id}`}
                    className="block rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
                  >
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-ink-muted">
                      {formatMoney(d.amount, d.currency)}
                      {stage && (
                        <span className="ml-2 font-medium" style={{ color: stage.color }}>
                          {stage.name}
                        </span>
                      )}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Middle: timeline */}
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <Timeline entityType="contact" entityId={id} refreshKey={refreshKey} />
        </div>

        {/* Right: notes + tasks */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Notes</h2>
            <NotesPanel entityType="contact" entityId={id} onChanged={bump} />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
            <TasksPanel entityType="contact" entityId={id} onChanged={bump} />
          </div>
        </div>
      </div>

      <Modal title="Edit contact" open={editing} onClose={() => setEditing(false)} wide>
        <ContactForm
          contact={contact}
          companies={companies}
          onSaved={() => {
            setEditing(false);
            bump();
          }}
        />
      </Modal>
      <p className="mt-6 text-xs text-ink-muted">
        Created {formatDate(contact.createdAt)} · Updated {timeAgo(contact.updatedAt)}
      </p>
    </div>
  );
}

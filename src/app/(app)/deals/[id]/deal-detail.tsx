"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { formatMoney, convert } from "@/lib/currency";
import { timeAgo, formatDate } from "@/lib/format";
import { Modal, Spinner, Avatar } from "@/components/ui";
import { Timeline, NotesPanel, TasksPanel } from "@/components/record-panels";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { IconEdit, IconTrash } from "@/components/icons";
import { DealForm } from "../deal-form";

export function DealDetail({ id }: { id: string }) {
  const router = useRouter();
  const defs = useCustomFields("deal");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals/${id}`);
    if (res.status === 404) {
      setMissing(true);
      return;
    }
    if (res.ok) setDeal((await res.json()).deal);
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/pipelines").then((r) => r.json()).then((d) => setPipelines(d.pipelines ?? []));
    fetch("/api/companies").then((r) => r.json()).then((d) => setCompanies(d.companies ?? []));
    fetch("/api/contacts").then((r) => r.json()).then((d) => setContacts(d.contacts ?? []));
  }, [load]);

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    load();
  }, [load]);

  if (missing)
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Deal not found.{" "}
        <Link href="/deals" className="text-accent-600 underline">
          Back to deals
        </Link>
      </p>
    );
  if (!deal) return <Spinner />;

  const pipeline = pipelines.find((p) => p.id === deal.pipelineId);
  const stage = pipeline?.stages.find((s) => s.id === deal.stageId);
  const company = companies.find((c) => c.id === deal.companyId);
  const contact = contacts.find((c) => c.id === deal.contactId);
  const weighted = stage ? convert(deal.amount, deal.currency, "USD") * (stage.winProbability / 100) : 0;
  const daysInStage = Math.floor((Date.now() - deal.stageEnteredAt) / 86400000);

  async function moveTo(stageId: string) {
    await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    bump();
  }

  async function remove() {
    if (!confirm(`Delete deal "${deal!.name}"?`)) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    router.push("/deals");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{deal.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="text-base font-semibold text-accent-600 dark:text-accent-400">
              {formatMoney(deal.amount, deal.currency)}
            </span>
            {deal.currency !== "USD" && (
              <span className="ml-1.5">(≈ {formatMoney(convert(deal.amount, deal.currency, "USD"), "USD")})</span>
            )}
            {stage?.type === "open" && (
              <span className="ml-2">
                · weighted {formatMoney(weighted, "USD")} at {stage.winProbability}%
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="btn-ghost">
            <IconEdit width={15} height={15} /> Edit
          </button>
          <button onClick={remove} className="btn-ghost !text-red-500">
            <IconTrash width={15} height={15} />
          </button>
        </div>
      </div>

      {/* Stage stepper */}
      {pipeline && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {pipeline.stages.map((s) => {
            const active = s.id === deal.stageId;
            return (
              <button
                key={s.id}
                onClick={() => !active && moveTo(s.id)}
                className={`chip cursor-pointer !px-3 !py-1.5 transition ${
                  active ? "text-white" : "border border-line text-ink-muted hover:border-accent-400"
                }`}
                style={active ? { background: s.color } : undefined}
                title={`${s.winProbability}% win probability`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Company</p>
              {company ? (
                <Link href={`/companies/${company.id}`} className="mt-0.5 block text-sm text-accent-600 hover:underline dark:text-accent-400">
                  {company.name}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm">—</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Primary contact</p>
              {contact ? (
                <Link href={`/contacts/${contact.id}`} className="mt-0.5 flex items-center gap-2 text-sm text-accent-600 hover:underline dark:text-accent-400">
                  <Avatar name={`${contact.firstName} ${contact.lastName}`} size={6} />
                  {contact.firstName} {contact.lastName}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm">—</p>
              )}
            </div>
            {[
              ["Expected close", formatDate(deal.expectedCloseDate)],
              ["Days in current stage", `${daysInStage}d`],
              ["Closed", deal.closedAt ? formatDate(deal.closedAt) : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="mt-0.5 text-sm">{value}</p>
              </div>
            ))}
            <CustomFieldsDisplay defs={defs} values={deal.custom} />
          </div>
        </div>

        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <Timeline entityType="deal" entityId={id} refreshKey={refreshKey} />
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Notes</h2>
            <NotesPanel entityType="deal" entityId={id} onChanged={bump} />
          </div>
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
            <TasksPanel entityType="deal" entityId={id} onChanged={bump} />
          </div>
        </div>
      </div>

      <Modal title="Edit deal" open={editing} onClose={() => setEditing(false)} wide>
        <DealForm
          deal={deal}
          pipelines={pipelines}
          companies={companies}
          contacts={contacts}
          onSaved={() => {
            setEditing(false);
            bump();
          }}
        />
      </Modal>
      <p className="mt-6 text-xs text-ink-muted">
        Created {formatDate(deal.createdAt)} · Updated {timeAgo(deal.updatedAt)}
      </p>
    </div>
  );
}

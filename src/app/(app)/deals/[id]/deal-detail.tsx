"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { formatMoney, convert } from "@/lib/currency";
import { timeAgo, formatDate } from "@/lib/format";
import { readableOn } from "@/lib/contrast-color";
import { Modal, Spinner, Avatar, useConfirm } from "@/components/ui";
import { NotesPanel, TasksPanel } from "@/components/record-panels";
import { RecordTabs } from "@/components/agent-panel/record-tabs";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { IconEdit, IconTrash } from "@/components/icons";
import { AgentQueue } from "@/components/agent-queue";
import { DealForm } from "../deal-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function DealDetail({ id }: { id: string }) {
  const [askConfirm, confirmDialog] = useConfirm();
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
        <Link href="/deals" className="text-accent-700 underline">
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
    const ok = await askConfirm({
      title: `Delete deal “${deal!.name}”?`,
      body: "This cannot be undone.",
    });
    if (!ok) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    router.push("/deals");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{deal.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="text-base font-semibold text-accent-700 dark:text-accent-400">
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
          <Button onClick={() => setEditing(true)} variant="outline">
            <IconEdit width={15} height={15} /> Edit
          </Button>
          {/* Icon-only, so the record has to be named in the label. */}
          <Button
            onClick={remove}
            aria-label={`Delete ${deal.name}`} variant="outline" size="icon" className="text-feedback-error">
            <IconTrash width={15} height={15} />
          </Button>
        </div>
      </div>

      {/* Stage stepper */}
      {pipeline && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {pipeline.stages.map((s) => {
            const active = s.id === deal.stageId;
            return (
              <Button
                key={s.id}
                onClick={() => !active && moveTo(s.id)}
                size="sm"
                variant="outline"
                className={`rounded-4xl text-xs ${
                  active ? "border-transparent font-semibold" : "text-ink-muted hover:border-accent-400"
                }`}
                // The fill is workspace data, so the label colour is derived
                // rather than assumed — white on an amber stage is unreadable.
                style={active ? { background: s.color, color: readableOn(s.color) } : undefined}
                title={`${s.winProbability}% win probability`}
              >
                {s.name}
              </Button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card size="flush" className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Details</h2>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Company</p>
              {company ? (
                <Link href={`/companies/${company.id}`} className="mt-0.5 block text-sm text-accent-700 hover:underline dark:text-accent-400">
                  {company.name}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm">—</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Primary contact</p>
              {contact ? (
                <Link href={`/contacts/${contact.id}`} className="mt-0.5 flex items-center gap-2 text-sm text-accent-700 hover:underline dark:text-accent-400">
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
          </Card>
        </div>

        <RecordTabs
          entityType="deal"
          entityId={id}
          refreshKey={refreshKey}
          onChanged={bump}
        />

        <div className="space-y-4">
          <AgentQueue entityType="deal" entityId={id} />
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Notes</h2>
            <NotesPanel entityType="deal" entityId={id} onChanged={bump} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Tasks</h2>
            <TasksPanel entityType="deal" entityId={id} onChanged={bump} />
          </Card>
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
      {confirmDialog}
    </div>
  );
}

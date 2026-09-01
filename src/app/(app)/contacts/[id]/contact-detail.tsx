"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Contact, Company, Deal, Pipeline } from "@/lib/types";
import { timeAgo, formatDate, displayName } from "@/lib/format";
import { Modal, StatusChip, ScoreBadge, HealthBadge, Avatar, Spinner, LoadError, useConfirm } from "@/components/ui";
import { NotesPanel, TasksPanel, LogTouchpoint } from "@/components/record-panels";
import { RecordTabs } from "@/components/agent-panel/record-tabs";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { FactsForField, useFacts } from "@/components/fact-suggestion";
import { IconEdit, IconTrash } from "@/components/icons";
import { AgentQueue } from "@/components/agent-queue";
import { NextActionCard } from "@/components/next-action";
import { daysSince, nextContactAction, visibleBool } from "@/lib/next-action";
import { pickDuplicateContacts, type DuplicateHit } from "@/lib/duplicates";
import { ContactForm } from "../contact-form";
import { formatMoney } from "@/lib/currency";
import { readableInkPair } from "@/lib/contrast-color";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";

export function ContactDetail({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const { defs, failed: fieldsFailed, retry: retryFields } = useCustomFields("contact");
  const [contact, setContact] = useState<Contact | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const [lookupRetry, setLookupRetry] = useState(0);
  const [dealsFailed, setDealsFailed] = useState(false);
  const [dupes, setDupes] = useState<DuplicateHit<Contact>[]>([]);
  const { proposed, applied: appliedFacts, failed: factsFailed, retry: retryFacts } = useFacts(
    "contact",
    id,
    refreshKey,
  );

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/contacts/${id}`);
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error("contact");
      const contact = (await res.json()).contact as Contact;
      setContact(contact);
      const candidates: Contact[] = [];
      if (contact.email) {
        const list = await fetch(`/api/contacts?q=${encodeURIComponent(contact.email)}`);
        if (list.ok) candidates.push(...(((await list.json()).contacts as Contact[]) ?? []));
      }
      if (contact.companyId && contact.firstName && contact.lastName) {
        const q = `${contact.firstName} ${contact.lastName}`.trim();
        const list = await fetch(
          `/api/contacts?q=${encodeURIComponent(q)}&companyId=${encodeURIComponent(contact.companyId)}`,
        );
        if (list.ok) candidates.push(...(((await list.json()).contacts as Contact[]) ?? []));
      }
      setDupes(pickDuplicateContacts(contact, candidates));
      try {
        const d = await fetch(`/api/deals?contactId=${id}`);
        if (!d.ok) throw new Error("deals");
        const body = await d.json();
        setDeals(Array.isArray(body.deals) ? body.deals : []);
        setDealsFailed(false);
      } catch {
        setDeals([]);
        setDealsFailed(true);
      }
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/companies"), fetch("/api/pipelines")])
      .then(async ([co, p]) => {
        if (!co.ok || !p.ok) throw new Error("lookups");
        const [companies, pipelines] = await Promise.all([co.json(), p.json()]);
        if (cancelled) return;
        setCompanies(Array.isArray(companies.companies) ? companies.companies : []);
        setPipelines(Array.isArray(pipelines.pipelines) ? pipelines.pipelines : []);
        setLookupsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCompanies([]);
        setPipelines([]);
        setLookupsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, lookupRetry]);

  const bump = useCallback(() => {
    setRefreshKey((k) => k + 1);
    load();
  }, [load]);

  if (missing)
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        {t("record.contactMissing")}{" "}
        <Link href="/contacts" className="text-accent-700 underline">{t("record.backContacts")}</Link>
      </p>
    );
  if (failed) {
    return (
      <LoadError
        onRetry={() => {
          setContact(null);
          void load();
        }}
      />
    );
  }
  if (!contact) return <Spinner />;

  const label = displayName(contact.firstName, contact.lastName);
  const company = companies.find((c) => c.id === contact.companyId);
  const stageOf = (deal: Deal) =>
    pipelines.flatMap((p) => p.stages).find((s) => s.id === deal.stageId);

  async function remove() {
    const ok = await askConfirm({
      title: t("record.deleteAria", { name: label }),
      body: t("common.confirmDelete"),
    });
    if (!ok) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    router.push("/contacts");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={label} size={11} />
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">
              {label}
            </h1>
            <p className="text-sm text-ink-muted">
              {contact.jobTitle ?? "—"}
              {company && (
                <>
                  {" · "}
                  <Link href={`/companies/${company.id}`} className="text-accent-700 hover:underline dark:text-accent-400">
                    {displayName(company.name)}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={contact.status} />
          <ScoreBadge score={contact.score} />
          <Button onClick={() => setEditing(true)} disabled={lookupsFailed} variant="outline">
            <IconEdit width={15} height={15} /> {t("action.edit")}
          </Button>
          {/* Icon-only, so the record has to be named in the label. */}
          <Button
            onClick={remove}
            aria-label={t("record.deleteAria", { name: label })} variant="outline" size="icon" className="text-feedback-error">
            <IconTrash width={15} height={15} />
          </Button>
        </div>
      </div>

      {lookupsFailed && (
        <div className="mb-4">
          <LoadError compact onRetry={() => setLookupRetry((n) => n + 1)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left: profile */}
        <div className="space-y-4">
          {dupes.length > 0 && (
            <Card size="flush" className="p-4" data-testid="duplicate-contacts">
              <h2 className="text-sm font-semibold">{t("record.dupesTitle")}</h2>
              <p className="mt-1 text-xs text-ink-muted">
                {dupes.some((d) => d.byEmail) && dupes.some((d) => d.byNameCompany)
                  ? t("record.dupesBoth")
                  : dupes.some((d) => d.byEmail)
                    ? t("record.dupesEmail")
                    : t("record.dupesName")}
              </p>
              <ul className="mt-2 space-y-1">
                {dupes.map((d) => (
                  <li key={d.contact.id}>
                    <Link href={`/contacts/${d.contact.id}`} className="text-sm text-accent-700 hover:underline dark:text-accent-400">
                      {displayName(d.contact.firstName, d.contact.lastName)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <NextActionCard
            suggestion={nextContactAction({
              status: contact.status ?? null,
              hasEmail: visibleBool(contact, "email"),
              hasPhone: visibleBool(contact, "phone"),
              hasCompany: visibleBool(contact, "companyId"),
              daysSinceLastActivity: daysSince(contact.lastActivityAt),
              openDealCount: deals.filter((d) => {
                const st = stageOf(d);
                return st ? st.type === "open" : !d.closedAt;
              }).length,
            })}
          />
          <Card size="flush" className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("record.details")}</h2>
            {/* `field` names the fact-ledger field, where there is one: an empty
                row is exactly where a suggestion belongs (ADR-018). */}
            {[
              { label: t("field.jobTitle"), value: contact.jobTitle, field: "job_title" },
              { label: t("field.company"), value: company?.name, field: "company_id" },
              { label: t("field.email"), value: contact.email },
              { label: t("field.phone"), value: contact.phone },
              { label: t("field.source"), value: contact.source },
              { label: t("field.linkedin"), value: contact.linkedin, field: "linkedin" },
              { label: t("field.city"), value: contact.city },
              { label: t("field.country"), value: contact.country },
            ].map(({ label, value, field }) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {label}
                </p>
                <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
                {field && (
                  <FactsForField
                    field={field}
                    proposed={proposed}
                    applied={appliedFacts}
                    onDecided={bump}
                  />
                )}
              </div>
            ))}
            <CustomFieldsDisplay defs={defs} values={contact.custom} failed={fieldsFailed} onRetry={retryFields} />
            {factsFailed && <LoadError compact onRetry={retryFacts} />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t("field.lastActivity")}
              </p>
              <p className="mt-0.5 text-sm">{timeAgo(contact.lastActivityAt, locale)}</p>
            </div>
          </Card>
          <AgentQueue entityType="contact" entityId={id} />
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.logTouchpoint")}</h2>
            <LogTouchpoint entityType="contact" entityId={id} onLogged={bump} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.deals")}</h2>
            {dealsFailed ? (
              <LoadError compact onRetry={() => void load()} />
            ) : (
              <>
            {deals.length === 0 && <p className="text-sm text-ink-muted">{t("record.noDeals")}</p>}
            <div className="space-y-2">
              {deals.map((d) => {
                const stage = stageOf(d);
                return (
                  <Link
                    key={d.id}
                    href={`/deals/${d.id}`}
                    className="block rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
                  >
                    <p className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{displayName(d.name)}</span>
                      <HealthBadge score={d.score} />
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatMoney(d.amount, d.currency)}
                      {stage && (
                        <span
                          className="ml-2 font-medium data-ink"
                          style={
                            {
                              "--data-ink-light": readableInkPair(stage.color).light,
                              "--data-ink-dark": readableInkPair(stage.color).dark,
                            } as React.CSSProperties
                          }
                        >
                          {stage.name}
                        </span>
                      )}
                    </p>
                  </Link>
                );
              })}
            </div>
              </>
            )}
          </Card>
        </div>

        {/* Middle: timeline */}
        <RecordTabs
          entityType="contact"
          entityId={id}
          refreshKey={refreshKey}
          onChanged={bump}
        />

        {/* Right: notes + tasks */}
        <div className="space-y-4">
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.notes")}</h2>
            <NotesPanel entityType="contact" entityId={id} onChanged={bump} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.tasks")}</h2>
            <TasksPanel entityType="contact" entityId={id} onChanged={bump} />
          </Card>
        </div>
      </div>

      <Modal title={t("record.editContact")} open={editing} onClose={() => setEditing(false)} wide>
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
        {t("record.createdUpdated", {
          created: formatDate(contact.createdAt, locale),
          updated: timeAgo(contact.updatedAt, locale),
        })}
      </p>
      {confirmDialog}
    </div>
  );
}

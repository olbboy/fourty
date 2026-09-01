"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { timeAgo, displayName } from "@/lib/format";
import { formatMoney, formatCompact } from "@/lib/currency";
import { readableInkPair } from "@/lib/contrast-color";
import { Modal, Avatar, StatusChip, ScoreBadge, HealthBadge, Spinner, LoadError, useConfirm } from "@/components/ui";
import { NotesPanel, TasksPanel, LogTouchpoint } from "@/components/record-panels";
import { RecordTabs } from "@/components/agent-panel/record-tabs";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { FactsForField, useFacts } from "@/components/fact-suggestion";
import { IconEdit, IconTrash } from "@/components/icons";
import { AgentQueue } from "@/components/agent-queue";
import { CompanyForm } from "../company-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";

export function CompanyDetail({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const { defs, failed: fieldsFailed, retry: retryFields } = useCustomFields("company");
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const [lookupRetry, setLookupRetry] = useState(0);
  const [peopleFailed, setPeopleFailed] = useState(false);
  const [dealsFailed, setDealsFailed] = useState(false);
  const { proposed, applied: appliedFacts, failed: factsFailed, retry: retryFacts } = useFacts(
    "company",
    id,
    refreshKey,
  );

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/companies/${id}`);
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error("company");
      setCompany((await res.json()).company);
      try {
        const [c, d] = await Promise.all([
          fetch(`/api/contacts?companyId=${id}`),
          fetch(`/api/deals?companyId=${id}`),
        ]);
        if (!c.ok) {
          setContacts([]);
          setPeopleFailed(true);
        } else {
          const body = await c.json();
          setContacts(Array.isArray(body.contacts) ? body.contacts : []);
          setPeopleFailed(false);
        }
        if (!d.ok) {
          setDeals([]);
          setDealsFailed(true);
        } else {
          const body = await d.json();
          setDeals(Array.isArray(body.deals) ? body.deals : []);
          setDealsFailed(false);
        }
      } catch {
        setContacts([]);
        setDeals([]);
        setPeopleFailed(true);
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
    fetch("/api/pipelines")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setPipelines(Array.isArray(d.pipelines) ? d.pipelines : []);
        setLookupsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
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
        {t("record.companyMissing")}{" "}
        <Link href="/companies" className="text-accent-700 underline">
          {t("record.backCompanies")}
        </Link>
      </p>
    );
  if (failed) {
    return (
      <LoadError
        onRetry={() => {
          setCompany(null);
          void load();
        }}
      />
    );
  }
  if (!company) return <Spinner />;

  const label = displayName(company.name);
  const stageOf = (deal: Deal) =>
    pipelines.flatMap((p) => p.stages).find((s) => s.id === deal.stageId);

  async function remove() {
    const ok = await askConfirm({
      title: t("record.deleteAria", { name: label }),
      body: t("record.deleteCompanyBody"),
    });
    if (!ok) return;
    await fetch(`/api/companies/${id}`, { method: "DELETE" });
    router.push("/companies");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={label} size={11} />
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">{label}</h1>
            <p className="text-sm text-ink-muted">
              {[company.industry, company.size, [company.city, company.country].filter(Boolean).join(", ")]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setEditing(true)} variant="outline">
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card size="flush" className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("record.details")}</h2>
            {/* `field` names the fact-ledger field, where there is one. */}
            {[
              { label: t("field.domain"), value: company.domain },
              { label: t("field.website"), value: company.website },
              { label: t("field.linkedin"), value: company.linkedin, field: "linkedin" },
              {
                label: t("field.annualRevenue"),
                value: company.annualRevenue ? formatCompact(company.annualRevenue, "USD") : null,
              },
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
            <CustomFieldsDisplay defs={defs} values={company.custom} failed={fieldsFailed} onRetry={retryFields} />
            {factsFailed && <LoadError compact onRetry={retryFacts} />}
          </Card>

          <AgentQueue entityType="company" entityId={id} />
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.logTouchpoint")}</h2>
            <LogTouchpoint entityType="company" entityId={id} onLogged={bump} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.peopleCount", { count: contacts.length })}</h2>
            {peopleFailed ? (
              <LoadError compact onRetry={() => void load()} />
            ) : (
            <div className="space-y-2">
              {contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/${c.id}`}
                  className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2 transition hover:bg-accent-600/10"
                >
                  <Avatar name={displayName(c.firstName, c.lastName)} size={7} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayName(c.firstName, c.lastName)}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{c.jobTitle ?? c.email ?? ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusChip status={c.status} />
                    <ScoreBadge score={c.score} />
                  </div>
                </Link>
              ))}
              {contacts.length === 0 && <p className="text-sm text-ink-muted">{t("record.noContacts")}</p>}
            </div>
            )}
          </Card>

          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.dealsCount", { count: deals.length })}</h2>
            {dealsFailed ? (
              <LoadError compact onRetry={() => void load()} />
            ) : (
            <>
            {lookupsFailed && (
              <LoadError compact onRetry={() => setLookupRetry((n) => n + 1)} />
            )}
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
              {deals.length === 0 && <p className="text-sm text-ink-muted">{t("record.noDeals")}</p>}
            </div>
            </>
            )}
          </Card>
        </div>

        <RecordTabs
          entityType="company"
          entityId={id}
          refreshKey={refreshKey}
          onChanged={bump}
        />

        <div className="space-y-4">
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.notes")}</h2>
            <NotesPanel entityType="company" entityId={id} onChanged={bump} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.tasks")}</h2>
            <TasksPanel entityType="company" entityId={id} onChanged={bump} />
          </Card>
        </div>
      </div>

      <Modal title={t("record.editCompany")} open={editing} onClose={() => setEditing(false)} wide>
        <CompanyForm
          company={company}
          onSaved={() => {
            setEditing(false);
            bump();
          }}
        />
      </Modal>
      <p className="mt-6 text-xs text-ink-muted">{t("record.updated", { when: timeAgo(company.updatedAt, locale) })}</p>
      {confirmDialog}
    </div>
  );
}

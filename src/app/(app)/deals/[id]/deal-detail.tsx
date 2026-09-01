"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { formatMoney, convert } from "@/lib/currency";
import { timeAgo, formatDate, displayName } from "@/lib/format";
import { readableOn } from "@/lib/contrast-color";
import { Modal, Spinner, LoadError, Avatar, HealthBadge, useConfirm } from "@/components/ui";
import { NotesPanel, TasksPanel, LogTouchpoint } from "@/components/record-panels";
import { RecordTabs } from "@/components/agent-panel/record-tabs";
import { CustomFieldsDisplay, useCustomFields } from "@/components/custom-fields";
import { IconEdit, IconTrash } from "@/components/icons";
import { AgentQueue } from "@/components/agent-queue";
import { NextActionCard } from "@/components/next-action";
import { daysSince, nextDealAction, visibleBool } from "@/lib/next-action";
import { DealForm } from "../deal-form";
import { canEditField } from "@/lib/field-access";
import { useFieldAccess } from "@/hooks/use-field-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";

export function DealDetail({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const { defs, failed: fieldsFailed, retry: retryFields } = useCustomFields("deal");
  const access = useFieldAccess("deals");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lookupsFailed, setLookupsFailed] = useState(false);
  const [lookupRetry, setLookupRetry] = useState(0);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/deals/${id}`);
      if (res.status === 404) {
        setMissing(true);
        return;
      }
      if (!res.ok) throw new Error("deal");
      setDeal((await res.json()).deal);
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/pipelines"), fetch("/api/companies"), fetch("/api/contacts")])
      .then(async ([p, co, ct]) => {
        if (!p.ok || !co.ok || !ct.ok) throw new Error("lookups");
        const [pipelines, companies, contacts] = await Promise.all([p.json(), co.json(), ct.json()]);
        if (cancelled) return;
        setPipelines(Array.isArray(pipelines.pipelines) ? pipelines.pipelines : []);
        setCompanies(Array.isArray(companies.companies) ? companies.companies : []);
        setContacts(Array.isArray(contacts.contacts) ? contacts.contacts : []);
        setLookupsFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPipelines([]);
        setCompanies([]);
        setContacts([]);
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
        {t("record.dealMissing")}{" "}
        <Link href="/deals" className="text-accent-700 underline">
          {t("record.backDeals")}
        </Link>
      </p>
    );
  if (failed) {
    return (
      <LoadError
        onRetry={() => {
          setDeal(null);
          void load();
        }}
      />
    );
  }
  if (!deal) return <Spinner />;

  const label = displayName(deal.name);
  const pipeline = pipelines.find((p) => p.id === deal.pipelineId);
  const stage = pipeline?.stages.find((s) => s.id === deal.stageId);
  const company = companies.find((c) => c.id === deal.companyId);
  const contact = contacts.find((c) => c.id === deal.contactId);
  const weighted =
    deal.amount != null && stage
      ? convert(deal.amount, deal.currency ?? "USD", "USD") * (stage.winProbability / 100)
      : null;
  const daysInStage = Math.floor((Date.now() - deal.stageEnteredAt) / 86400000);
  const canMoveStage = canEditField(access, "stageId");
  const showStepper = Boolean(pipeline && (canMoveStage || Object.hasOwn(deal, "stageId")));

  async function moveTo(stageId: string) {
    if (!canMoveStage) return;
    await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    bump();
  }

  async function remove() {
    const ok = await askConfirm({
      title: t("record.deleteAria", { name: label }),
      body: t("common.confirmDelete"),
    });
    if (!ok) return;
    await fetch(`/api/deals/${id}`, { method: "DELETE" });
    router.push("/deals");
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{label}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="text-base font-semibold text-accent-700 dark:text-accent-400">
              {formatMoney(deal.amount, deal.currency)}
            </span>
            {deal.amount != null && deal.currency && deal.currency !== "USD" && (
              <span className="ml-1.5">
                (≈ {formatMoney(convert(deal.amount, deal.currency, "USD"), "USD")})
              </span>
            )}
            {weighted != null && stage?.type === "open" && (
              <span className="ml-2">
                {t("record.dealWeighted", {
                  amount: formatMoney(weighted, "USD"),
                  pct: stage.winProbability,
                })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HealthBadge score={deal.score} />
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

      {lookupsFailed ? (
        <div className="mb-6">
          <LoadError compact onRetry={() => setLookupRetry((n) => n + 1)} />
        </div>
      ) : showStepper && pipeline ? (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {pipeline.stages.map((s) => {
            const active = s.id === deal.stageId;
            return (
              <Button
                key={s.id}
                type="button"
                onClick={canMoveStage && !active ? () => moveTo(s.id) : undefined}
                aria-disabled={!canMoveStage}
                tabIndex={canMoveStage ? undefined : -1}
                size="sm"
                variant="outline"
                className={`rounded-4xl text-xs ${
                  active ? "border-transparent font-semibold" : "text-ink-muted"
                } ${canMoveStage && !active ? "hover:border-accent-400" : "cursor-default"}`}
                // The fill is workspace data, so the label colour is derived
                // rather than assumed — white on an amber stage is unreadable.
                style={active ? { background: s.color, color: readableOn(s.color) } : undefined}
                title={t("record.winProbability", { pct: s.winProbability })}
              >
                {s.name}
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <NextActionCard
            suggestion={nextDealAction({
              stageType: Object.hasOwn(deal, "stageId") ? (stage?.type ?? null) : null,
              daysInStage,
              daysSinceUpdate: daysSince(deal.updatedAt) ?? 0,
              isOverdue: Boolean(
                stage?.type === "open" && deal.expectedCloseDate && deal.expectedCloseDate < Date.now(),
              ),
              hasContact: visibleBool(deal, "contactId"),
            })}
          />
          <Card size="flush" className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">{t("record.details")}</h2>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("field.company")}</p>
              {company ? (
                <Link href={`/companies/${company.id}`} className="mt-0.5 block text-sm text-accent-700 hover:underline dark:text-accent-400">
                  {displayName(company.name)}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm">—</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("field.primaryContact")}</p>
              {contact ? (
                <Link href={`/contacts/${contact.id}`} className="mt-0.5 flex items-center gap-2 text-sm text-accent-700 hover:underline dark:text-accent-400">
                  <Avatar name={displayName(contact.firstName, contact.lastName)} size={6} />
                  {displayName(contact.firstName, contact.lastName)}
                </Link>
              ) : (
                <p className="mt-0.5 text-sm">—</p>
              )}
            </div>
            {[
              [t("field.expectedClose"), formatDate(deal.expectedCloseDate, locale)],
              [t("field.daysInStage"), t("time.daysShort", { n: daysInStage })],
              [t("field.closed"), deal.closedAt ? formatDate(deal.closedAt, locale) : "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
                <p className="mt-0.5 text-sm">{value}</p>
              </div>
            ))}
            <CustomFieldsDisplay defs={defs} values={deal.custom} failed={fieldsFailed} onRetry={retryFields} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.logTouchpoint")}</h2>
            <LogTouchpoint entityType="deal" entityId={id} onLogged={bump} />
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
            <h2 className="mb-3 text-sm font-semibold">{t("record.notes")}</h2>
            <NotesPanel entityType="deal" entityId={id} onChanged={bump} />
          </Card>
          <Card size="flush" className="p-4">
            <h2 className="mb-3 text-sm font-semibold">{t("record.tasks")}</h2>
            <TasksPanel entityType="deal" entityId={id} onChanged={bump} />
          </Card>
        </div>
      </div>

      <Modal title={t("record.editDeal")} open={editing} onClose={() => setEditing(false)} wide>
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
        {t("record.createdUpdated", {
          created: formatDate(deal.createdAt, locale),
          updated: timeAgo(deal.updatedAt, locale),
        })}
      </p>
      {confirmDialog}
    </div>
  );
}

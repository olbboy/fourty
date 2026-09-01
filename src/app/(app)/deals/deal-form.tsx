"use client";

import { useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { Field, LoadError } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { toDateInputValue, fromDateInputValue } from "@/lib/format";
import { stripBlockedWrites } from "@/lib/field-access";
import { useFieldAccess } from "@/hooks/use-field-access";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

export function DealForm({
  deal,
  pipelines,
  defaultPipelineId,
  companies,
  contacts,
  onSaved,
}: {
  deal?: Deal;
  pipelines: Pipeline[];
  defaultPipelineId?: string;
  companies: Company[];
  contacts: Contact[];
  onSaved: () => void;
}) {
  const t = useT();
  const { defs, failed, retry } = useCustomFields("deal");
  const access = useFieldAccess("deals");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>(deal?.custom ?? {});
  const [pipelineId, setPipelineId] = useState(
    deal?.pipelineId ?? defaultPipelineId ?? pipelines[0]?.id ?? "",
  );

  const pipeline = pipelines.find((p) => p.id === pipelineId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const val = (k: string) => (f.get(k) as string)?.trim() || null;
    const body: Record<string, unknown> = {
      name: val("name") ?? "",
      amount: Number(val("amount") ?? 0) || 0,
      currency: val("currency") ?? "USD",
      companyId: val("companyId"),
      contactId: val("contactId"),
      expectedCloseDate: fromDateInputValue((f.get("expectedCloseDate") as string) ?? ""),
      custom,
    };
    if (!deal) {
      body.pipelineId = pipelineId;
      body.stageId = val("stageId") ?? undefined;
    } else if (val("stageId") && val("stageId") !== deal.stageId) {
      body.stageId = val("stageId");
    }
    const res = await fetch(deal ? `/api/deals/${deal.id}` : "/api/deals", {
      method: deal ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stripBlockedWrites(body, access.blockedWrites)),
    });
    if (res.ok) onSaved();
    else {
      setError((await res.json().catch(() => ({}))).error ?? t("form.failedSave"));
      setBusy(false);
    }
  }

  if (access.failed) return <LoadError compact onRetry={access.retry} />;

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {(!deal || !access.hidden.has("name")) && (
        <Field label={t("field.dealName")} className="sm:col-span-2">
          <Input
            name="name"
            required={!deal}
            disabled={!!deal && access.blockedWrites.has("name")}
            defaultValue={deal?.name}
          />
        </Field>
      )}
      {!access.hidden.has("amount") && (
        <Field label={t("field.amount")}>
          <Input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            disabled={access.blockedWrites.has("amount")}
            defaultValue={deal?.amount ?? ""} />
        </Field>
      )}
      {!access.hidden.has("currency") && (
        <Field label={t("field.currency")}>
          <NativeSelect
            name="currency"
            defaultValue={deal?.currency ?? "USD"}
            className="w-full"
            disabled={access.blockedWrites.has("currency")}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!deal && pipelines.length > 1 && !access.hidden.has("pipelineId") && (
        <Field label={t("field.pipeline")}>
          <NativeSelect
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
            className="w-full"
            disabled={access.blockedWrites.has("pipelineId")}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("stageId") && (
        <Field label={t("field.stage")}>
          <NativeSelect
            name="stageId"
            defaultValue={deal?.stageId ?? pipeline?.stages[0]?.id}
            className="w-full"
            disabled={access.blockedWrites.has("stageId")}
          >
            {(deal
              ? pipelines.find((p) => p.id === deal.pipelineId)?.stages ?? []
              : pipeline?.stages ?? []
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("companyId") && (
        <Field label={t("field.company")}>
          <NativeSelect
            name="companyId"
            defaultValue={deal?.companyId ?? ""}
            className="w-full"
            disabled={access.blockedWrites.has("companyId")}
          >
            <option value="">—</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("contactId") && (
        <Field label={t("field.primaryContact")}>
          <NativeSelect
            name="contactId"
            defaultValue={deal?.contactId ?? ""}
            className="w-full"
            disabled={access.blockedWrites.has("contactId")}
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("expectedCloseDate") && (
        <Field label={t("field.expectedCloseDate")}>
          <Input
            name="expectedCloseDate"
            type="date"
            disabled={access.blockedWrites.has("expectedCloseDate")}
            defaultValue={toDateInputValue(deal?.expectedCloseDate)} />
        </Field>
      )}
      {!access.hidden.has("custom") && (
        <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} failed={failed} onRetry={retry} />
      )}
      {error && <p className="col-span-full text-sm text-feedback-error">{error}</p>}
      <div className="col-span-full flex justify-end">
        <Button type="submit" disabled={busy || !access.ready}>
          {busy ? t("form.saving") : deal ? t("form.saveChanges") : t("form.createDeal")}
        </Button>
      </div>
    </form>
  );
}

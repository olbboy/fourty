"use client";

import { useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { toDateInputValue, fromDateInputValue } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";

export function DealForm({
  deal,
  pipelines,
  companies,
  contacts,
  onSaved,
}: {
  deal?: Deal;
  pipelines: Pipeline[];
  companies: Company[];
  contacts: Contact[];
  onSaved: () => void;
}) {
  const defs = useCustomFields("deal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, unknown>>(deal?.custom ?? {});
  const [pipelineId, setPipelineId] = useState(deal?.pipelineId ?? pipelines[0]?.id ?? "");

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
      body: JSON.stringify(body),
    });
    if (res.ok) onSaved();
    else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Deal name" className="sm:col-span-2">
        <Input name="name" required defaultValue={deal?.name} />
      </Field>
      <Field label="Amount">
        <Input
          name="amount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={deal?.amount ?? ""} />
      </Field>
      <Field label="Currency">
        <NativeSelect name="currency" defaultValue={deal?.currency ?? "USD"} className="w-full">
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {!deal && pipelines.length > 1 && (
        <Field label="Pipeline">
          <NativeSelect value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="w-full">
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      <Field label="Stage">
        <NativeSelect name="stageId" defaultValue={deal?.stageId ?? pipeline?.stages[0]?.id} className="w-full">
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
      <Field label="Company">
        <NativeSelect name="companyId" defaultValue={deal?.companyId ?? ""} className="w-full">
          <option value="">—</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Primary contact">
        <NativeSelect name="contactId" defaultValue={deal?.contactId ?? ""} className="w-full">
          <option value="">—</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Expected close date">
        <Input
          name="expectedCloseDate"
          type="date"
          defaultValue={toDateInputValue(deal?.expectedCloseDate)} />
      </Field>
      <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} />
      {error && <p className="col-span-full text-sm text-feedback-error">{error}</p>}
      <div className="col-span-full flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : deal ? "Save changes" : "Create deal"}
        </Button>
      </div>
    </form>
  );
}

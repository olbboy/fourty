"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { Field } from "@/components/ui";
import { CustomFieldsInputs, useCustomFields } from "@/components/custom-fields";
import { Select } from "@/components/select";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { toDateInputValue, fromDateInputValue } from "@/lib/format";

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
  const submittingRef = useRef(false);
  const defaultPipeline = pipelines.find((p) => p.isDefault === 1) ?? pipelines[0];
  const initialPipelineId = deal?.pipelineId ?? defaultPipeline?.id ?? "";
  const initialPipeline = pipelines.find((p) => p.id === initialPipelineId);
  const [pipelineId, setPipelineId] = useState(initialPipelineId);
  const [stageId, setStageId] = useState(
    deal?.stageId ??
      initialPipeline?.stages[0]?.id ?? "",
  );

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = pipeline?.stages ?? [];

  useEffect(() => {
    if (pipelines.length === 0) return;

    if (deal) {
      const dealPipeline = pipelines.find((p) => p.id === deal.pipelineId);
      if (dealPipeline && !dealPipeline.stages.some((stage) => stage.id === stageId)) {
        setStageId(dealPipeline.stages[0]?.id ?? "");
      }
      return;
    }

    const selectedPipeline =
      pipelines.find((p) => p.id === pipelineId) ??
      pipelines.find((p) => p.isDefault === 1) ??
      pipelines[0];
    if (selectedPipeline.id !== pipelineId) {
      setPipelineId(selectedPipeline.id);
      setStageId(selectedPipeline.stages[0]?.id ?? "");
    } else if (!selectedPipeline.stages.some((stage) => stage.id === stageId)) {
      setStageId(selectedPipeline.stages[0]?.id ?? "");
    }
  }, [deal, pipelines, pipelineId, stageId]);

  function handlePipelineChange(nextPipelineId: string): void {
    const nextPipeline = pipelines.find((p) => p.id === nextPipelineId);
    setPipelineId(nextPipelineId);
    setStageId(nextPipeline?.stages[0]?.id ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
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
        const selectedStage = stages.find((stage) => stage.id === stageId);
        if (!pipeline || !selectedStage) {
          setError("Select a pipeline with at least one stage");
          return;
        }
        body.pipelineId = pipeline.id;
        body.stageId = selectedStage.id;
      } else if (stageId !== deal.stageId) {
        const dealPipeline = pipelines.find((p) => p.id === deal.pipelineId);
        const selectedStage = dealPipeline?.stages.find((stage) => stage.id === stageId);
        if (!selectedStage) {
          setError("Select a valid stage");
          return;
        }
        body.stageId = selectedStage.id;
      }

      const res = await fetch(deal ? `/api/deals/${deal.id}` : "/api/deals", {
        method: deal ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          data && typeof data === "object" && "error" in data && typeof data.error === "string"
            ? data.error
            : "Failed to save. Please try again.",
        );
        return;
      }
      onSaved();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Deal name" className="sm:col-span-2">
        <input name="name" required defaultValue={deal?.name} className="input" />
      </Field>
      <Field label="Amount">
        <input
          name="amount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={deal?.amount ?? ""}
          className="input"
        />
      </Field>
      <Field label="Currency">
        <Select
          name="currency"
          defaultValue={deal?.currency ?? "USD"}
          className="input"
          options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      </Field>
      {!deal && pipelines.length > 1 && (
        <Field label="Pipeline">
          <Select
            value={pipelineId}
            onValueChange={handlePipelineChange}
            className="input"
            options={pipelines.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      )}
      <Field label="Stage">
        <Select
          name="stageId"
          value={stageId}
          onValueChange={setStageId}
          className="input"
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
        />
      </Field>
      <Field label="Company">
        <Select
          name="companyId"
          defaultValue={deal?.companyId ?? ""}
          className="input"
          options={[
            { value: "", label: "—" },
            ...companies.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>
      <Field label="Primary contact">
        <Select
          name="contactId"
          defaultValue={deal?.contactId ?? ""}
          className="input"
          options={[
            { value: "", label: "—" },
            ...contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
          ]}
        />
      </Field>
      <Field label="Expected close date">
        <input
          name="expectedCloseDate"
          type="date"
          defaultValue={toDateInputValue(deal?.expectedCloseDate)}
          className="input"
        />
      </Field>
      <CustomFieldsInputs defs={defs} values={custom} onChange={setCustom} />
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-500">
          {error}
        </p>
      )}
      <div className="col-span-full flex justify-end">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? "Saving…" : deal ? "Save changes" : "Create deal"}
        </button>
      </div>
    </form>
  );
}

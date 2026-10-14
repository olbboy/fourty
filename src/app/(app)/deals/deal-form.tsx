"use client";

import { useEffect, useRef, useState } from "react";
import type { Company, Contact, Deal, Pipeline } from "@/lib/types";
import { Field, LoadError } from "@/components/ui";
import {
  CustomFieldsInputs,
  useCustomFields,
} from "@/components/custom-fields";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { toDateInputValue, fromDateInputValue } from "@/lib/format";
import { stripBlockedWrites } from "@/lib/field-access";
import { useFieldAccess } from "@/hooks/use-field-access";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { OwnerField, ownerFromForm } from "@/components/owner-controls";
import { useT } from "@/lib/i18n/provider";

export function DealForm({
  deal,
  pipelines,
  defaultPipelineId,
  companies,
  contacts,
  amountFromLines = false,
  onSaved,
}: {
  deal?: Deal;
  /** The deal has Line items: their sum is its Amount, changed on the deal page and not here. */
  amountFromLines?: boolean;
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
  const [custom, setCustom] = useState<Record<string, unknown>>(
    deal?.custom ?? {},
  );
  const submittingRef = useRef(false);
  // "" means "keep the default": the creator on a new deal, unassigned on an
  // existing one. ownerId is only sent when the choice moves off this value.
  const initialOwnerId = deal?.ownerId ?? "";
  const defaultPipeline = pipelines.find((p) => p.isDefault === 1);
  const initialPipelineId =
    deal?.pipelineId ??
    defaultPipelineId ??
    defaultPipeline?.id ??
    pipelines[0]?.id ??
    "";
  const initialPipeline = pipelines.find((p) => p.id === initialPipelineId);
  const [pipelineId, setPipelineId] = useState(initialPipelineId);
  const [stageId, setStageId] = useState(
    deal?.stageId ?? initialPipeline?.stages[0]?.id ?? "",
  );

  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stagePipeline = deal
    ? (pipelines.find((p) => p.id === deal.pipelineId) ?? pipeline)
    : pipeline;
  const stages = stagePipeline?.stages ?? [];

  useEffect(() => {
    if (pipelines.length === 0) return;

    const selectedPipeline = deal
      ? pipelines.find((p) => p.id === deal.pipelineId)
      : (pipelines.find((p) => p.id === pipelineId) ??
        pipelines.find((p) => p.id === defaultPipelineId) ??
        pipelines.find((p) => p.isDefault === 1) ??
        pipelines[0]);
    if (!selectedPipeline) return;

    if (selectedPipeline.id !== pipelineId) setPipelineId(selectedPipeline.id);
    if (!selectedPipeline.stages.some((stage) => stage.id === stageId)) {
      setStageId(selectedPipeline.stages[0]?.id ?? "");
    }
  }, [deal, defaultPipelineId, pipelineId, pipelines, stageId]);

  function handlePipelineChange(nextPipelineId: string): void {
    const nextPipeline = pipelines.find((p) => p.id === nextPipelineId);
    setPipelineId(nextPipelineId);
    setStageId(nextPipeline?.stages[0]?.id ?? "");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!access.ready || submittingRef.current) return;

    submittingRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const f = new FormData(e.currentTarget);
      const val = (key: string): string | null => {
        const value = f.get(key);
        return typeof value === "string" ? value.trim() || null : null;
      };
      const body: Record<string, unknown> = {};

      if (!deal || !access.hidden.has("name")) body.name = val("name") ?? "";
      if (!access.hidden.has("amount") && !amountFromLines)
        body.amount = Number(val("amount") ?? 0) || 0;
      if (!access.hidden.has("currency") && !amountFromLines)
        body.currency = val("currency") ?? "USD";
      if (!access.hidden.has("companyId")) body.companyId = val("companyId");
      if (!access.hidden.has("contactId")) body.contactId = val("contactId");
      if (!access.hidden.has("expectedCloseDate")) {
        body.expectedCloseDate = fromDateInputValue(
          (f.get("expectedCloseDate") as string) ?? "",
        );
      }
      if (!access.hidden.has("custom")) body.custom = custom;
      if (!access.hidden.has("ownerId")) {
        const owner = ownerFromForm(f, initialOwnerId);
        if (owner !== undefined) body.ownerId = owner;
      }

      if (!deal) {
        const selectedStage = stages.find((stage) => stage.id === stageId);
        if (!pipeline || !selectedStage) {
          setError("Select a pipeline with at least one stage");
          return;
        }
        body.pipelineId = pipeline.id;
        body.stageId = selectedStage.id;
      } else if (stageId !== deal.stageId) {
        const selectedStage = stages.find((stage) => stage.id === stageId);
        if (!selectedStage) {
          setError("Select a valid stage");
          return;
        }
        body.stageId = selectedStage.id;
      }

      const response = await fetch(
        deal ? `/api/deals/${deal.id}` : "/api/deals",
        {
          method: deal ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(stripBlockedWrites(body, access.blockedWrites)),
        },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : t("form.failedSave");
        setError(message);
        return;
      }
      onSaved();
    } catch {
      setError(t("form.failedSave"));
    } finally {
      submittingRef.current = false;
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
        <Field label={t("field.amount")} hint={amountFromLines ? t("dealLines.formHint") : undefined}>
          <Input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            disabled={amountFromLines || access.blockedWrites.has("amount")}
            defaultValue={deal?.amount ?? ""}
          />
        </Field>
      )}
      {!access.hidden.has("currency") && (
        <Field label={t("field.currency")}>
          <NativeSelect
            name="currency"
            defaultValue={deal?.currency ?? "USD"}
            className="w-full"
            disabled={amountFromLines || access.blockedWrites.has("currency")}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!deal && pipelines.length > 1 && !access.hidden.has("pipelineId") && (
        <Field label={t("field.pipeline")}>
          <NativeSelect
            value={pipelineId}
            onChange={(event) => handlePipelineChange(event.target.value)}
            className="w-full"
            disabled={access.blockedWrites.has("pipelineId")}
          >
            {pipelines.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("stageId") && (
        <Field label={t("field.stage")}>
          <NativeSelect
            name="stageId"
            value={stageId}
            onChange={(event) => setStageId(event.target.value)}
            className="w-full"
            disabled={access.blockedWrites.has("stageId")}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
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
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
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
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName} {contact.lastName}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!access.hidden.has("ownerId") && (
        <OwnerField initialOwnerId={initialOwnerId} isNew={!deal} disabled={access.blockedWrites.has("ownerId")} />
      )}
      {!access.hidden.has("expectedCloseDate") && (
        <Field label={t("field.expectedCloseDate")}>
          <Input
            name="expectedCloseDate"
            type="date"
            disabled={access.blockedWrites.has("expectedCloseDate")}
            defaultValue={toDateInputValue(deal?.expectedCloseDate)}
          />
        </Field>
      )}
      {!access.hidden.has("custom") && (
        <CustomFieldsInputs
          defs={defs}
          values={custom}
          onChange={setCustom}
          failed={failed}
          onRetry={retry}
        />
      )}
      {error && (
        <p role="alert" className="col-span-full text-sm text-feedback-error">
          {error}
        </p>
      )}
      <div className="col-span-full flex justify-end">
        <Button type="submit" disabled={busy || !access.ready}>
          {busy
            ? t("form.saving")
            : deal
              ? t("form.saveChanges")
              : t("form.createDeal")}
        </Button>
      </div>
    </form>
  );
}

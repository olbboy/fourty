"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import type { WorkflowEvent } from "@/lib/workflows/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { WORKFLOW_EVENTS, workflowEventLabel, workflowFieldLabel } from "@/lib/workflow-field-display";

type Condition = { field: string; op: string; value?: string };
type Action = Record<string, unknown> & { type: string };

export type WorkflowDraft = {
  id?: string;
  name: string;
  enabled: boolean;
  trigger: { event: WorkflowEvent };
  conditions: Condition[];
  actions: Action[];
};

const FIELDS_BY_ENTITY: Record<string, string[]> = {
  contact: ["status", "source", "score", "email", "jobTitle", "city", "country", "firstName", "lastName"],
  company: ["name", "industry", "size", "city", "country", "annualRevenue"],
  deal: ["name", "amount", "currency", "stageName"],
  task: ["title", "priority"],
};

const OPS = ["eq", "neq", "contains", "gt", "gte", "lt", "lte", "is_empty", "not_empty"] as const;
const OP_KEYS: Record<(typeof OPS)[number], MessageKey> = {
  eq: "wf.op.eq",
  neq: "wf.op.neq",
  contains: "wf.op.contains",
  gt: "wf.op.gt",
  gte: "wf.op.gte",
  lt: "wf.op.lt",
  lte: "wf.op.lte",
  is_empty: "wf.op.is_empty",
  not_empty: "wf.op.not_empty",
};

const ACTION_TYPES = ["create_task", "add_note", "update_field", "webhook", "ai_draft", "log"] as const;
const ACTION_KEYS: Record<(typeof ACTION_TYPES)[number], MessageKey> = {
  create_task: "wf.action.create_task",
  add_note: "wf.action.add_note",
  update_field: "wf.action.update_field",
  webhook: "wf.action.webhook",
  ai_draft: "wf.action.ai_draft",
  log: "wf.action.log",
};

function entityOf(event: string): string {
  return event.split(".")[0];
}

export function WorkflowBuilder({
  initial,
  onSaved,
}: {
  initial?: WorkflowDraft;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [event, setEvent] = useState<WorkflowEvent>(initial?.trigger.event ?? "contact.created");
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? []);
  const [actions, setActions] = useState<Action[]>(
    initial?.actions ?? [{ type: "create_task", title: "", priority: "medium", dueInDays: 2 }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const entity = entityOf(event);
  const fields = FIELDS_BY_ENTITY[entity] ?? [];

  function setCondition(i: number, patch: Partial<Condition>) {
    setConditions((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function setAction(i: number, patch: Partial<Action>) {
    setActions((as) => as.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const cleanConditions = conditions
      .filter((c) => c.field)
      .map((c) => ({
        ...c,
        value: ["is_empty", "not_empty"].includes(c.op)
          ? undefined
          : isNaN(Number(c.value)) || c.value === ""
            ? c.value
            : Number(c.value),
      }));
    const cleanActions = actions.map((a) => {
      if (a.type === "create_task") {
        return {
          type: "create_task",
          title: a.title,
          priority: a.priority ?? "medium",
          dueInDays: a.dueInDays === undefined || a.dueInDays === "" ? undefined : Number(a.dueInDays),
        };
      }
      if (a.type === "update_field") {
        const raw = a.value as string;
        return { type: "update_field", field: a.field, value: raw };
      }
      return a;
    });
    const body = {
      name,
      trigger: { event },
      conditions: cleanConditions,
      actions: cleanActions,
      enabled: initial?.enabled ?? true,
    };
    const res = await fetch(initial?.id ? `/api/workflows/${initial.id}` : "/api/workflows", {
      method: initial?.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) onSaved();
    else {
      setError((await res.json().catch(() => ({}))).error ?? t("wf.failedSave"));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label={t("wf.name")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("wf.namePlaceholder")} />
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("wf.when")}
        </p>
        {/* The "When…" heading above is a paragraph, not a label. */}
        <NativeSelect
          value={event}
          onChange={(e) => {
            setEvent(e.target.value as WorkflowEvent);
            setConditions([]);
          }}
          aria-label={t("wf.triggerAria")} className="w-full">
          {WORKFLOW_EVENTS.map((value) => (
            <option key={value} value={value}>
              {workflowEventLabel(value, t)}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("wf.onlyIf")}
          </p>
          <Button
            onClick={() => setConditions((cs) => [...cs, { field: fields[0] ?? "", op: "eq", value: "" }])} variant="outline" size="xs">
            <IconPlus width={13} height={13} /> {t("wf.condition")}
          </Button>
        </div>
        <div className="space-y-2">
          {conditions.length === 0 && (
            <p className="text-sm text-ink-muted">{t("wf.noConditions")}</p>
          )}
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {/* Conditions repeat, so each control names its own row — otherwise
                  a screen reader reads the same three unnamed fields over again. */}
              <NativeSelect
                value={c.field}
                onChange={(e) => setCondition(i, { field: e.target.value })}
                aria-label={t("wf.conditionField", { n: i + 1 })}>
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {workflowFieldLabel(f, t)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={c.op}
                onChange={(e) => setCondition(i, { op: e.target.value })}
                aria-label={t("wf.conditionOp", { n: i + 1 })}>
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {t(OP_KEYS[op])}
                  </option>
                ))}
              </NativeSelect>
              {!["is_empty", "not_empty"].includes(c.op) && (
                <Input
                  value={c.value ?? ""}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  aria-label={t("wf.conditionValue", { n: i + 1 })}
                  placeholder={t("wf.valuePlaceholder")} className="w-36" />
              )}
              <Button
                onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
                aria-label={t("wf.removeCondition")} variant="ghost" size="icon-xs" className="text-feedback-error">
                <IconTrash width={14} height={14} />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("wf.then")}</p>
          <Button
            onClick={() => setActions((as) => [...as, { type: "add_note", body: "" }])} variant="outline" size="xs">
            <IconPlus width={13} height={13} /> {t("wf.action")}
          </Button>
        </div>
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <NativeSelect
                  value={a.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    const blank: Record<string, Action> = {
                      create_task: { type, title: "", priority: "medium", dueInDays: 2 },
                      add_note: { type, body: "" },
                      update_field: { type, field: "status", value: "" },
                      webhook: { type, url: "" },
                      ai_draft: { type, prompt: "" },
                      log: { type, message: "" },
                    };
                    setActions((as) => as.map((x, idx) => (idx === i ? blank[type] : x)));
                  }}
                  aria-label={t("wf.actionType", { n: i + 1 })}>
                  {ACTION_TYPES.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(ACTION_KEYS[kind])}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  onClick={() => setActions((as) => as.filter((_, idx) => idx !== i))}
                  disabled={actions.length === 1}
                  aria-label={t("wf.removeAction")} variant="ghost" size="icon-xs" className="text-feedback-error disabled:opacity-30">
                  <IconTrash width={14} height={14} />
                </Button>
              </div>
              {a.type === "create_task" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    value={(a.title as string) ?? ""}
                    onChange={(e) => setAction(i, { title: e.target.value })}
                    aria-label={t("wf.taskTitleAria", { n: i + 1 })}
                    placeholder={t("wf.taskTitlePlaceholder")} className="sm:col-span-3" />
                  <NativeSelect
                    value={(a.priority as string) ?? "medium"}
                    onChange={(e) => setAction(i, { priority: e.target.value })}
                    aria-label={t("wf.taskPriorityAria", { n: i + 1 })} className="w-full">
                    <option value="low">{t("priority.low")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="high">{t("priority.high")}</option>
                  </NativeSelect>
                  <Input
                    type="number"
                    min={0}
                    value={(a.dueInDays as number) ?? ""}
                    onChange={(e) => setAction(i, { dueInDays: e.target.value })}
                    aria-label={t("wf.dueDaysAria", { n: i + 1 })}
                    placeholder={t("wf.dueDaysPlaceholder")} />
                </div>
              )}
              {a.type === "add_note" && (
                <Textarea
                  value={(a.body as string) ?? ""}
                  onChange={(e) => setAction(i, { body: e.target.value })}
                  aria-label={t("wf.noteAria", { n: i + 1 })}
                  rows={2}
                  placeholder={t("wf.notePlaceholder")} className="resize-y" />
              )}
              {a.type === "update_field" && (
                <div className="flex flex-wrap gap-2">
                  <NativeSelect
                    value={(a.field as string) ?? ""}
                    onChange={(e) => setAction(i, { field: e.target.value })}
                    aria-label={t("wf.updateFieldAria", { n: i + 1 })}>
                    {(entity === "contact"
                      ? ["status", "source", "jobTitle", "city", "country"]
                      : entity === "company"
                        ? ["industry", "size", "city", "country"]
                        : ["currency"]
                    ).map((f) => (
                      <option key={f} value={f}>
                        {workflowFieldLabel(f, t)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    value={(a.value as string) ?? ""}
                    onChange={(e) => setAction(i, { value: e.target.value })}
                    aria-label={t("wf.newValueAria", { n: i + 1 })}
                    placeholder={t("wf.newValuePlaceholder")} className="w-44" />
                </div>
              )}
              {a.type === "webhook" && (
                <Input
                  value={(a.url as string) ?? ""}
                  onChange={(e) => setAction(i, { url: e.target.value })}
                  aria-label={t("wf.webhookAria", { n: i + 1 })}
                  placeholder={t("wf.webhookPlaceholder")} />
              )}
              {a.type === "ai_draft" && (
                <div className="space-y-1">
                  <Textarea
                    value={(a.prompt as string) ?? ""}
                    onChange={(e) => setAction(i, { prompt: e.target.value })}
                    aria-label={t("wf.aiPromptAria", { n: i + 1 })}
                    rows={2}
                    placeholder={t("wf.aiPromptPlaceholder")} className="resize-y" />
                  <p className="text-xs text-ink-muted">{t("wf.aiHint")}</p>
                </div>
              )}
              {a.type === "log" && (
                <Input
                  value={(a.message as string) ?? ""}
                  onChange={(e) => setAction(i, { message: e.target.value })}
                  aria-label={t("wf.logAria", { n: i + 1 })}
                  placeholder={t("wf.logPlaceholder")} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-feedback-error">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={save} disabled={busy || !name.trim()}>
          {busy ? t("form.saving") : initial?.id ? t("wf.save") : t("wf.create")}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Field } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import type { WorkflowEvent } from "@/lib/workflows/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import {
  WORKFLOW_EVENTS,
  workflowEventLabel,
  workflowFieldLabel,
} from "@/lib/workflow-field-display";

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
  contact: [
    "status",
    "source",
    "score",
    "email",
    "jobTitle",
    "city",
    "country",
    "firstName",
    "lastName",
  ],
  company: ["name", "industry", "size", "city", "country", "annualRevenue"],
  deal: ["name", "amount", "currency", "stageName"],
  task: ["title", "priority"],
};

const OPS = [
  "eq",
  "neq",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "not_empty",
] as const;
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

const ACTION_TYPES = [
  "create_task",
  "add_note",
  "update_field",
  "webhook",
  "ai_draft",
  "log",
] as const;
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
  const [event, setEvent] = useState<WorkflowEvent>(
    initial?.trigger.event ?? "contact.created",
  );
  const [conditions, setConditions] = useState<Condition[]>(
    initial?.conditions ?? [],
  );
  const [actions, setActions] = useState<Action[]>(
    initial?.actions ?? [
      { type: "create_task", title: "", priority: "medium", dueInDays: 2 },
    ],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const t = useT();

  const entity = entityOf(event);
  const fields = FIELDS_BY_ENTITY[entity] ?? [];

  function setCondition(i: number, patch: Partial<Condition>): void {
    setConditions((current) =>
      current.map((condition, index) =>
        index === i ? { ...condition, ...patch } : condition,
      ),
    );
  }

  function setAction(i: number, patch: Partial<Action>): void {
    setActions((current) =>
      current.map((action, index) =>
        index === i ? { ...action, ...patch } : action,
      ),
    );
  }

  async function save(): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const cleanConditions = conditions
        .filter((condition) => condition.field)
        .map((condition) => ({
          ...condition,
          value: ["is_empty", "not_empty"].includes(condition.op)
            ? undefined
            : isNaN(Number(condition.value)) || condition.value === ""
              ? condition.value
              : Number(condition.value),
        }));
      const cleanActions = actions.map((action) => {
        if (action.type === "create_task") {
          return {
            type: "create_task",
            title: action.title,
            priority: action.priority ?? "medium",
            dueInDays:
              action.dueInDays === undefined || action.dueInDays === ""
                ? undefined
                : Number(action.dueInDays),
          };
        }
        if (action.type === "update_field") {
          const raw = action.value as string;
          return { type: "update_field", field: action.field, value: raw };
        }
        return action;
      });
      const body = {
        name,
        trigger: { event },
        conditions: cleanConditions,
        actions: cleanActions,
        enabled: initial?.enabled ?? true,
      };
      const response = await fetch(
        initial?.id ? `/api/workflows/${initial.id}` : "/api/workflows",
        {
          method: initial?.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        setError(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
            ? payload.error
            : t("wf.failedSave"),
        );
        return;
      }
      onSaved();
    } catch {
      setError(t("wf.failedSave"));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label={t("wf.name")}>
        <Input
          value={name}
          onChange={(inputEvent) => setName(inputEvent.target.value)}
          placeholder={t("wf.namePlaceholder")}
        />
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t("wf.when")}
        </p>
        <NativeSelect
          value={event}
          onChange={(inputEvent) => {
            setEvent(inputEvent.target.value as WorkflowEvent);
            setConditions([]);
          }}
          aria-label={t("wf.triggerAria")}
          className="w-full"
        >
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
            type="button"
            onClick={() =>
              setConditions((current) => [
                ...current,
                { field: fields[0] ?? "", op: "eq", value: "" },
              ])
            }
            variant="outline"
            size="xs"
          >
            <IconPlus width={13} height={13} aria-hidden="true" />{" "}
            {t("wf.condition")}
          </Button>
        </div>
        <div className="space-y-2">
          {conditions.length === 0 && (
            <p className="text-sm text-ink-muted">{t("wf.noConditions")}</p>
          )}
          {conditions.map((condition, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <NativeSelect
                value={condition.field}
                onChange={(inputEvent) =>
                  setCondition(index, { field: inputEvent.target.value })
                }
                aria-label={t("wf.conditionField", { n: index + 1 })}
              >
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {workflowFieldLabel(field, t)}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={condition.op}
                onChange={(inputEvent) =>
                  setCondition(index, { op: inputEvent.target.value })
                }
                aria-label={t("wf.conditionOp", { n: index + 1 })}
              >
                {OPS.map((op) => (
                  <option key={op} value={op}>
                    {t(OP_KEYS[op])}
                  </option>
                ))}
              </NativeSelect>
              {!["is_empty", "not_empty"].includes(condition.op) && (
                <Input
                  value={condition.value ?? ""}
                  onChange={(inputEvent) =>
                    setCondition(index, { value: inputEvent.target.value })
                  }
                  aria-label={t("wf.conditionValue", { n: index + 1 })}
                  placeholder={t("wf.valuePlaceholder")}
                  className="w-36"
                />
              )}
              <Button
                type="button"
                onClick={() =>
                  setConditions((current) =>
                    current.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
                aria-label={t("wf.removeCondition")}
                variant="ghost"
                size="icon-xs"
                className="text-feedback-error"
              >
                <IconTrash width={14} height={14} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("wf.then")}
          </p>
          <Button
            type="button"
            onClick={() =>
              setActions((current) => [
                ...current,
                { type: "add_note", body: "" },
              ])
            }
            variant="outline"
            size="xs"
          >
            <IconPlus width={13} height={13} aria-hidden="true" />{" "}
            {t("wf.action")}
          </Button>
        </div>
        <div className="space-y-3">
          {actions.map((action, index) => (
            <div key={index} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <NativeSelect
                  value={action.type}
                  onChange={(inputEvent) => {
                    const type = inputEvent.target.value;
                    const blank: Record<string, Action> = {
                      create_task: {
                        type,
                        title: "",
                        priority: "medium",
                        dueInDays: 2,
                      },
                      add_note: { type, body: "" },
                      update_field: { type, field: "status", value: "" },
                      webhook: { type, url: "" },
                      ai_draft: { type, prompt: "" },
                      log: { type, message: "" },
                    };
                    setActions((current) =>
                      current.map((item, rowIndex) =>
                        rowIndex === index ? blank[type] : item,
                      ),
                    );
                  }}
                  aria-label={t("wf.actionType", { n: index + 1 })}
                  className="w-full"
                >
                  {ACTION_TYPES.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(ACTION_KEYS[kind])}
                    </option>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  onClick={() =>
                    setActions((current) =>
                      current.filter((_, rowIndex) => rowIndex !== index),
                    )
                  }
                  disabled={actions.length === 1}
                  aria-label={t("wf.removeAction")}
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-feedback-error disabled:opacity-30"
                >
                  <IconTrash width={14} height={14} aria-hidden="true" />
                </Button>
              </div>
              {action.type === "create_task" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    value={(action.title as string) ?? ""}
                    onChange={(inputEvent) =>
                      setAction(index, { title: inputEvent.target.value })
                    }
                    aria-label={t("wf.taskTitleAria", { n: index + 1 })}
                    placeholder={t("wf.taskTitlePlaceholder")}
                    className="sm:col-span-3"
                  />
                  <NativeSelect
                    value={(action.priority as string) ?? "medium"}
                    onChange={(inputEvent) =>
                      setAction(index, { priority: inputEvent.target.value })
                    }
                    aria-label={t("wf.taskPriorityAria", { n: index + 1 })}
                    className="w-full"
                  >
                    <option value="low">{t("priority.low")}</option>
                    <option value="medium">{t("priority.medium")}</option>
                    <option value="high">{t("priority.high")}</option>
                  </NativeSelect>
                  <Input
                    type="number"
                    min={0}
                    value={(action.dueInDays as number) ?? ""}
                    onChange={(inputEvent) =>
                      setAction(index, { dueInDays: inputEvent.target.value })
                    }
                    aria-label={t("wf.dueDaysAria", { n: index + 1 })}
                    placeholder={t("wf.dueDaysPlaceholder")}
                  />
                </div>
              )}
              {action.type === "add_note" && (
                <Textarea
                  value={(action.body as string) ?? ""}
                  onChange={(inputEvent) =>
                    setAction(index, { body: inputEvent.target.value })
                  }
                  aria-label={t("wf.noteAria", { n: index + 1 })}
                  rows={2}
                  placeholder={t("wf.notePlaceholder")}
                  className="resize-y"
                />
              )}
              {action.type === "update_field" && (
                <div className="flex flex-wrap gap-2">
                  <NativeSelect
                    value={(action.field as string) ?? ""}
                    onChange={(inputEvent) =>
                      setAction(index, { field: inputEvent.target.value })
                    }
                    aria-label={t("wf.updateFieldAria", { n: index + 1 })}
                  >
                    {(entity === "contact"
                      ? ["status", "source", "jobTitle", "city", "country"]
                      : entity === "company"
                        ? ["industry", "size", "city", "country"]
                        : ["currency"]
                    ).map((field) => (
                      <option key={field} value={field}>
                        {workflowFieldLabel(field, t)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    value={(action.value as string) ?? ""}
                    onChange={(inputEvent) =>
                      setAction(index, { value: inputEvent.target.value })
                    }
                    aria-label={t("wf.newValueAria", { n: index + 1 })}
                    placeholder={t("wf.newValuePlaceholder")}
                    className="w-44"
                  />
                </div>
              )}
              {action.type === "webhook" && (
                <Input
                  value={(action.url as string) ?? ""}
                  onChange={(inputEvent) =>
                    setAction(index, { url: inputEvent.target.value })
                  }
                  aria-label={t("wf.webhookAria", { n: index + 1 })}
                  placeholder={t("wf.webhookPlaceholder")}
                />
              )}
              {action.type === "ai_draft" && (
                <div className="space-y-1">
                  <Textarea
                    value={(action.prompt as string) ?? ""}
                    onChange={(inputEvent) =>
                      setAction(index, { prompt: inputEvent.target.value })
                    }
                    aria-label={t("wf.aiPromptAria", { n: index + 1 })}
                    rows={2}
                    placeholder={t("wf.aiPromptPlaceholder")}
                    className="resize-y"
                  />
                  <p className="text-xs text-ink-muted">{t("wf.aiHint")}</p>
                </div>
              )}
              {action.type === "log" && (
                <Input
                  value={(action.message as string) ?? ""}
                  onChange={(inputEvent) =>
                    setAction(index, { message: inputEvent.target.value })
                  }
                  aria-label={t("wf.logAria", { n: index + 1 })}
                  placeholder={t("wf.logPlaceholder")}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => void save()}
          disabled={busy || !name.trim()}
        >
          {busy
            ? t("form.saving")
            : initial?.id
              ? t("wf.save")
              : t("wf.create")}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Field } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { EVENT_LABELS, type WorkflowEvent } from "@/lib/workflows/types";

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

const OPS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "is_empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
];

const ACTION_TYPES = [
  { value: "create_task", label: "Create a task" },
  { value: "add_note", label: "Add a note" },
  { value: "update_field", label: "Update a field" },
  { value: "webhook", label: "Call a webhook" },
  { value: "ai_draft", label: "AI draft (BYO-key)" },
  { value: "log", label: "Write to run log" },
];

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
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save workflow");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Workflow name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="e.g. Follow up on hot leads"
        />
      </Field>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          When…
        </p>
        <select
          value={event}
          onChange={(e) => {
            setEvent(e.target.value as WorkflowEvent);
            setConditions([]);
          }}
          className="input"
        >
          {Object.entries(EVENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Only if… (all must match)
          </p>
          <button
            onClick={() => setConditions((cs) => [...cs, { field: fields[0] ?? "", op: "eq", value: "" }])}
            className="btn-ghost !px-2 !py-1 text-xs"
          >
            <IconPlus width={13} height={13} /> Condition
          </button>
        </div>
        <div className="space-y-2">
          {conditions.length === 0 && (
            <p className="text-sm text-ink-muted">No conditions — runs on every event.</p>
          )}
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={c.field}
                onChange={(e) => setCondition(i, { field: e.target.value })}
                className="input !w-auto"
              >
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                value={c.op}
                onChange={(e) => setCondition(i, { op: e.target.value })}
                className="input !w-auto"
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {!["is_empty", "not_empty"].includes(c.op) && (
                <input
                  value={c.value ?? ""}
                  onChange={(e) => setCondition(i, { value: e.target.value })}
                  className="input !w-36"
                  placeholder="value"
                />
              )}
              <button
                onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
                className="btn-ghost !border-0 !px-1.5 !text-red-400"
                aria-label="Remove condition"
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Then…</p>
          <button
            onClick={() => setActions((as) => [...as, { type: "add_note", body: "" }])}
            className="btn-ghost !px-2 !py-1 text-xs"
          >
            <IconPlus width={13} height={13} /> Action
          </button>
        </div>
        <div className="space-y-3">
          {actions.map((a, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <select
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
                  className="input !w-auto"
                >
                  {ACTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setActions((as) => as.filter((_, idx) => idx !== i))}
                  disabled={actions.length === 1}
                  className="btn-ghost !border-0 !px-1.5 !text-red-400 disabled:opacity-30"
                  aria-label="Remove action"
                >
                  <IconTrash width={14} height={14} />
                </button>
              </div>
              {a.type === "create_task" && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={(a.title as string) ?? ""}
                    onChange={(e) => setAction(i, { title: e.target.value })}
                    className="input sm:col-span-3"
                    placeholder='Task title — use {{firstName}}, {{name}}, etc.'
                  />
                  <select
                    value={(a.priority as string) ?? "medium"}
                    onChange={(e) => setAction(i, { priority: e.target.value })}
                    className="input"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={(a.dueInDays as number) ?? ""}
                    onChange={(e) => setAction(i, { dueInDays: e.target.value })}
                    className="input"
                    placeholder="Due in days"
                  />
                </div>
              )}
              {a.type === "add_note" && (
                <textarea
                  value={(a.body as string) ?? ""}
                  onChange={(e) => setAction(i, { body: e.target.value })}
                  className="input resize-y"
                  rows={2}
                  placeholder='Note body — templates like {{name}} are filled in.'
                />
              )}
              {a.type === "update_field" && (
                <div className="flex flex-wrap gap-2">
                  <select
                    value={(a.field as string) ?? ""}
                    onChange={(e) => setAction(i, { field: e.target.value })}
                    className="input !w-auto"
                  >
                    {(entity === "contact"
                      ? ["status", "source", "jobTitle", "city", "country"]
                      : entity === "company"
                        ? ["industry", "size", "city", "country"]
                        : ["currency"]
                    ).map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <input
                    value={(a.value as string) ?? ""}
                    onChange={(e) => setAction(i, { value: e.target.value })}
                    className="input !w-44"
                    placeholder="new value"
                  />
                </div>
              )}
              {a.type === "webhook" && (
                <input
                  value={(a.url as string) ?? ""}
                  onChange={(e) => setAction(i, { url: e.target.value })}
                  className="input"
                  placeholder="https://hooks.example.com/… (POST, JSON payload)"
                />
              )}
              {a.type === "ai_draft" && (
                <div className="space-y-1">
                  <textarea
                    value={(a.prompt as string) ?? ""}
                    onChange={(e) => setAction(i, { prompt: e.target.value })}
                    className="input resize-y"
                    rows={2}
                    placeholder='AI prompt — e.g. "Draft a follow-up email for {{firstName}} at {{name}}."'
                  />
                  <p className="text-xs text-ink-muted">
                    Writes the result as a draft note (human-in-the-loop). Requires a configured
                    provider (FOURTY_ENABLE_AI); off by default.
                  </p>
                </div>
              )}
              {a.type === "log" && (
                <input
                  value={(a.message as string) ?? ""}
                  onChange={(e) => setAction(i, { message: e.target.value })}
                  className="input"
                  placeholder="Message for the run log"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex justify-end">
        <button onClick={save} disabled={busy || !name.trim()} className="btn-primary">
          {busy ? "Saving…" : initial?.id ? "Save workflow" : "Create workflow"}
        </button>
      </div>
    </div>
  );
}

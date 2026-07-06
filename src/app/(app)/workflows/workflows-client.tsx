"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { PageHeader, Modal, EmptyState, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconZap, IconEdit } from "@/components/icons";
import { EVENT_LABELS, type WorkflowEvent } from "@/lib/workflows/types";
import { WorkflowBuilder, type WorkflowDraft } from "./workflow-builder";

type Workflow = WorkflowDraft & {
  id: string;
  runCount: number;
  lastRunAt: number | null;
};

type Run = {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
  log: string[];
  createdAt: number;
};

export function WorkflowsClient() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [runsFor, setRunsFor] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/workflows");
    if (res.ok) setWorkflows((await res.json()).workflows);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(w: Workflow) {
    await fetch(`/api/workflows/${w.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !w.enabled }),
    });
    load();
  }

  async function remove(w: Workflow) {
    if (!confirm(`Delete workflow "${w.name}"?`)) return;
    await fetch(`/api/workflows/${w.id}`, { method: "DELETE" });
    load();
  }

  async function openRuns(w: Workflow) {
    setRunsFor(w);
    setRuns(null);
    const res = await fetch(`/api/workflows/${w.id}`);
    if (res.ok) setRuns((await res.json()).runs);
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Workflows"
        subtitle="Automate the busywork — no external tools, no queue servers, runs instantly in-process."
        actions={
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <IconPlus width={15} height={15} /> New workflow
          </button>
        }
      />

      {!workflows ? (
        <Spinner />
      ) : workflows.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          hint='Try: "When a deal is won → create an onboarding task and add a celebration note."'
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <IconPlus width={15} height={15} /> New workflow
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => (
            <div key={w.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  w.enabled ? "bg-accent-600/15 text-accent-600 dark:text-accent-400" : "bg-surface-2 text-ink-muted"
                }`}
              >
                <IconZap width={17} height={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{w.name}</p>
                <p className="text-xs text-ink-muted">
                  {EVENT_LABELS[w.trigger.event as WorkflowEvent] ?? w.trigger.event}
                  {w.conditions.length > 0 && ` · ${w.conditions.length} condition${w.conditions.length > 1 ? "s" : ""}`}
                  {` · ${w.actions.length} action${w.actions.length > 1 ? "s" : ""}`}
                </p>
              </div>
              <button
                onClick={() => openRuns(w)}
                className="text-xs text-ink-muted transition hover:text-accent-600"
              >
                {w.runCount} runs{w.lastRunAt ? ` · last ${timeAgo(w.lastRunAt)}` : ""}
              </button>
              <label className="relative inline-flex cursor-pointer items-center" title={w.enabled ? "Enabled" : "Disabled"}>
                <input
                  type="checkbox"
                  checked={w.enabled}
                  onChange={() => toggle(w)}
                  className="peer sr-only"
                />
                <div className="peer h-5 w-9 rounded-full bg-surface-2 border border-line after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-accent-600 peer-checked:after:translate-x-4" />
              </label>
              <button onClick={() => setEditing(w)} className="btn-ghost !px-2">
                <IconEdit width={15} height={15} />
              </button>
              <button onClick={() => remove(w)} className="btn-ghost !px-2 !text-red-400">
                <IconTrash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal title="New workflow" open={showNew} onClose={() => setShowNew(false)} wide>
        <WorkflowBuilder
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>

      <Modal title="Edit workflow" open={!!editing} onClose={() => setEditing(null)} wide>
        {editing && (
          <WorkflowBuilder
            initial={editing}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>

      <Modal
        title={runsFor ? `Runs — ${runsFor.name}` : "Runs"}
        open={!!runsFor}
        onClose={() => setRunsFor(null)}
        wide
      >
        {!runs ? (
          <Spinner />
        ) : runs.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">This workflow hasn&apos;t fired yet.</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg bg-surface-2 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`chip ${
                      r.status === "success"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                        : "bg-red-500/10 text-red-500"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-xs text-ink-muted">{timeAgo(r.createdAt)}</span>
                </div>
                <ul className="mt-1.5 list-inside list-disc text-xs text-ink-muted">
                  {r.log.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

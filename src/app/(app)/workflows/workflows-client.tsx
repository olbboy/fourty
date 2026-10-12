"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { PageHeader, Modal, EmptyState, Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash, IconZap, IconEdit } from "@/components/icons";
import { formatRunLogLine } from "@/lib/workflows/run-log";
import { workflowEventLabel } from "@/lib/workflow-field-display";
import { WorkflowBuilder, type WorkflowDraft } from "./workflow-builder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";

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
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [runsFor, setRunsFor] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [runsFailed, setRunsFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("workflows");
      setWorkflows((await res.json()).workflows);
    } catch {
      setFailed(true);
    }
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
    const ok = await askConfirm({
      title: t("page.workflows.deleteTitle", { name: w.name }),
      body: t("page.workflows.deleteBody"),
    });
    if (!ok) return;
    await fetch(`/api/workflows/${w.id}`, { method: "DELETE" });
    load();
  }

  async function openRuns(w: Workflow) {
    setRunsFor(w);
    setRuns(null);
    setRunsFailed(false);
    try {
      const res = await fetch(`/api/workflows/${w.id}`);
      if (!res.ok) throw new Error("runs");
      setRuns((await res.json()).runs);
    } catch {
      setRunsFailed(true);
    }
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("nav.workflows")}
        subtitle={t("page.workflows.subtitle")}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <IconPlus width={15} height={15} /> {t("page.workflows.new")}
          </Button>
        }
      />

      {failed ? (
        <LoadError
          onRetry={() => {
            setWorkflows(null);
            void load();
          }}
        />
      ) : !workflows ? (
        <Spinner />
      ) : workflows.length === 0 ? (
        <EmptyState
          title={t("page.workflows.empty")}
          hint={t("page.workflows.emptyHint")}
          action={
            <Button onClick={() => setShowNew(true)}>
              <IconPlus width={15} height={15} /> {t("page.workflows.new")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => (
            <Card size="flush" key={w.id} className="flex flex-wrap items-center gap-3 p-4">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  w.enabled ? "bg-accent-600/15 text-accent-700 dark:text-accent-400" : "bg-surface-2 text-ink-muted"
                }`}
              >
                <IconZap width={17} height={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{w.name}</p>
                <p className="text-xs text-ink-muted">
                  {workflowEventLabel(w.trigger.event, t)}
                  {w.conditions.length > 0 &&
                    ` · ${t(
                      w.conditions.length > 1 ? "page.workflows.conditionsPlural" : "page.workflows.conditions",
                      { count: w.conditions.length },
                    )}`}
                  {` · ${t(
                    w.actions.length > 1 ? "page.workflows.actionsPlural" : "page.workflows.actions",
                    { count: w.actions.length },
                  )}`}
                </p>
              </div>
              <button
                onClick={() => openRuns(w)}
                className="text-xs text-ink-muted transition hover:text-accent-700"
              >
                {w.runCount === 1
                  ? t("page.workflows.runOne")
                  : t("page.workflows.runs", { count: w.runCount })}
                {w.lastRunAt ? ` · ${t("page.workflows.lastRun", { when: timeAgo(w.lastRunAt, locale) })}` : ""}
              </button>
              <label
                className="relative inline-flex cursor-pointer items-center"
                title={w.enabled ? t("page.workflows.enabled") : t("page.workflows.disabled")}
              >
                <input
                  type="checkbox"
                  checked={w.enabled}
                  onChange={() => toggle(w)}
                  aria-label={
                    w.enabled
                      ? t("page.workflows.disableAria", { name: w.name })
                      : t("page.workflows.enableAria", { name: w.name })
                  }
                  className="peer sr-only"
                />
                <div className="peer h-5 w-9 rounded-full bg-surface-2 border border-line after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-accent-600 peer-checked:after:translate-x-4" />
              </label>
              <Button
                onClick={() => setEditing(w)}
                variant="outline"
                size="icon-sm"
                aria-label={t("page.workflows.editAria", { name: w.name })}
              >
                <IconEdit width={15} height={15} />
              </Button>
              <Button
                onClick={() => remove(w)}
                variant="outline"
                size="icon-sm"
                className="text-feedback-error"
                aria-label={t("page.workflows.deleteAria", { name: w.name })}
              >
                <IconTrash width={15} height={15} />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal title={t("page.workflows.newModal")} open={showNew} onClose={() => setShowNew(false)} wide>
        <WorkflowBuilder
          onSaved={() => {
            setShowNew(false);
            load();
          }}
        />
      </Modal>

      <Modal title={t("page.workflows.editModal")} open={!!editing} onClose={() => setEditing(null)} wide>
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
        title={runsFor ? t("page.workflows.runsModal", { name: runsFor.name }) : t("page.workflows.runsTitle")}
        open={!!runsFor}
        onClose={() => setRunsFor(null)}
        wide
      >
        {runsFailed ? (
          <LoadError
            onRetry={() => {
              if (runsFor) void openRuns(runsFor);
            }}
          />
        ) : !runs ? (
          <Spinner />
        ) : runs.length === 0 ? (
          <p className="py-4 text-sm text-ink-muted">{t("page.workflows.noRuns")}</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg bg-surface-2 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`chip ${
                      r.status === "success"
                        ? "bg-feedback-ok-wash text-feedback-ok"
                        : "bg-feedback-error-wash text-feedback-error"
                    }`}
                  >
                    {r.status === "success"
                      ? t("page.workflows.runStatusSuccess")
                      : t("page.workflows.runStatusError")}
                  </span>
                  <span className="text-xs text-ink-muted">{timeAgo(r.createdAt, locale)}</span>
                </div>
                <ul className="mt-1.5 list-inside list-disc text-xs text-ink-muted">
                  {r.log.map((line, i) => (
                    <li key={i}>{formatRunLogLine(line, t)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {confirmDialog}
    </div>
  );
}

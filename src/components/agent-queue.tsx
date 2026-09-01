"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { LoadError } from "@/components/ui";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * What the background agent has queued about this record, and what it last did
 * (Phase 2).
 *
 * The whole point of the work ledger is that "what will the agent do to this
 * record, when, and why" is answerable from a table rather than from a log — so
 * the reason is shown verbatim, in the words the code booked it with.
 *
 * Renders nothing when there is nothing queued and nothing has run, which is the
 * common case on a record no pass has reached yet.
 */
export type AgentTask = {
  id: string;
  kind: string;
  reason: string;
  lane: string;
  attempts: number;
  budget: number;
  dueAt: number;
  finishedAt: number | null;
  outcome: string | null;
};

/** When it will run, in words. "Due now" is a promise, so it is not overstated. */
function whenDue(dueAt: number, t: TFn): string {
  const ms = dueAt - Date.now();
  if (ms <= 0) return t("agent.queueDueNow");
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t("agent.queueDueMin", { n: minutes });
  const hours = Math.round(minutes / 60);
  return t("agent.queueDueHour", { n: hours });
}

export function AgentQueue({ entityType, entityId }: { entityType: string; entityId: string }) {
  const t = useT();
  const locale = useLocale();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [last, setLast] = useState<AgentTask | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setTasks([]);
    setLast(null);
    setFailed(false);
  }, [entityType, entityId]);

  useEffect(() => {
    let live = true;
    fetch(`/api/agent-tasks?entityType=${entityType}&entityId=${entityId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!live) return;
        setFailed(false);
        setTasks(Array.isArray(d.tasks) ? d.tasks : []);
        setLast(d.last ?? null);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [entityType, entityId, retry]);

  if (failed) {
    return (
      <Card size="flush" className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("agent.queueTitle")}</h2>
        <LoadError compact onRetry={() => setRetry((n) => n + 1)} />
      </Card>
    );
  }
  if (tasks.length === 0 && !last) return null;

  return (
    <Card size="flush" className="p-4">
      <h2 className="mb-1 text-sm font-semibold">{t("agent.queueTitle")}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("agent.queueEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="text-sm">
              <span>{task.reason}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {whenDue(task.dueAt, t)}
                {task.attempts > 0 ? t("agent.queueAttempt", { n: task.attempts, budget: task.budget }) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {last && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
          {t("agent.queueLastRun", {
            when: timeAgo(last.finishedAt, locale),
            outcome: last.outcome ?? t("agent.queueNoOutcome"),
          })}
        </p>
      )}
    </Card>
  );
}

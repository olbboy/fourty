"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

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
function whenDue(dueAt: number): string {
  const ms = dueAt - Date.now();
  if (ms <= 0) return "due now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `due in ${hours} h`;
}

export function AgentQueue({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [last, setLast] = useState<AgentTask | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/agent-tasks?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { tasks: [], last: null }))
      .then((d) => {
        if (!live) return;
        setTasks(d.tasks ?? []);
        setLast(d.last ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [entityType, entityId]);

  if (tasks.length === 0 && !last) return null;

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Background work</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing queued.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="text-sm">
              <span>{t.reason}</span>
              <span className="ml-2 text-xs text-ink-muted">
                {whenDue(t.dueAt)}
                {t.attempts > 0 ? ` · attempt ${t.attempts} of ${t.budget}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {last && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-ink-muted">
          Last run {timeAgo(last.finishedAt)}: {last.outcome ?? "no outcome recorded"}
        </p>
      )}
    </div>
  );
}

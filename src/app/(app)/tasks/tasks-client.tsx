"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types";
import { formatDate, fromDateInputValue } from "@/lib/format";
import {
  AsyncError,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PriorityChip,
  Spinner,
} from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { Select } from "@/components/select";

const ENTITY_PATH: Record<string, string> = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

type TaskState = "open" | "done" | "all";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTask(value: unknown): value is Task {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    (value.description === null || typeof value.description === "string") &&
    (value.dueDate === null || typeof value.dueDate === "number") &&
    (value.completedAt === null || typeof value.completedAt === "number") &&
    typeof value.priority === "string" &&
    (value.ownerId === null || typeof value.ownerId === "string") &&
    (value.entityType === null || typeof value.entityType === "string") &&
    (value.entityId === null || typeof value.entityId === "string") &&
    typeof value.createdAt === "number"
  );
}

function isTaskResponse(value: unknown): value is { tasks: Task[] } {
  return isRecord(value) && Array.isArray(value.tasks) && value.tasks.every(isTask);
}

export function TasksClient() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [state, setState] = useState<TaskState>("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const stateRef = useRef<TaskState>(state);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  stateRef.current = state;

  const load = useCallback(async (requestedState = stateRef.current) => {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    setError(null);
    setTasks(null);

    try {
      const res = await fetch(`/api/tasks?state=${encodeURIComponent(requestedState)}`, {
        signal: nextController.signal,
      });
      if (!res.ok) throw new Error("Tasks request failed");
      const payload: unknown = await res.json();
      if (!isTaskResponse(payload)) throw new Error("Tasks response was invalid");
      if (requestId.current !== currentRequest) return;
      setTasks(payload.tasks);
    } catch {
      if (nextController.signal.aborted || requestId.current !== currentRequest) return;
      setError("Could not load tasks");
    } finally {
      if (requestId.current === currentRequest) {
        controller.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(state);
    return () => {
      requestId.current += 1;
      controller.current?.abort();
      controller.current = null;
    };
  }, [load, state]);

  async function toggle(t: Task) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: !t.completedAt }),
    });
    void load();
  }

  async function remove(t: Task) {
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    void load();
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: (f.get("title") as string).trim(),
        description: (f.get("description") as string)?.trim() || null,
        priority: f.get("priority"),
        dueDate: fromDateInputValue((f.get("dueDate") as string) ?? ""),
      }),
    });
    setBusy(false);
    setShowNew(false);
    void load();
  }

  const overdue = (t: Task) => !t.completedAt && t.dueDate && t.dueDate < Date.now();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Tasks"
        subtitle={tasks ? `${tasks.filter((t) => !t.completedAt).length} open` : undefined}
        actions={
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <IconPlus width={15} height={15} /> New task
          </button>
        }
      />

      <div className="mb-4 flex gap-1.5">
        {(["open", "done", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            className={`chip cursor-pointer !px-3 !py-1.5 capitalize transition ${
              state === s
                ? "bg-accent-600 text-white"
                : "border border-line text-ink-muted hover:border-accent-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Loading tasks" />
      ) : error ? (
        <AsyncError
          message={error}
          hint="Check your connection and try again."
          onRetry={() => void load()}
        />
      ) : !tasks ? (
        <AsyncError
          message="Could not load tasks"
          hint="Check your connection and try again."
          onRetry={() => void load()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState title="Nothing here" hint="Tasks you create — or workflows create for you — show up here." />
      ) : (
        <div className="card divide-y divide-line/60">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={!!t.completedAt}
                onChange={() => toggle(t)}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${t.completedAt ? "text-ink-muted line-through" : ""}`}>
                  {t.title}
                </p>
                {t.description && <p className="mt-0.5 text-sm text-ink-muted">{t.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <PriorityChip priority={t.priority} />
                  {t.dueDate && (
                    <span className={overdue(t) ? "font-semibold text-red-500" : ""}>
                      {overdue(t) ? "Overdue · " : "Due "}
                      {formatDate(t.dueDate)}
                    </span>
                  )}
                  {t.entityType && t.entityId && (
                    <Link
                      href={`${ENTITY_PATH[t.entityType]}${t.entityId}`}
                      className="text-accent-600 hover:underline dark:text-accent-400"
                    >
                      View {t.entityType} →
                    </Link>
                  )}
                </div>
              </div>
              <button
                onClick={() => remove(t)}
                className="btn-ghost !border-0 !px-2 !text-red-400"
                aria-label="Delete task"
              >
                <IconTrash width={15} height={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal title="New task" open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Title">
            <input name="title" required className="input" autoFocus />
          </Field>
          <Field label="Description">
            <textarea name="description" rows={2} className="input resize-y" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Priority">
              <Select
                name="priority"
                defaultValue="medium"
                className="input"
                options={[
                  { value: "low", label: "Low" },
                  { value: "medium", label: "Medium" },
                  { value: "high", label: "High" },
                ]}
              />
            </Field>
            <Field label="Due date">
              <input name="dueDate" type="date" className="input" />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : "Create task"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/lib/types";
import { formatDate, fromDateInputValue } from "@/lib/format";
import { PageHeader, Modal, Field, PriorityChip, EmptyState, Spinner } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const ENTITY_PATH: Record<string, string> = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

export function TasksClient() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [state, setState] = useState<"open" | "done" | "all">("open");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks?state=${state}`);
    if (res.ok) setTasks((await res.json()).tasks);
  }, [state]);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(t: Task) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: !t.completedAt }),
    });
    load();
  }

  async function remove(t: Task) {
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
    load();
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
    load();
  }

  const overdue = (t: Task) => !t.completedAt && t.dueDate && t.dueDate < Date.now();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Tasks"
        subtitle={tasks ? `${tasks.filter((t) => !t.completedAt).length} open` : undefined}
        actions={
          <Button onClick={() => setShowNew(true)}>
            <IconPlus width={15} height={15} /> New task
          </Button>
        }
      />

      <div className="mb-4 flex gap-1.5">
        {(["open", "done", "all"] as const).map((s) => (
          <Button
            key={s}
            onClick={() => setState(s)}
            size="sm"
            variant={state === s ? "default" : "outline"}
            className={`rounded-4xl text-xs capitalize ${
              state === s ? "" : "text-ink-muted hover:border-accent-400"
            }`}
          >
            {s}
          </Button>
        ))}
      </div>

      {!tasks ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <EmptyState title="Nothing here" hint="Tasks you create — or workflows create for you — show up here." />
      ) : (
        <Card size="flush" className="divide-y divide-line/60">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-4 py-3">
              {/* The title sits in a sibling element rather than a wrapping
                  label, so the checkbox has to name the task itself. */}
              <input
                type="checkbox"
                checked={!!t.completedAt}
                onChange={() => toggle(t)}
                aria-label={`Mark "${t.title}" complete`}
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
                    <span className={overdue(t) ? "font-semibold text-feedback-error" : ""}>
                      {overdue(t) ? "Overdue · " : "Due "}
                      {formatDate(t.dueDate)}
                    </span>
                  )}
                  {t.entityType && t.entityId && (
                    <Link
                      href={`${ENTITY_PATH[t.entityType]}${t.entityId}`}
                      className="text-accent-700 hover:underline dark:text-accent-400"
                    >
                      View {t.entityType} →
                    </Link>
                  )}
                </div>
              </div>
              <Button
                onClick={() => remove(t)}
                aria-label="Delete task" variant="ghost" size="icon-sm" className="text-feedback-error">
                <IconTrash width={15} height={15} />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Modal title="New task" open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Title">
            <Input name="title" required autoFocus />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={2} className="resize-y" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Priority">
              <NativeSelect name="priority" defaultValue="medium" className="w-full">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </NativeSelect>
            </Field>
            <Field label="Due date">
              <Input name="dueDate" type="date" />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Create task"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

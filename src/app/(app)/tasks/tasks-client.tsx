"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Task } from "@/lib/types";
import { formatDate, fromDateInputValue } from "@/lib/format";
import { PageHeader, Modal, Field, PriorityChip, EmptyState, Spinner, LoadError } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";

const ENTITY_PATH: Record<string, string> = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

export function TasksClient() {
  const t = useT();
  const locale = useLocale();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<"open" | "done" | "all">("open");
  const [activeView, setActiveView] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [busy, setBusy] = useState(false);

  const applyView = useCallback((view: SavedView | null) => {
    setActiveView(view?.id ?? null);
    const next = view?.config?.filters?.state;
    if (next === "open" || next === "done" || next === "all") setState(next);
    else if (!view) setState("open");
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/tasks?state=${state}`);
      if (!res.ok) throw new Error("tasks");
      setTasks((await res.json()).tasks);
    } catch {
      setFailed(true);
    }
  }, [state]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/tasks/assignees")
      .then(async (r) => {
        if (!r.ok) throw new Error("assignees");
        return r.json();
      })
      .then((d) => {
        setAssignees(Array.isArray(d.assignees) ? d.assignees : []);
      })
      .catch(() => {
        setAssignees([]);
      });
  }, []);

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
    const ownerId = (f.get("ownerId") as string) || "";
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: (f.get("title") as string).trim(),
        description: (f.get("description") as string)?.trim() || null,
        priority: f.get("priority"),
        dueDate: fromDateInputValue((f.get("dueDate") as string) ?? ""),
        ownerId: ownerId || null,
      }),
    });
    setBusy(false);
    setShowNew(false);
    load();
  }

  const overdue = (t: Task) => !t.completedAt && t.dueDate && t.dueDate < Date.now();
  const ownerName = (id: string | null) => assignees.find((a) => a.id === id)?.name;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("nav.tasks")}
        subtitle={
          tasks
            ? t("page.tasks.count", { count: tasks.filter((task) => !task.completedAt).length })
            : undefined
        }
        actions={
          <Button onClick={() => setShowNew(true)}>
            <IconPlus width={15} height={15} /> {t("page.tasks.new")}
          </Button>
        }
      />

      <SavedViewsBar
        entity="tasks"
        activeId={activeView}
        current={{ filters: { state } }}
        onApply={applyView}
      />

      <div className="mb-4 flex gap-1.5">
        {(["open", "done", "all"] as const).map((s) => (
          <Button
            key={s}
            onClick={() => {
              setState(s);
              setActiveView(null);
            }}
            aria-label={t("page.tasks.filterAria", {
              state: s === "open" ? t("page.tasks.open") : s === "done" ? t("page.tasks.done") : t("common.all"),
            })}
            size="sm"
            variant={state === s ? "default" : "outline"}
            className={`rounded-4xl text-xs ${
              state === s ? "" : "text-ink-muted hover:border-accent-400"
            }`}
          >
            {s === "open" ? t("page.tasks.open") : s === "done" ? t("page.tasks.done") : t("common.all")}
          </Button>
        ))}
      </div>

      {failed ? (
        <LoadError
          onRetry={() => {
            setTasks(null);
            void load();
          }}
        />
      ) : !tasks ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <EmptyState title={t("page.tasks.empty")} hint={t("page.tasks.emptyHint")} />
      ) : (
        <Card size="flush" className="divide-y divide-line/60">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 px-4 py-3">
              {/* The title sits in a sibling element rather than a wrapping
                  label, so the checkbox has to name the task itself. */}
              <input
                type="checkbox"
                checked={!!task.completedAt}
                onChange={() => toggle(task)}
                aria-label={`Mark "${task.title}" complete`}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${task.completedAt ? "text-ink-muted line-through" : ""}`}>
                  {task.title}
                </p>
                {task.description && <p className="mt-0.5 text-sm text-ink-muted">{task.description}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <PriorityChip priority={task.priority} />
                  {task.dueDate && (
                    <span className={overdue(task) ? "font-semibold text-feedback-error" : ""}>
                      {overdue(task) ? t("page.tasks.overduePrefix") : t("page.tasks.duePrefix")}
                      {formatDate(task.dueDate, locale)}
                    </span>
                  )}
                  <span>{ownerName(task.ownerId) ?? t("common.unassigned")}</span>
                  {task.entityType && task.entityId && (
                    <Link
                      href={`${ENTITY_PATH[task.entityType] ?? `/objects/${task.entityType}/`}${task.entityId}`}
                      className="text-accent-700 hover:underline dark:text-accent-400"
                    >
                      {t("page.tasks.viewEntity", { entity: task.entityType })}
                    </Link>
                  )}
                </div>
              </div>
              <Button
                onClick={() => remove(task)}
                aria-label={t("page.tasks.deleteAria")} variant="ghost" size="icon-sm" className="text-feedback-error">
                <IconTrash width={15} height={15} />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Modal title={t("page.tasks.newModal")} open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label={t("field.title")}>
            <Input name="title" required autoFocus />
          </Field>
          <Field label={t("field.description")}>
            <Textarea name="description" rows={2} className="resize-y" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("field.priority")}>
              <NativeSelect name="priority" defaultValue="medium" className="w-full">
                <option value="low">{t("priority.low")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="high">{t("priority.high")}</option>
              </NativeSelect>
            </Field>
            <Field label={t("field.dueDate")}>
              <Input name="dueDate" type="date" />
            </Field>
          </div>
          <Field label={t("field.assignee")}>
            <NativeSelect name="ownerId" defaultValue="" className="w-full">
              <option value="">{t("common.unassigned")}</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? t("form.saving") : t("form.createTask")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

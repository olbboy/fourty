"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types";
import { formatDate, fromDateInputValue, toDateInputValue } from "@/lib/format";
import {
  PageHeader,
  Modal,
  Field,
  PriorityChip,
  EmptyState,
  Spinner,
  LoadError,
} from "@/components/ui";
import { IconPlus, IconTrash, IconEdit } from "@/components/icons";
import { SavedViewsBar, type SavedView } from "@/components/saved-views";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";
import { BulkBar, OwnerFilter, bulkDelete, reassignOwner, useOwnerPeople } from "@/components/owner-controls";
import { ownerLabel } from "@/lib/owner-display";
import { TaskCalendar } from "@/components/task-calendar";

const ENTITY_PATH: Record<string, string> = {
  contact: "/contacts/",
  company: "/companies/",
  deal: "/deals/",
};

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
  return (
    isRecord(value) && Array.isArray(value.tasks) && value.tasks.every(isTask)
  );
}

export function TasksClient() {
  const t = useT();
  const locale = useLocale();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [failed, setFailed] = useState(false);
  const [state, setState] = useState<"open" | "done" | "all">("open");
  const [view, setView] = useState<"list" | "calendar">("list");
  // "" = any; "none" = unowned; otherwise a member id.
  const [ownerFilter, setOwnerFilter] = useState("");
  const people = useOwnerPeople();
  const [activeView, setActiveView] = useState<string | null>(null);
  const [editor, setEditor] = useState<Task | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const requestRef = useRef<{
    controller: AbortController;
    generation: number;
  } | null>(null);
  const generationRef = useRef(0);
  const submittingRef = useRef(false);

  const applyView = useCallback((view: SavedView | null) => {
    setActiveView(view?.id ?? null);
    const next = view?.config?.filters?.state;
    if (next === "open" || next === "done" || next === "all") setState(next);
    else if (!view) setState("open");
    const owner = view?.config?.filters?.ownerId;
    setOwnerFilter(typeof owner === "string" ? owner : "");
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    requestRef.current = { controller, generation };
    setFailed(false);
    setTasks(null);

    try {
      const response = await fetch(
        `/api/tasks?state=${encodeURIComponent(state)}${ownerFilter ? `&ownerId=${encodeURIComponent(ownerFilter)}` : ""}`,
        {
          signal: controller.signal,
        },
      );
      if (!response.ok)
        throw new Error(`Tasks request failed with ${response.status}`);
      const payload: unknown = await response.json();
      if (!isTaskResponse(payload))
        throw new Error("Tasks response was invalid");
      if (generation !== generationRef.current || controller.signal.aborted)
        return;
      setTasks(payload.tasks);
      setFailed(false);
    } catch {
      if (controller.signal.aborted || generation !== generationRef.current)
        return;
      setFailed(true);
    } finally {
      if (requestRef.current?.generation === generation)
        requestRef.current = null;
    }
  }, [state, ownerFilter]);

  useEffect(() => {
    void load();
    return () => {
      generationRef.current += 1;
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tasks/assignees", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Assignees request failed");
        return (await response.json()) as unknown;
      })
      .then((payload) => {
        if (!isRecord(payload) || !Array.isArray(payload.assignees)) return;
        setAssignees(payload.assignees as { id: string; name: string }[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAssignees([]);
      });
    return () => controller.abort();
  }, []);

  async function toggle(task: Task): Promise<void> {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: !task.completedAt }),
      });
      if (!response.ok) throw new Error("Task update failed");
      void load();
    } catch {
      setFailed(true);
    }
  }

  /** Mark the open tasks shown done in one go; all or none. */
  async function completeShown(ids: string[]) {
    const res = await fetch("/api/tasks/bulk-complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
    if (res?.ok) void load();
  }

  async function remove(task: Task): Promise<void> {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Task deletion failed");
      void load();
    } catch {
      setFailed(true);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editor || submittingRef.current) return;

    submittingRef.current = true;
    setBusy(true);
    setFormError(null);
    const currentEditor = editor;

    try {
      const form = new FormData(event.currentTarget);
      const titleValue = form.get("title");
      const descriptionValue = form.get("description");
      const ownerValue = form.get("ownerId");
      const body = {
        title: typeof titleValue === "string" ? titleValue.trim() : "",
        description:
          typeof descriptionValue === "string"
            ? descriptionValue.trim() || null
            : null,
        priority: form.get("priority"),
        dueDate: fromDateInputValue(
          typeof form.get("dueDate") === "string"
            ? String(form.get("dueDate"))
            : "",
        ),
        ownerId:
          typeof ownerValue === "string" && ownerValue ? ownerValue : null,
      };
      const response = await fetch(
        currentEditor === "new"
          ? "/api/tasks"
          : `/api/tasks/${currentEditor.id}`,
        {
          method: currentEditor === "new" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : t("form.failedSave");
        setFormError(message);
        return;
      }
      setEditor(null);
      void load();
    } catch {
      setFormError(t("form.failedSave"));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  function openEditor(next: Task | "new"): void {
    setFormError(null);
    setEditor(next);
  }

  const overdue = (task: Task): boolean =>
    !task.completedAt && task.dueDate != null && task.dueDate < Date.now();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={t("nav.tasks")}
        subtitle={
          tasks
            ? t("page.tasks.count", {
                count: tasks.filter((task) => !task.completedAt).length,
              })
            : undefined
        }
        actions={
          <Button onClick={() => openEditor("new")}>
            <IconPlus width={15} height={15} aria-hidden="true" />{" "}
            {t("page.tasks.new")}
          </Button>
        }
      />

      <SavedViewsBar
        entity="tasks"
        activeId={activeView}
        current={{ filters: { state, ...(ownerFilter ? { ownerId: ownerFilter } : {}) } }}
        onApply={applyView}
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {(["open", "done", "all"] as const).map((filter) => (
          <Button
            key={filter}
            type="button"
            onClick={() => {
              setState(filter);
              setActiveView(null);
            }}
            aria-label={t("page.tasks.filterAria", {
              state:
                filter === "open"
                  ? t("page.tasks.open")
                  : filter === "done"
                    ? t("page.tasks.done")
                    : t("common.all"),
            })}
            size="sm"
            variant={state === filter ? "default" : "outline"}
            className={`rounded-4xl text-xs ${state === filter ? "" : "text-ink-muted hover:border-accent-400"}`}
          >
            {filter === "open"
              ? t("page.tasks.open")
              : filter === "done"
                ? t("page.tasks.done")
                : t("common.all")}
          </Button>
        ))}
        <OwnerFilter
          value={ownerFilter}
          people={people}
          onChange={(value) => {
            setOwnerFilter(value);
            setActiveView(null);
          }}
        />
        <div role="group" aria-label={t("calendar.viewAria")} className="ml-auto flex gap-1">
          {(["list", "calendar"] as const).map((mode) => (
            <Button key={mode} size="sm" variant={view === mode ? "default" : "outline"} aria-pressed={view === mode} onClick={() => setView(mode)}>
              {mode === "list" ? t("calendar.listView") : t("calendar.calendarView")}
            </Button>
          ))}
        </div>
      </div>

      {/* Handing over: narrow to one owner, then give every task shown to
          someone else, mark them done or delete them, in one go. */}
      {ownerFilter && tasks && tasks.length > 0 && (
        <BulkBar
          count={tasks.length}
          label={t("owner.bulkShown", { count: tasks.length })}
          people={people}
          onReassign={async (ownerId) => {
            const ok = await reassignOwner("tasks", tasks.map((task) => task.id), ownerId);
            if (ok) void load();
            return ok;
          }}
          onDelete={async () => {
            const ok = await bulkDelete("tasks", tasks.map((task) => task.id));
            if (ok) void load();
            return ok;
          }}
        >
          {tasks.some((task) => !task.completedAt) && (
            <Button size="sm" variant="outline" onClick={() => void completeShown(tasks.filter((task) => !task.completedAt).map((task) => task.id))}>
              {t("bulk.complete")}
            </Button>
          )}
        </BulkBar>
      )}

      {failed ? (
        <LoadError
          onRetry={() => {
            setTasks(null);
            void load();
          }}
        />
      ) : !tasks ? (
        <Spinner label="Loading tasks" />
      ) : view === "calendar" ? (
        <TaskCalendar tasks={tasks} onOpen={(task) => openEditor(task)} />
      ) : tasks.length === 0 ? (
        <EmptyState
          title={t("page.tasks.empty")}
          hint={t("page.tasks.emptyHint")}
        />
      ) : (
        <Card size="flush" className="divide-y divide-line/60">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={!!task.completedAt}
                onChange={() => void toggle(task)}
                aria-label={t("page.tasks.completeAria", { title: task.title })}
                className="mt-1 h-4 w-4 accent-indigo-600"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${task.completedAt ? "text-ink-muted line-through" : ""}`}
                >
                  {task.title}
                </p>
                {task.description && (
                  <p className="mt-0.5 text-sm text-ink-muted">
                    {task.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <PriorityChip priority={task.priority} />
                  {task.dueDate && (
                    <span
                      className={
                        overdue(task) ? "font-semibold text-feedback-error" : ""
                      }
                    >
                      {overdue(task)
                        ? t("page.tasks.overduePrefix")
                        : t("page.tasks.duePrefix")}
                      {formatDate(task.dueDate, locale)}
                    </span>
                  )}
                  <span>{ownerLabel(task.ownerId, people, t)}</span>
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
                type="button"
                onClick={() => openEditor(task)}
                aria-label={t("page.tasks.editAria", { title: task.title })}
                variant="ghost"
                size="icon-sm"
              >
                <IconEdit width={15} height={15} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                onClick={() => void remove(task)}
                aria-label={t("page.tasks.deleteAria")}
                variant="ghost"
                size="icon-sm"
                className="text-feedback-error"
              >
                <IconTrash width={15} height={15} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      <Modal
        title={
          editor && editor !== "new"
            ? t("page.tasks.editModal")
            : t("page.tasks.newModal")
        }
        open={editor !== null}
        onClose={() => {
          setFormError(null);
          setEditor(null);
        }}
      >
        <form
          key={editor === "new" || !editor ? "new" : editor.id}
          onSubmit={save}
          className="space-y-4"
        >
          <Field label={t("field.title")}>
            <Input
              name="title"
              required
              autoFocus
              defaultValue={editor && editor !== "new" ? editor.title : ""}
            />
          </Field>
          <Field label={t("field.description")}>
            <Textarea
              name="description"
              rows={2}
              className="resize-y"
              defaultValue={
                editor && editor !== "new" ? (editor.description ?? "") : ""
              }
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("field.priority")}>
              <NativeSelect
                name="priority"
                defaultValue={
                  editor && editor !== "new" ? editor.priority : "medium"
                }
                className="w-full"
              >
                <option value="low">{t("priority.low")}</option>
                <option value="medium">{t("priority.medium")}</option>
                <option value="high">{t("priority.high")}</option>
              </NativeSelect>
            </Field>
            <Field label={t("field.dueDate")}>
              <Input
                name="dueDate"
                type="date"
                defaultValue={
                  editor && editor !== "new"
                    ? toDateInputValue(editor.dueDate)
                    : ""
                }
              />
            </Field>
          </div>
          <Field label={t("field.assignee")}>
            <NativeSelect
              name="ownerId"
              defaultValue={
                editor && editor !== "new" ? (editor.ownerId ?? "") : ""
              }
              className="w-full"
            >
              <option value="">{t("common.unassigned")}</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {formError && (
            <p role="alert" className="text-sm text-feedback-error">
              {formError}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy
                ? t("form.saving")
                : editor === "new"
                  ? t("form.createTask")
                  : t("form.saveChanges")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

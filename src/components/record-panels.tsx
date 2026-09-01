"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, Note, Task } from "@/lib/types";
import { timeAgo, formatDate } from "@/lib/format";
import { PriorityChip, Spinner, LoadError } from "./ui";
import { IconMail, IconPhone, IconCalendar, IconPlus } from "./icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { formatActivityDetail } from "@/lib/activity-display";

type EntityRef = { entityType: string; entityId: string };
type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const ACTIVITY_KEYS: Record<string, MessageKey> = {
  created: "activity.created",
  updated: "activity.updated",
  stage_changed: "activity.stageChanged",
  note_added: "activity.noteAdded",
  task_completed: "activity.taskCompleted",
  email: "activity.email",
  call: "activity.call",
  meeting: "activity.meeting",
  workflow: "activity.workflow",
};

/**
 * Every row already names what happened, so the dot is not what tells one
 * activity from another — it carries how much the record moved. Four weights of
 * the page's own ink, darkening toward the events that changed something, plus
 * the accent on the one kind of entry a person did not make themselves.
 *
 * The ink tokens are used rather than `--chart-1…5`: the chart ladder is fixed
 * across themes, so its dark steps disappear against the dark surface. These
 * flip with the theme.
 */
const ACTIVITY_DOT: Record<string, string> = {
  updated: "bg-ink-muted/50", // ambient field edits
  email: "bg-ink-muted",
  call: "bg-ink-muted",
  meeting: "bg-ink-muted",
  note_added: "bg-ink/60", // someone wrote something
  task_completed: "bg-ink/60",
  stage_changed: "bg-ink", // the record moved
  created: "bg-ink",
  workflow: "bg-accent-500", // written by the system, not by a person
};

function describe(a: Activity, t: TFn): string {
  const label = ACTIVITY_KEYS[a.type] ? t(ACTIVITY_KEYS[a.type]) : a.type;
  if (a.type === "stage_changed" && a.meta.from && a.meta.to) {
    return t("activity.stageChangedDetail", { from: String(a.meta.from), to: String(a.meta.to) });
  }
  if (a.type === "updated" && Array.isArray(a.meta.fields) && a.meta.fields.length) {
    return t("activity.updatedFields", { fields: (a.meta.fields as string[]).join(", ") });
  }
  if (a.type === "task_completed" && a.meta.title) {
    return t("activity.taskCompletedTitle", { title: String(a.meta.title) });
  }
  if (a.meta.note) return t("activity.withNote", { label, note: String(a.meta.note) });
  if (a.meta.detail) return formatActivityDetail(String(a.meta.detail), t);
  return label;
}

async function readJson(res: Response): Promise<unknown> {
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function listOf<T>(data: unknown, key: string): T[] {
  const value = data && typeof data === "object" ? (data as Record<string, unknown>)[key] : null;
  return Array.isArray(value) ? (value as T[]) : [];
}

export function Timeline({ entityType, entityId, refreshKey }: EntityRef & { refreshKey?: number }) {
  const t = useT();
  const locale = useLocale();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setActivities(null);
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/activities?entityType=${entityType}&entityId=${entityId}`)
      .then(readJson)
      .then((d) => {
        if (!cancelled) setActivities(listOf<Activity>(d, "activities"));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, refreshKey, retry]);

  if (failed) {
    return (
      <LoadError
        compact
        onRetry={() => {
          setActivities(null);
          setRetry((n) => n + 1);
        }}
      />
    );
  }
  if (!activities) return <Spinner />;
  if (activities.length === 0)
    return <p className="py-4 text-sm text-ink-muted">{t("record.noActivity")}</p>;

  return (
    <ol className="relative ml-2 space-y-4 border-l border-line pl-5 pt-1">
      {activities.map((a) => (
        <li key={a.id} className="relative">
          <span
            className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${ACTIVITY_DOT[a.type] ?? "bg-ink-muted/50"}`}
          />
          <p className="text-sm">{describe(a, t)}</p>
          <p className="text-xs text-ink-muted">{timeAgo(a.createdAt, locale)}</p>
        </li>
      ))}
    </ol>
  );
}

export function LogTouchpoint({
  entityType,
  entityId,
  onLogged,
}: EntityRef & { onLogged: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function log(type: "email" | "call" | "meeting") {
    setBusy(type);
    setError(null);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, entityType, entityId }),
      });
      if (!res.ok) {
        setError(t("activity.failedWrite"));
        return;
      }
      onLogged();
    } catch {
      setError(t("activity.failedWrite"));
    } finally {
      setBusy(null);
    }
  }
  const buttons = [
    { type: "email" as const, icon: IconMail, label: t("activity.emailBtn"), title: t("activity.logEmail") },
    { type: "call" as const, icon: IconPhone, label: t("activity.callBtn"), title: t("activity.logCall") },
    { type: "meeting" as const, icon: IconCalendar, label: t("activity.meetingBtn"), title: t("activity.logMeeting") },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        {buttons.map(({ type, icon: Icon, label, title }) => (
          <Button
            key={type}
            onClick={() => log(type)}
            disabled={busy !== null}
            title={title} variant="outline" size="sm" className="flex-1 text-xs">
            <Icon width={14} height={14} /> {label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-xs text-feedback-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function NotesPanel({ entityType, entityId, onChanged }: EntityRef & { onChanged?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    setNotes(null);
    setError(null);
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/notes?entityType=${entityType}&entityId=${entityId}`)
      .then(readJson)
      .then((d) => {
        if (!cancelled) setNotes(listOf<Note>(d, "notes"));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, retry]);

  async function add() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft.trim(), entityType, entityId }),
      });
      if (!res.ok) {
        setError(t("activity.failedWrite"));
        return;
      }
      setDraft("");
      reload();
      onChanged?.();
    } catch {
      setError(t("activity.failedWrite"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add();
          }}
          aria-label={t("activity.newNote")}
          rows={2}
          placeholder={t("activity.notePlaceholder")} className="resize-y" />
        <Button onClick={add} disabled={busy || !draft.trim()} className="self-start">
          {t("activity.addNote")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-feedback-error">
          {error}
        </p>
      )}
      {failed ? (
        <LoadError
          compact
          onRetry={() => {
            setNotes(null);
            reload();
          }}
        />
      ) : !notes ? (
        <Spinner />
      ) : (
        notes.map((n) => (
          <div key={n.id} className="rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            <p className="mt-1 text-xs text-ink-muted">{timeAgo(n.createdAt, locale)}</p>
          </div>
        ))
      )}
    </div>
  );
}

export function TasksPanel({ entityType, entityId, onChanged }: EntityRef & { onChanged?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    setTasks(null);
    setError(null);
  }, [entityType, entityId]);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/tasks?state=all&entityType=${entityType}&entityId=${entityId}`)
      .then(readJson)
      .then((d) => {
        if (!cancelled) setTasks(listOf<Task>(d, "tasks"));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, retry]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tasks/assignees")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setAssignees(Array.isArray(d.assignees) ? d.assignees : []);
      })
      .catch(() => {
        if (!cancelled) setAssignees([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function add() {
    if (!draft.trim()) return;
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.trim(),
          entityType,
          entityId,
          ownerId: ownerId || null,
        }),
      });
      if (!res.ok) {
        setError(t("activity.failedWrite"));
        return;
      }
      setDraft("");
      reload();
    } catch {
      setError(t("activity.failedWrite"));
    }
  }

  async function toggle(task: Task) {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: !task.completedAt }),
      });
      if (!res.ok) {
        setError(t("activity.failedWrite"));
        return;
      }
      reload();
      onChanged?.();
    } catch {
      setError(t("activity.failedWrite"));
    }
  }

  const open = (tasks ?? []).filter((t) => !t.completedAt);
  const done = (tasks ?? []).filter((t) => t.completedAt);
  const ownerName = (id: string | null) => assignees.find((a) => a.id === id)?.name;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label={t("activity.newTask")}
          placeholder={t("activity.taskPlaceholder")} />
        {/* Icon-only; the adjacent input's placeholder does not name this. */}
        <Button onClick={add} disabled={!draft.trim()} aria-label={t("activity.addTask")} variant="outline" size="icon">
          <IconPlus width={15} height={15} />
        </Button>
      </div>
      <NativeSelect
        value={ownerId}
        onChange={(e) => setOwnerId(e.target.value)}
        aria-label={t("field.assignee")}
        className="w-full"
      >
        <option value="">{t("common.unassigned")}</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
      {error && (
        <p role="alert" className="text-xs text-feedback-error">
          {error}
        </p>
      )}
      {failed ? (
        <LoadError
          compact
          onRetry={() => {
            setTasks(null);
            reload();
          }}
        />
      ) : !tasks ? (
        <Spinner />
      ) : (
        <>
          {[...open, ...done].map((task) => (
            <label key={task.id} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={!!task.completedAt}
                onChange={() => toggle(task)}
                className="mt-0.5 h-4 w-4 accent-indigo-600"
              />
              <span className="flex-1">
                <span className={`text-sm ${task.completedAt ? "text-ink-muted line-through" : ""}`}>
                  {task.title}
                </span>
                <span className="ml-2 inline-flex items-center gap-1.5">
                  <PriorityChip priority={task.priority} />
                  {task.dueDate && (
                    <span
                      className={`text-xs ${!task.completedAt && task.dueDate < Date.now() ? "font-medium text-feedback-error" : "text-ink-muted"}`}
                    >
                      {formatDate(task.dueDate, locale)}
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">
                    {ownerName(task.ownerId) ?? t("common.unassigned")}
                  </span>
                </span>
              </span>
            </label>
          ))}
          {tasks.length === 0 && <p className="text-sm text-ink-muted">{t("activity.noTasks")}</p>}
        </>
      )}
    </div>
  );
}

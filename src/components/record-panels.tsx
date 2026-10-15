"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, Note, Task } from "@/lib/types";
import { timeAgo, formatDate } from "@/lib/format";
import { PriorityChip, Spinner, LoadError, useConfirm } from "./ui";
import { IconMail, IconPhone, IconCalendar, IconPlus } from "./icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { Locale, MessageKey } from "@/lib/i18n";
import { formatActivityDetail, formatOwnerChange, formatValueChanges } from "@/lib/activity-display";
import { ownerLabel } from "@/lib/owner-display";
import { useOwnerPeople } from "./owner-controls";

type EntityRef = { entityType: string; entityId: string };
type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

const ACTIVITY_KEYS: Record<string, MessageKey> = {
  returned: "activity.returned",
  created: "activity.created",
  updated: "activity.updated",
  stage_changed: "activity.stageChanged",
  owner_changed: "activity.ownerChanged",
  note_added: "activity.noteAdded",
  task_completed: "activity.taskCompleted",
  email: "activity.email",
  call: "activity.call",
  meeting: "activity.meeting",
  workflow: "activity.workflow",
  merged: "activity.merged",
  quote: "activity.quote",
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
  owner_changed: "bg-ink", // the record changed hands
  created: "bg-ink",
  merged: "bg-ink", // two records became one
  workflow: "bg-accent-500", // written by the system, not by a person
};

/** Fields whose old → new value `meta.changes` already spells out. */
const VALUE_FIELDS = new Set(["amount", "currency", "expectedCloseDate"]);

function describe(a: Activity, t: TFn, locale: Locale): string {
  const label = ACTIVITY_KEYS[a.type] ? t(ACTIVITY_KEYS[a.type]) : a.type;
  // A deal write can carry value changes on whichever entry it produced.
  const changes = formatValueChanges(a.meta.changes, t, locale);
  const withChanges = (text: string) => (changes ? `${text} · ${changes}` : text);
  if (a.type === "stage_changed" && a.meta.from && a.meta.to) {
    return withChanges(t("activity.stageChangedDetail", { from: String(a.meta.from), to: String(a.meta.to) }));
  }
  if (a.type === "owner_changed") return withChanges(formatOwnerChange(a.meta, t));
  if (a.type === "updated" && changes) {
    const others = Array.isArray(a.meta.fields) ? (a.meta.fields as string[]).filter((f) => !VALUE_FIELDS.has(f)) : [];
    return t("activity.updatedFields", { fields: [changes, ...others].join("; ") });
  }
  if (a.type === "updated" && Array.isArray(a.meta.fields) && a.meta.fields.length) {
    return t("activity.updatedFields", { fields: (a.meta.fields as string[]).join(", ") });
  }
  // Written and sent from the CRM; a synced email has no `sent`.
  if (a.type === "email" && a.meta.sent && a.meta.subject) {
    return t("activity.emailSent", { to: String(a.meta.toName ?? ""), subject: String(a.meta.subject) });
  }
  if (a.type === "merged" && a.meta.from) return t("activity.mergedFrom", { from: String(a.meta.from) });
  if (a.type === "returned" && a.meta.source) return t("activity.returnedFrom", { source: String(a.meta.source) });
  if (a.type === "quote" && a.meta.number) return t("activity.quoteMade", { number: String(a.meta.number) });
  if (a.type === "task_completed" && a.meta.title) {
    return t("activity.taskCompletedTitle", { title: String(a.meta.title) });
  }
  // A hand-logged call or meeting says how long it took.
  const timed = typeof a.meta.durationMinutes === "number" ? `${label} (${t("activity.minutes", { n: a.meta.durationMinutes })})` : label;
  if (a.meta.note) return t("activity.withNote", { label: timed, note: String(a.meta.note) });
  if (timed !== label) return timed;
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
          <p className="text-sm">{describe(a, t, locale)}</p>
          <p className="text-xs text-ink-muted">{timeAgo(a.createdAt, locale)}</p>
        </li>
      ))}
    </ol>
  );
}

/** "YYYY-MM-DDTHH:mm" in local time, the value a datetime-local input takes. */
function localDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type TouchpointType = "email" | "call" | "meeting";

/**
 * Log an email, call or meeting by hand (D10): pick the kind, then say when it
 * happened (now unless changed), for how long, and what was said.
 */
export function LogTouchpoint({
  entityType,
  entityId,
  onLogged,
}: EntityRef & { onLogged: () => void }) {
  const t = useT();
  const [open, setOpen] = useState<TouchpointType | null>(null);
  const [when, setWhen] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start(type: TouchpointType) {
    setOpen(type);
    setWhen(localDateTime(Date.now()));
    setMinutes("");
    setNote("");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    setError(null);
    const occurredAt = when ? new Date(when).getTime() : undefined;
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: open,
          entityType,
          entityId,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(occurredAt && Number.isFinite(occurredAt) ? { occurredAt } : {}),
          ...(minutes ? { durationMinutes: Number(minutes) } : {}),
        }),
      });
      if (!res.ok) {
        // The server says what was wrong ("occurredAt: at most a day ahead").
        const message = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setError(message ?? t("activity.failedWrite"));
        return;
      }
      setOpen(null);
      onLogged();
    } catch {
      setError(t("activity.failedWrite"));
    } finally {
      setBusy(false);
    }
  }

  const buttons = [
    { type: "email" as const, icon: IconMail, label: t("activity.emailBtn"), title: t("activity.logEmail") },
    { type: "call" as const, icon: IconPhone, label: t("activity.callBtn"), title: t("activity.logCall") },
    { type: "meeting" as const, icon: IconCalendar, label: t("activity.meetingBtn"), title: t("activity.logMeeting") },
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {buttons.map(({ type, icon: Icon, label, title }) => (
          <Button
            key={type}
            onClick={() => start(type)}
            aria-pressed={open === type}
            title={title}
            variant={open === type ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs"
          >
            <Icon width={14} height={14} /> {label}
          </Button>
        ))}
      </div>
      {open && (
        <form className="space-y-2" onSubmit={save} aria-label={buttons.find((b) => b.type === open)!.title}>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={when}
              min="2000-01-01T00:00"
              max={localDateTime(Date.now() + 86_400_000)}
              onChange={(e) => setWhen(e.target.value)}
              aria-label={t("activity.when")}
              className="h-8 min-w-0 flex-1"
            />
            {open !== "email" && (
              <Input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                aria-label={t("activity.minutesAria")}
                placeholder={t("activity.minutesPlaceholder")}
                className="h-8 w-24"
              />
            )}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label={t("activity.noteAria")}
            placeholder={t("activity.touchpointNotePlaceholder")}
            rows={2}
            maxLength={2000}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
              {t("action.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {t("activity.save")}
            </Button>
          </div>
        </form>
      )}
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
  // The note being corrected, and its text so far.
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [askConfirm, confirmDialog] = useConfirm();
  const reload = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    setNotes(null);
    setError(null);
  }, [entityType, entityId]);

  // Correct or remove a note; the timeline line it left follows on the server.
  async function change(method: "PATCH" | "DELETE", id: string, body?: string): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify({ body }) } : {}),
      });
      if (!res.ok) {
        setError(t("activity.failedWrite"));
        return;
      }
      setEditing(null);
      reload();
      onChanged?.();
    } catch {
      setError(t("activity.failedWrite"));
    }
  }

  async function remove(note: Note) {
    const ok = await askConfirm({
      title: t("activity.deleteNoteTitle"),
      body: t("activity.deleteNoteBody"),
      confirmLabel: t("activity.deleteNote"),
    });
    if (ok) await change("DELETE", note.id);
  }

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
            {editing?.id === n.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editing.body}
                  onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                  aria-label={t("activity.editNoteAria")}
                  rows={3}
                  className="resize-y"
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={!editing.body.trim()} onClick={() => void change("PATCH", n.id, editing.body.trim())}>
                    {t("action.save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    {t("action.cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
            )}
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
              <span>
                {timeAgo(n.createdAt, locale)}
                {n.editedAt ? ` · ${t("activity.noteEdited")}` : ""}
              </span>
              {n.canChange && editing?.id !== n.id && (
                <span className="ml-auto flex gap-1">
                  {/* Named apart from the record's own Edit/Delete buttons on the same page. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("activity.editThisNote")}
                    onClick={() => setEditing({ id: n.id, body: n.body })}
                  >
                    {t("activity.editNote")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-feedback-error"
                    aria-label={t("activity.deleteThisNote")}
                    onClick={() => void remove(n)}
                  >
                    {t("activity.deleteNote")}
                  </Button>
                </span>
              )}
            </div>
          </div>
        ))
      )}
      {confirmDialog}
    </div>
  );
}

export function TasksPanel({ entityType, entityId, onChanged }: EntityRef & { onChanged?: () => void }) {
  const t = useT();
  const locale = useLocale();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  // Everyone who has been a member, so a task of someone who left keeps their name.
  const people = useOwnerPeople();
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
                  <span className="text-xs text-ink-muted">{ownerLabel(task.ownerId, people, t)}</span>
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

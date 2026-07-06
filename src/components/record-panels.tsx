"use client";

import { useCallback, useEffect, useState } from "react";
import type { Activity, Note, Task } from "@/lib/types";
import { timeAgo, formatDate } from "@/lib/format";
import { PriorityChip } from "./ui";
import { IconMail, IconPhone, IconCalendar, IconPlus } from "./icons";

type EntityRef = { entityType: "contact" | "company" | "deal"; entityId: string };

const ACTIVITY_LABEL: Record<string, string> = {
  created: "created this record",
  updated: "updated",
  stage_changed: "moved stage",
  note_added: "added a note",
  task_completed: "completed a task",
  email: "logged an email",
  call: "logged a call",
  meeting: "logged a meeting",
  workflow: "workflow ran",
};

const ACTIVITY_DOT: Record<string, string> = {
  created: "bg-emerald-400",
  updated: "bg-slate-400",
  stage_changed: "bg-violet-400",
  note_added: "bg-amber-400",
  task_completed: "bg-emerald-400",
  email: "bg-blue-400",
  call: "bg-teal-400",
  meeting: "bg-fuchsia-400",
  workflow: "bg-accent-500",
};

function describe(a: Activity): string {
  const label = ACTIVITY_LABEL[a.type] ?? a.type;
  if (a.type === "stage_changed" && a.meta.from && a.meta.to) {
    return `moved stage: ${a.meta.from} → ${a.meta.to}`;
  }
  if (a.type === "updated" && Array.isArray(a.meta.fields) && a.meta.fields.length) {
    return `updated ${(a.meta.fields as string[]).join(", ")}`;
  }
  if (a.type === "task_completed" && a.meta.title) {
    return `completed task "${a.meta.title}"`;
  }
  if (a.meta.note) return `${label} — ${a.meta.note}`;
  if (a.meta.detail) return String(a.meta.detail);
  return label;
}

export function Timeline({ entityType, entityId, refreshKey }: EntityRef & { refreshKey?: number }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  useEffect(() => {
    fetch(`/api/activities?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((d) => setActivities(d.activities ?? []));
  }, [entityType, entityId, refreshKey]);

  if (activities.length === 0)
    return <p className="py-4 text-sm text-ink-muted">No activity yet.</p>;

  return (
    <ol className="relative ml-2 space-y-4 border-l border-line pl-5 pt-1">
      {activities.map((a) => (
        <li key={a.id} className="relative">
          <span
            className={`absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full ${ACTIVITY_DOT[a.type] ?? "bg-slate-400"}`}
          />
          <p className="text-sm">{describe(a)}</p>
          <p className="text-xs text-ink-muted">{timeAgo(a.createdAt)}</p>
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
  const [busy, setBusy] = useState<string | null>(null);
  async function log(type: "email" | "call" | "meeting") {
    setBusy(type);
    await fetch("/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, entityType, entityId }),
    });
    setBusy(null);
    onLogged();
  }
  const buttons = [
    { type: "email" as const, icon: IconMail, label: "Email" },
    { type: "call" as const, icon: IconPhone, label: "Call" },
    { type: "meeting" as const, icon: IconCalendar, label: "Meeting" },
  ];
  return (
    <div className="flex gap-2">
      {buttons.map(({ type, icon: Icon, label }) => (
        <button
          key={type}
          onClick={() => log(type)}
          disabled={busy !== null}
          className="btn-ghost flex-1 !py-1.5 text-xs"
          title={`Log ${label.toLowerCase()}`}
        >
          <Icon width={14} height={14} /> {label}
        </button>
      ))}
    </div>
  );
}

export function NotesPanel({ entityType, entityId, onChanged }: EntityRef & { onChanged?: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/notes?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d) => setNotes(d.notes ?? []));
  }, [entityType, entityId]);
  useEffect(load, [load]);

  async function add() {
    if (!draft.trim()) return;
    setBusy(true);
    await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: draft.trim(), entityType, entityId }),
    });
    setDraft("");
    setBusy(false);
    load();
    onChanged?.();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add();
          }}
          rows={2}
          placeholder="Write a note… (⌘⏎ to save)"
          className="input resize-y"
        />
        <button onClick={add} disabled={busy || !draft.trim()} className="btn-primary self-start">
          Add
        </button>
      </div>
      {notes.map((n) => (
        <div key={n.id} className="rounded-lg bg-surface-2 px-3 py-2.5">
          <p className="whitespace-pre-wrap text-sm">{n.body}</p>
          <p className="mt-1 text-xs text-ink-muted">{timeAgo(n.createdAt)}</p>
        </div>
      ))}
    </div>
  );
}

export function TasksPanel({ entityType, entityId, onChanged }: EntityRef & { onChanged?: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState("");

  const load = useCallback(() => {
    fetch(`/api/tasks?state=all&entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => setTasks(d.tasks ?? []));
  }, [entityType, entityId]);
  useEffect(load, [load]);

  async function add() {
    if (!draft.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: draft.trim(), entityType, entityId }),
    });
    setDraft("");
    load();
  }

  async function toggle(t: Task) {
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: !t.completedAt }),
    });
    load();
    onChanged?.();
  }

  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a task…"
          className="input"
        />
        <button onClick={add} disabled={!draft.trim()} className="btn-ghost">
          <IconPlus width={15} height={15} />
        </button>
      </div>
      {[...open, ...done].map((t) => (
        <label key={t.id} className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={!!t.completedAt}
            onChange={() => toggle(t)}
            className="mt-0.5 h-4 w-4 accent-indigo-600"
          />
          <span className="flex-1">
            <span className={`text-sm ${t.completedAt ? "text-ink-muted line-through" : ""}`}>
              {t.title}
            </span>
            <span className="ml-2 inline-flex items-center gap-1.5">
              <PriorityChip priority={t.priority} />
              {t.dueDate && (
                <span
                  className={`text-xs ${!t.completedAt && t.dueDate < Date.now() ? "font-medium text-red-500" : "text-ink-muted"}`}
                >
                  {formatDate(t.dueDate)}
                </span>
              )}
            </span>
          </span>
        </label>
      ))}
      {tasks.length === 0 && <p className="text-sm text-ink-muted">No tasks.</p>}
    </div>
  );
}

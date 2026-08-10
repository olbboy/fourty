"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type ViewConfig = {
  filters?: Record<string, unknown>;
  sort?: string;
  columns?: string[];
};

export type SavedView = {
  id: string;
  entity: string;
  name: string;
  config: ViewConfig;
  shared: boolean;
};

/**
 * Saved-views bar (Gate C3). Lists the workspace's views for an entity, applies
 * one on click, and saves the caller's current filter/sort as a new view. Keeps
 * its own list state; the parent owns the applied config. Accessible: the view
 * row is a toolbar of toggle buttons with aria-pressed reflecting the active view.
 */
export function SavedViewsBar({
  entity,
  current,
  activeId,
  onApply,
}: {
  entity: string;
  current: ViewConfig;
  activeId: string | null;
  onApply: (view: SavedView | null) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/saved-views?entity=${encodeURIComponent(entity)}`);
    if (res.ok) setViews((await res.json()).views);
  }, [entity]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entity, name: trimmed, config: current }),
    });
    if (res.ok) {
      const { view } = await res.json();
      setViews((v) => [...v, view].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setSaving(false);
      onApply(view);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
    if (res.ok) {
      setViews((v) => v.filter((x) => x.id !== id));
      if (activeId === id) onApply(null);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Saved views">
      <Button
        type="button"
        onClick={() => onApply(null)}
        aria-pressed={activeId === null}
        size="sm"
        variant="outline"
        className={`rounded-4xl px-2.5 text-xs ${activeId === null ? "border-accent-500 bg-accent-50 text-accent-700 dark:text-accent-400" : ""}`}
      >
        All
      </Button>
      {views.map((v) => (
        <span key={v.id} className="group inline-flex items-center">
          <Button
            type="button"
            onClick={() => onApply(v)}
            aria-pressed={activeId === v.id}
            size="sm"
            variant="outline"
            className={`rounded-4xl px-2.5 text-xs ${activeId === v.id ? "border-accent-500 bg-accent-50 text-accent-700 dark:text-accent-400" : ""}`}
            title={v.shared ? "Shared view" : "Personal view"}
          >
            {v.name}
            {v.shared && <span className="ml-1 text-[10px] text-ink-muted">shared</span>}
          </Button>
          <button
            type="button"
            onClick={() => remove(v.id)}
            aria-label={`Delete view ${v.name}`}
            className="ml-0.5 hidden rounded px-1 text-ink-muted hover:text-feedback-error group-hover:inline"
          >
            ×
          </button>
        </span>
      ))}
      {saving ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setSaving(false);
            }}
            placeholder="View name…"
            aria-label="New view name" className="h-7 w-32 py-0 text-xs" />
          <Button type="button" onClick={save} size="sm" variant="outline" className="rounded-4xl px-2.5 text-xs">
            Save
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          onClick={() => setSaving(true)}
          size="sm"
          variant="outline"
          className="rounded-4xl px-2.5 text-xs text-ink-muted"
        >
          + Save view
        </Button>
      )}
    </div>
  );
}

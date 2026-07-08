"use client";

import { useCallback, useEffect, useState } from "react";

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
      <button
        type="button"
        onClick={() => onApply(null)}
        aria-pressed={activeId === null}
        className={`chip-btn ${activeId === null ? "chip-active" : ""}`}
      >
        All
      </button>
      {views.map((v) => (
        <span key={v.id} className="group inline-flex items-center">
          <button
            type="button"
            onClick={() => onApply(v)}
            aria-pressed={activeId === v.id}
            className={`chip-btn ${activeId === v.id ? "chip-active" : ""}`}
            title={v.shared ? "Shared view" : "Personal view"}
          >
            {v.name}
            {v.shared && <span className="ml-1 text-[10px] text-ink-muted">shared</span>}
          </button>
          <button
            type="button"
            onClick={() => remove(v.id)}
            aria-label={`Delete view ${v.name}`}
            className="ml-0.5 hidden rounded px-1 text-ink-muted hover:text-danger group-hover:inline"
          >
            ×
          </button>
        </span>
      ))}
      {saving ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setSaving(false);
            }}
            placeholder="View name…"
            aria-label="New view name"
            className="input h-7 w-32 py-0 text-xs"
          />
          <button type="button" onClick={save} className="chip-btn">
            Save
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setSaving(true)} className="chip-btn text-ink-muted">
          + Save view
        </button>
      )}
    </div>
  );
}

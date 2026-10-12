"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";

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
  const t = useT();
  const [views, setViews] = useState<SavedView[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/saved-views?entity=${encodeURIComponent(entity)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setViews(Array.isArray(d.views) ? d.views : []);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, retry]);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const res = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entity, name: trimmed, config: current }),
      });
      if (!res.ok) {
        setError(t("views.failedSave"));
        return;
      }
      const { view } = await res.json();
      setViews((v) => [...v, view].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setSaving(false);
      onApply(view);
    } catch {
      setError(t("views.failedSave"));
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/saved-views/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(t("views.failedDelete"));
        return;
      }
      setViews((v) => v.filter((x) => x.id !== id));
      if (activeId === id) onApply(null);
    } catch {
      setError(t("views.failedDelete"));
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t("views.toolbar")}>
      <Button
        type="button"
        onClick={() => onApply(null)}
        aria-pressed={activeId === null}
        size="sm"
        variant="outline"
        className={`rounded-4xl px-2.5 text-xs ${activeId === null ? "border-accent-500 bg-accent-50 text-accent-700 dark:text-accent-400" : ""}`}
      >
        {t("common.all")}
      </Button>
      {failed ? (
        <LoadError compact onRetry={() => setRetry((n) => n + 1)} />
      ) : (
        <>
          {views.map((v) => (
            <span key={v.id} className="group inline-flex items-center">
              <Button
                type="button"
                onClick={() => onApply(v)}
                aria-pressed={activeId === v.id}
                size="sm"
                variant="outline"
                className={`rounded-4xl px-2.5 text-xs ${activeId === v.id ? "border-accent-500 bg-accent-50 text-accent-700 dark:text-accent-400" : ""}`}
                title={v.shared ? t("views.sharedTitle") : t("views.personalTitle")}
              >
                {v.name}
                {v.shared && <span className="ml-1 text-[10px] text-ink-muted">{t("views.shared")}</span>}
              </Button>
              <button
                type="button"
                onClick={() => remove(v.id)}
                aria-label={t("views.deleteAria", { name: v.name })}
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
                  if (e.key === "Escape") {
                    setSaving(false);
                    setError(null);
                  }
                }}
                placeholder={t("views.namePlaceholder")}
                aria-label={t("views.nameAria")} className="h-7 w-32 py-0 text-xs" />
              <Button type="button" onClick={save} size="sm" variant="outline" className="rounded-4xl px-2.5 text-xs">
                {t("action.save")}
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              onClick={() => {
                setError(null);
                setSaving(true);
              }}
              size="sm"
              variant="outline"
              className="rounded-4xl px-2.5 text-xs text-ink-muted"
            >
              {t("views.save")}
            </Button>
          )}
          {error && (
            <p role="alert" className="px-1 text-xs text-feedback-error">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

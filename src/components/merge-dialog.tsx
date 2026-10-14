"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

type Candidate = { id: string; label: string; detail: string | null };

/**
 * Merge (CONTEXT.md): pick a duplicate of this contact or company and fold it
 * in here. Its links, tasks, notes and timeline move over, empty fields here
 * take its values, and the duplicate goes to the Trash.
 */
export function MergeDialog({
  kind,
  keepId,
  keepLabel,
  open,
  initial,
  onClose,
  onMerged,
}: {
  kind: "contact" | "company";
  keepId: string;
  keepLabel: string;
  open: boolean;
  /** A duplicate already known (from the duplicate card), chosen up front. */
  initial?: Candidate | null;
  onClose: () => void;
  onMerged: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState<Candidate | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = kind === "contact" ? "contacts" : "companies";

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setFound([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/${path}?q=${encodeURIComponent(q.trim())}&limit=8`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: Record<string, Record<string, unknown>[]> | null) => {
          const rows = body?.[path] ?? [];
          setFound(
            rows
              .filter((row) => row.id !== keepId)
              .map((row) =>
                kind === "contact"
                  ? { id: String(row.id), label: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim(), detail: (row.email as string) ?? null }
                  : { id: String(row.id), label: String(row.name ?? ""), detail: (row.domain as string) ?? null },
              ),
          );
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, q, path, kind, keepId]);

  async function merge() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/${path}/${keepId}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ duplicateId: chosen.id }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      onMerged();
      return;
    }
    const message = res ? ((await res.json().catch(() => ({}))) as { error?: string }).error : undefined;
    setError(message ?? t("merge.failed"));
  }

  return (
    <Modal title={t("merge.title", { name: keepLabel })} open={open} onClose={onClose}>
      <div className="space-y-3">
        {!chosen ? (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("merge.searchAria")} placeholder={t("merge.searchPlaceholder")} autoFocus />
            <ul className="space-y-1">
              {found.map((c) => (
                <li key={c.id}>
                  <Button variant="ghost" className="w-full justify-start" onClick={() => setChosen(c)}>
                    <span className="font-medium">{c.label}</span>
                    {c.detail && <span className="ml-2 text-xs text-ink-muted">{c.detail}</span>}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="text-sm">{t("merge.explain", { dupe: chosen.label, keep: keepLabel })}</p>
            {error && (
              <p role="alert" className="text-sm text-feedback-error">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => (initial ? onClose() : setChosen(null))}>
                {initial ? t("action.cancel") : t("merge.back")}
              </Button>
              <Button onClick={() => void merge()} disabled={busy}>
                {t("merge.confirm", { dupe: chosen.label })}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

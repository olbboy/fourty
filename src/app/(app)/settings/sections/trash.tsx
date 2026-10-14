"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui";
import { useOwnerPeople } from "@/components/owner-controls";
import { ownerLabel } from "@/lib/owner-display";
import { timeAgo } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

type Item = {
  id: string;
  entityType: "contact" | "company" | "deal" | "task";
  entityId: string;
  label: string;
  deletedBy: string | null;
  deletedAt: number;
  expiresAt: number;
};

/**
 * The Trash (D3): what was deleted in the last 30 days. Anyone who may create
 * that kind of record can restore it; only an admin deletes for good.
 */
export function TrashSection({ isAdmin }: { isAdmin: boolean }) {
  const t = useT();
  const locale = useLocale();
  const people = useOwnerPeople();
  const [askConfirm, confirmDialog] = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/trash").catch(() => null);
    if (res?.ok) setItems(((await res.json()) as { items: Item[] }).items);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function restore(item: Item) {
    setMessage(null);
    const res = await fetch(`/api/trash/${item.id}/restore`, { method: "POST" }).catch(() => null);
    if (res?.ok) setMessage({ kind: "ok", text: t("trash.restored", { label: item.label }) });
    else if (res?.status === 409) setMessage({ kind: "error", text: t("trash.conflict", { label: item.label }) });
    else setMessage({ kind: "error", text: t("trash.failed") });
    void load();
  }

  async function purge(item: Item) {
    const ok = await askConfirm({
      title: t("trash.purgeTitle", { label: item.label }),
      body: t("trash.purgeBody"),
      confirmLabel: t("trash.purge"),
    });
    if (!ok) return;
    setMessage(null);
    const res = await fetch(`/api/trash/${item.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setMessage({ kind: "error", text: t("trash.failed") });
    void load();
  }

  if (!items) return null;
  return (
    <Card size="flush" className="p-4">
      <h2 className="text-sm font-semibold">{t("trash.title")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("trash.hint")}</p>
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mb-2 text-sm ${message.kind === "error" ? "text-feedback-error" : "text-feedback-ok"}`}>
          {message.text}
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("trash.empty")}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="text-xs text-ink-muted">
                  {t(`trash.kind.${item.entityType}` as MessageKey)}
                  {" · "}
                  {t("trash.deleted", { when: timeAgo(item.deletedAt, locale) })}
                  {item.deletedBy && ` ${t("trash.deletedBy", { name: ownerLabel(item.deletedBy, people, t) })}`}
                  {" · "}
                  {t("trash.daysLeft", { days: Math.max(1, Math.ceil((item.expiresAt - Date.now()) / 86_400_000)) })}
                </p>
              </div>
              <Button size="sm" variant="outline" aria-label={t("trash.restoreAria", { label: item.label })} onClick={() => void restore(item)}>
                {t("trash.restore")}
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-feedback-error"
                  aria-label={t("trash.purgeAria", { label: item.label })}
                  onClick={() => void purge(item)}
                >
                  {t("trash.purge")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {confirmDialog}
    </Card>
  );
}

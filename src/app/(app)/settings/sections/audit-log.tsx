"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner, LoadError } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/provider";
import { auditActionLabel, auditActorLabel, auditObjectLabel, formatAuditVia } from "@/lib/audit-display";

type Entry = {
  id: string;
  actorId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  meta: Record<string, unknown>;
  createdAt: number;
};

// Admin-only (Gate B3). A non-admin gets a 403 from the list and sees nothing,
// the same contract SSO and field permissions use — the API stays the source of
// truth. The log is append-only; this panel never offers a write.
export function AuditLogSection() {
  const t = useT();
  const locale = useLocale();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [membersFailed, setMembersFailed] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);

  const loadMembers = useCallback(() => {
    setMembersFailed(false);
    fetch("/api/members")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        const map: Record<string, string> = {};
        for (const m of d.members ?? []) {
          if (m.userId) map[m.userId] = m.name || m.email || m.userId;
        }
        setActors(map);
      })
      .catch(() => setMembersFailed(true));
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/audit");
      if (res.status === 403) {
        setAdminOnly(true);
        return;
      }
      if (!res.ok) throw new Error("audit");
      setEntries((await res.json()).entries ?? []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
    loadMembers();
  }, [load, loadMembers]);

  if (adminOnly) return null;

  function viaOf(meta: Record<string, unknown>): string | null {
    const via = meta.via;
    return typeof via === "string" && via ? via : null;
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("settings.audit")}</h2>
          <p className="text-sm text-ink-muted">{t("settings.auditHint")}</p>
        </div>
        <a
          href="/api/audit?format=csv"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
        >
          <IconDownload width={15} height={15} /> {t("page.contacts.exportTitle")}
        </a>
      </div>
      {failed ? (
        <LoadError
          onRetry={() => {
            setEntries(null);
            void load();
            loadMembers();
          }}
        />
      ) : !entries ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t("settings.auditEmpty")}</p>
      ) : (
        <div className="max-h-80 divide-y divide-line/60 overflow-y-auto">
          {entries.map((e) => {
            const via = viaOf(e.meta);
            return (
              <div key={e.id} data-testid="audit-entry" data-action={e.action} className="py-2">
                <p className="text-sm">{auditActionLabel(e.action, t)}</p>
                <p className="text-xs text-ink-muted">
                  {timeAgo(e.createdAt, locale)} · {auditActorLabel(e.actorId, actors, t)}
                  {via ? ` · ${formatAuditVia(via, t)}` : ""}
                  {e.objectType ? ` · ${auditObjectLabel(e.objectType, t)}` : ""}
                  {e.objectId ? ` ${e.objectId}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {entries && entries.length > 0 && membersFailed && (
        <LoadError compact onRetry={loadMembers} />
      )}
      {entries && entries.length >= 200 && (
        <p className="mt-2 text-xs text-ink-muted">{t("settings.auditLatest")}</p>
      )}
    </Card>
  );
}

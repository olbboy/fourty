"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner, LoadError } from "@/components/ui";
import { IconDownload } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/provider";
import { AUDIT_OBJECTS, AUDIT_VERBS, auditActionLabel, auditActorLabel, auditObjectLabel, formatAuditVia } from "@/lib/audit-display";
import type { MessageKey } from "@/lib/i18n";

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
  // Filters (D18): one person, one kind of record ("deal."), one kind of
  // action ("deleted"), a span of days.
  const [actorId, setActorId] = useState("");
  const [kind, setKind] = useState("");
  const [verb, setVerb] = useState("");
  const action = kind && verb ? `${kind}${verb}` : kind || (verb ? `.${verb}` : "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (actorId) params.set("actorId", actorId);
    if (action) params.set("action", action);
    // Local days, from the start of the first to the end of the last.
    if (from) params.set("from", String(new Date(`${from}T00:00:00`).getTime()));
    if (to) params.set("to", String(new Date(`${to}T23:59:59.999`).getTime()));
    return params.toString();
  }, [actorId, action, from, to]);

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

  // Only the answer to the latest filters is shown, however the replies race.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const mine = ++latest.current;
    setFailed(false);
    try {
      const res = await fetch(`/api/audit${query ? `?${query}` : ""}`);
      if (mine !== latest.current) return;
      if (res.status === 403) {
        setAdminOnly(true);
        return;
      }
      if (!res.ok) throw new Error("audit");
      const body = await res.json();
      if (mine === latest.current) setEntries(body.entries ?? []);
    } catch {
      if (mine === latest.current) setFailed(true);
    }
  }, [query]);

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
          href={`/api/audit?format=csv&limit=1000${query ? `&${query}` : ""}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
        >
          <IconDownload width={15} height={15} /> {t("page.contacts.exportTitle")}
        </a>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <NativeSelect value={actorId} onChange={(e) => setActorId(e.target.value)} aria-label={t("auditFilter.personAria")} size="sm">
          <option value="">{t("auditFilter.everyone")}</option>
          {Object.entries(actors).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("auditFilter.actionAria")} size="sm">
          <option value="">{t("auditFilter.everything")}</option>
          {AUDIT_OBJECTS.map((object) => (
            <option key={object} value={`${object}.`}>
              {auditObjectLabel(object, t)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={verb} onChange={(e) => setVerb(e.target.value)} aria-label={t("auditFilter.verbAria")} size="sm">
          <option value="">{t("auditFilter.anyVerb")}</option>
          {AUDIT_VERBS.map((v) => (
            <option key={v} value={v}>
              {t(`auditFilter.verb.${v}` as MessageKey)}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("auditFilter.fromAria")} className="h-8 w-40" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("auditFilter.toAria")} className="h-8 w-40" />
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
              <div key={e.id} data-testid="audit-entry" data-action={e.action} data-actor={e.actorId ?? ""} className="py-2">
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Modal, Field, Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash, IconMail } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { formatMailboxLastError, isSecretKeyError } from "@/lib/mailbox-display";

type SyncAccount = {
  id: string;
  provider: string;
  email: string;
  label: string | null;
  status: string;
  lastSyncedAt: number | null;
  lastError: string | null;
  createdAt: number;
  /** Only non-secret hints survive redaction — never credentials or tokens. */
  config: { host?: string; urlHost?: string };
  /** True once a refresh token is on file, i.e. OAuth has been completed. */
  connected: boolean;
};

// Mailbox / calendar connections (Gate C6). Unlike SSO this is not an admin
// object, so the panel is shown to everyone who can read the list and the writes
// report their own 403 — the API stays the single source of truth on permission.
const MAILBOX_PROVIDERS = [
  { value: "google", label: "settings.mailboxProviderGoogle", note: "settings.mailboxNoteOauth" },
  { value: "microsoft", label: "settings.mailboxProviderMicrosoft", note: "settings.mailboxNoteOauth" },
  { value: "ics", label: "settings.mailboxProviderIcs", note: "settings.mailboxNoteIcs" },
  { value: "imap", label: "settings.mailboxProviderImap", note: "settings.mailboxNoteImap" },
] as const satisfies ReadonlyArray<{ value: string; label: MessageKey; note: MessageKey }>;

/** When a booked pull comes round, in words. */
function whenDue(dueAt: number, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  const minutes = Math.round((dueAt - Date.now()) / 60_000);
  if (minutes <= 0) return t("settings.mailboxDueNow");
  if (minutes < 60) return t("settings.mailboxDueMin", { n: minutes });
  return t("settings.mailboxDueHour", { n: Math.round(minutes / 60) });
}

/** Providers whose mail Fourty can go and fetch itself. */
const CAN_PULL = new Set(["google", "microsoft", "ics"]);

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Map known mailbox-API English errors to catalog keys; else a generic fallback. */
function mailboxError(t: Translate, error: unknown, fallback: MessageKey): string {
  if (error === "Account not found") return t("settings.mailboxNotFound");
  if (isSecretKeyError(error)) return t("settings.mailboxNoSecretKey");
  return t(fallback);
}

export function MailboxSection() {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const [accounts, setAccounts] = useState<SyncAccount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nextPull, setNextPull] = useState<Record<string, string>>({});
  const [pullFailed, setPullFailed] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [provider, setProvider] = useState<string>("google");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
    const res = await fetch("/api/sync/accounts");
    if (!res.ok) throw new Error("mailbox");
    const rows: SyncAccount[] = (await res.json()).accounts;
    setAccounts(rows);
    // One request per account, and there are never many. Reading each account's
    // own booking is what makes "it pulls by itself now" visible rather than a
    // claim in a changelog. A failed GET is not "nothing booked" — flag the row.
    const entries = await Promise.all(
      rows.map(async (a) => {
        try {
          const r = await fetch(`/api/agent-tasks?entityType=sync_account&entityId=${a.id}`);
          if (!r.ok) throw new Error(String(r.status));
          const task = ((await r.json()).tasks ?? [])[0] as { dueAt: number } | undefined;
          return { id: a.id, when: task ? whenDue(task.dueAt, t) : undefined, failed: false };
        } catch {
          return { id: a.id, when: undefined, failed: true };
        }
      }),
    );
    setNextPull(Object.fromEntries(entries.flatMap((e) => (e.when ? [[e.id, e.when]] : []))));
    setPullFailed(Object.fromEntries(entries.map((e) => [e.id, e.failed])));
    } catch {
      setFailed(true);
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const url = (f.get("url") as string)?.trim();
    const host = (f.get("host") as string)?.trim();
    const res = await fetch("/api/sync/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        email: (f.get("email") as string).trim(),
        label: (f.get("label") as string).trim() || null,
        config: provider === "ics" ? { url } : provider === "imap" && host ? { host } : {},
      }),
    });
    if (res.ok) {
      setShowNew(false);
      load();
    } else {
      setError(mailboxError(t, (await res.json().catch(() => ({}))).error, "settings.mailboxFailedAdd"));
    }
  }

  async function syncNow(a: SyncAccount) {
    setBusy(a.id);
    setResult(null);
    setError(null);
    const res = await fetch(`/api/sync/accounts/${a.id}/run`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const counts = body.emails ?? body.calendar ?? {};
      setResult(
        t("settings.mailboxResult", {
          email: a.email,
          ingested: counts.ingested ?? 0,
          duplicates: counts.duplicates ?? 0,
        }),
      );
    } else {
      setError(mailboxError(t, body.error, "settings.mailboxFailedSync"));
    }
    setBusy(null);
    load();
  }

  async function setStatus(a: SyncAccount, status: string) {
    setError(null);
    const res = await fetch(`/api/sync/accounts/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    // A viewer may reach this button — say so rather than appear to do nothing.
    if (!res.ok) {
      setError(
        mailboxError(
          t,
          (await res.json().catch(() => ({}))).error,
          status === "paused" ? "settings.mailboxFailedPause" : "settings.mailboxFailedResume",
        ),
      );
    }
    load();
  }

  async function remove(a: SyncAccount) {
    const ok = await askConfirm({
      title: t("settings.mailboxDisconnectTitle", { email: a.email }),
      body: t("settings.mailboxDisconnectBody"),
      confirmLabel: t("settings.mailboxDisconnect"),
    });
    if (!ok) return;
    const res = await fetch(`/api/sync/accounts/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(mailboxError(t, (await res.json().catch(() => ({}))).error, "settings.mailboxFailedDisconnect"));
    }
    load();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <IconMail width={15} height={15} /> {t("settings.mailbox")}
          </h2>
          <p className="text-sm text-ink-muted">{t("settings.mailboxHint")}</p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <IconPlus width={15} height={15} /> {t("settings.mailboxAdd")}
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {result && <p className="mb-3 text-sm text-ink-muted">{result}</p>}
      {failed ? (
        <LoadError
          onRetry={() => {
            setAccounts(null);
            void load();
          }}
        />
      ) : !accounts ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t("settings.mailboxEmpty")}</p>
      ) : (
        <div className="divide-y divide-line/60">
          {accounts.map((a) => {
            const needsConnect = (a.provider === "google" || a.provider === "microsoft") && !a.connected;
            return (
              <div
                key={a.id}
                data-testid="mailbox-account"
                data-account-id={a.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className={`text-sm font-medium ${a.status === "paused" ? "text-ink-muted line-through" : ""}`}>
                    {a.label || a.email}
                  </p>
                  <p className="break-all text-xs text-ink-muted">
                    {a.provider}
                    {a.label && ` · ${a.email}`}
                    {/* The feed URL itself is a credential and never leaves the
                        server (ADR-019); its hostname identifies the feed. */}
                    {a.config.urlHost && ` · ${a.config.urlHost}`}
                    {a.config.host && ` · ${a.config.host}`}
                    {a.lastSyncedAt
                      ? ` · ${t("settings.mailboxSynced", { when: timeAgo(a.lastSyncedAt, locale) })}`
                      : ` · ${t("settings.mailboxNeverSynced")}`}
                    {a.status === "paused" && ` · ${t("settings.mailboxPaused")}`}
                  </p>
                  {a.status === "error" && a.lastError && (
                    <p className="mt-0.5 break-all text-xs text-feedback-error">
                      {formatMailboxLastError(a.lastError, t)}
                    </p>
                  )}
                  {/* Pulling is scheduled work, not a cron: the booking is a row,
                      so the panel can say when this mailbox is next due. */}
                  {pullFailed[a.id] ? (
                    <LoadError compact onRetry={() => void load()} />
                  ) : nextPull[a.id] ? (
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {t("settings.mailboxNextPull", { when: nextPull[a.id] })}
                    </p>
                  ) : null}
                </div>
                {needsConnect ? (
                  // A full browser navigation, not fetch: this endpoint answers with a
                  // redirect to the provider AND sets the httpOnly PKCE state cookie.
                  // fetch would follow the redirect inside the page and the cookie
                  // would never reach the browser, so the callback would reject the
                  // sign-in as a forgery.
                  <a
                    href={`/api/sync/accounts/${a.id}/connect`}
                    className={cn(buttonVariants({ size: "xs" }))}
                  >
                    {t("settings.mailboxConnect")}
                  </a>
                ) : (
                  CAN_PULL.has(a.provider) && (
                    <Button
                      onClick={() => syncNow(a)}
                      disabled={busy === a.id} variant="outline" size="sm" className="text-xs">
                      {busy === a.id ? t("settings.mailboxSyncing") : t("settings.mailboxSyncNow")}
                    </Button>
                  )
                )}
                <Button
                  onClick={() => setStatus(a, a.status === "paused" ? "active" : "paused")} variant="outline" size="sm" className="text-xs">
                  {a.status === "paused" ? t("settings.mailboxResume") : t("settings.mailboxPause")}
                </Button>
                {/* Icon-only, so the mailbox has to be named in the label. */}
                <Button
                  onClick={() => remove(a)}
                  aria-label={t("settings.mailboxDisconnectAria", { email: a.email })} variant="outline" size="icon-sm" className="text-feedback-error">
                  <IconTrash width={14} height={14} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title={t("settings.mailboxModal")}
        open={showNew}
        onClose={() => {
          setShowNew(false);
          setError(null);
        }}
      >
        <form onSubmit={create} className="space-y-4">
          <Field label={t("settings.mailboxProvider")}>
            <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full">
              {MAILBOX_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.label)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <p className="text-xs text-ink-muted">
            {t(MAILBOX_PROVIDERS.find((p) => p.value === provider)?.note ?? "settings.mailboxNoteOauth")}
          </p>
          <Field label={t("settings.mailboxEmail")}>
            <Input name="email" required type="email" placeholder={t("login.emailPlaceholder")} />
          </Field>
          <Field label={t("settings.mailboxLabelOptional")}>
            <Input name="label" maxLength={120} placeholder={t("settings.mailboxLabelPlaceholder")} />
          </Field>
          {provider === "ics" && (
            <Field label={t("settings.mailboxFeedUrl")}>
              <Input name="url" required type="url" placeholder={t("settings.mailboxFeedUrlPlaceholder")} />
            </Field>
          )}
          {provider === "imap" && (
            <Field label={t("settings.mailboxImapHost")}>
              <Input name="host" placeholder={t("settings.mailboxImapHostPlaceholder")} />
            </Field>
          )}
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">
              {t("settings.mailboxAdd")}
            </Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}


"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Modal, Field, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconMail } from "@/components/icons";

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
  { value: "google", label: "Google (Gmail)", note: "Connect with OAuth, then pull mail." },
  { value: "microsoft", label: "Microsoft 365", note: "Connect with OAuth, then pull mail." },
  { value: "ics", label: "Calendar feed (ICS)", note: "Fourty fetches the feed URL you provide." },
  {
    value: "imap",
    label: "IMAP (receive only)",
    note: "No automatic pull yet — mail has to be pushed to the ingest endpoint.",
  },
] as const;

/** When a booked pull comes round, in words. */
function whenDue(dueAt: number): string {
  const minutes = Math.round((dueAt - Date.now()) / 60_000);
  if (minutes <= 0) return "is due now";
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.round(minutes / 60)} h`;
}

/** Providers whose mail Fourty can go and fetch itself. */
const CAN_PULL = new Set(["google", "microsoft", "ics"]);

export function MailboxSection() {
  const [accounts, setAccounts] = useState<SyncAccount[] | null>(null);
  const [nextPull, setNextPull] = useState<Record<string, string>>({});
  const [showNew, setShowNew] = useState(false);
  const [provider, setProvider] = useState<string>("google");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sync/accounts");
    if (!res.ok) return;
    const rows: SyncAccount[] = (await res.json()).accounts;
    setAccounts(rows);
    // One request per account, and there are never many. Reading each account's
    // own booking is what makes "it pulls by itself now" visible rather than a
    // claim in a changelog.
    const due: Record<string, string> = {};
    await Promise.all(
      rows.map(async (a) => {
        const r = await fetch(`/api/agent-tasks?entityType=sync_account&entityId=${a.id}`);
        if (!r.ok) return;
        const task = ((await r.json()).tasks ?? [])[0] as { dueAt: number } | undefined;
        if (task) due[a.id] = whenDue(task.dueAt);
      }),
    );
    setNextPull(due);
  }, []);
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
      setError((await res.json().catch(() => ({}))).error ?? "Failed to add mailbox");
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
      setResult(`${a.email}: ${counts.ingested ?? 0} new, ${counts.duplicates ?? 0} already seen`);
    } else {
      setError(body.error ?? "Sync failed");
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
        (await res.json().catch(() => ({}))).error ??
          (status === "paused" ? "Failed to pause mailbox" : "Failed to resume mailbox"),
      );
    }
    load();
  }

  async function remove(a: SyncAccount) {
    if (!confirm(`Disconnect ${a.email}? Mail and events already filed against your contacts stay on their timelines.`))
      return;
    const res = await fetch(`/api/sync/accounts/${a.id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Failed to disconnect");
    load();
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <IconMail width={15} height={15} /> Mailboxes &amp; calendars
          </h2>
          <p className="text-sm text-ink-muted">
            Pull email and calendar events in and file them against the matching contact
            automatically.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <IconPlus width={15} height={15} /> Add mailbox
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {result && <p className="mb-3 text-sm text-ink-muted">{result}</p>}
      {!accounts ? (
        <Spinner />
      ) : accounts.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">No mailboxes connected yet.</p>
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
                    {a.lastSyncedAt ? ` · synced ${timeAgo(a.lastSyncedAt)}` : " · never synced"}
                    {a.status === "paused" && " · paused"}
                  </p>
                  {a.status === "error" && a.lastError && (
                    <p className="mt-0.5 break-all text-xs text-red-500">Last sync failed: {a.lastError}</p>
                  )}
                  {/* Pulling is scheduled work, not a cron: the booking is a row,
                      so the panel can say when this mailbox is next due. */}
                  {nextPull[a.id] && (
                    <p className="mt-0.5 text-xs text-ink-muted">Next automatic pull {nextPull[a.id]}</p>
                  )}
                </div>
                {needsConnect ? (
                  // A full browser navigation, not fetch: this endpoint answers with a
                  // redirect to the provider AND sets the httpOnly PKCE state cookie.
                  // fetch would follow the redirect inside the page and the cookie
                  // would never reach the browser, so the callback would reject the
                  // sign-in as a forgery.
                  <a href={`/api/sync/accounts/${a.id}/connect`} className="btn-primary !py-1 text-xs">
                    Connect
                  </a>
                ) : (
                  CAN_PULL.has(a.provider) && (
                    <button
                      onClick={() => syncNow(a)}
                      disabled={busy === a.id}
                      className="btn-ghost !px-2 text-xs"
                    >
                      {busy === a.id ? "Syncing…" : "Sync now"}
                    </button>
                  )
                )}
                <button
                  onClick={() => setStatus(a, a.status === "paused" ? "active" : "paused")}
                  className="btn-ghost !px-2 text-xs"
                >
                  {a.status === "paused" ? "Resume" : "Pause"}
                </button>
                {/* Icon-only, so the mailbox has to be named in the label. */}
                <button
                  onClick={() => remove(a)}
                  aria-label={`Disconnect ${a.email}`}
                  className="btn-ghost !px-2 !text-red-400"
                >
                  <IconTrash width={14} height={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title="Add a mailbox or calendar"
        open={showNew}
        onClose={() => {
          setShowNew(false);
          setError(null);
        }}
      >
        <form onSubmit={create} className="space-y-4">
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="input">
              {MAILBOX_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-ink-muted">
            {MAILBOX_PROVIDERS.find((p) => p.value === provider)?.note}
          </p>
          <Field label="Email address">
            <input name="email" required type="email" className="input" placeholder="you@company.com" />
          </Field>
          <Field label="Label (optional)">
            <input name="label" maxLength={120} className="input" placeholder="Sales inbox" />
          </Field>
          {provider === "ics" && (
            <Field label="Calendar feed URL">
              <input name="url" required type="url" className="input" placeholder="https://calendar.example.com/feed.ics" />
            </Field>
          )}
          {provider === "imap" && (
            <Field label="IMAP host (optional — recorded for reference)">
              <input name="host" className="input" placeholder="imap.company.com" />
            </Field>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Add mailbox
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


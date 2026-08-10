"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Modal, Field, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconEdit } from "@/components/icons";
import { ROLES } from "@/lib/permissions";

type SsoConnection = {
  id: string;
  label: string;
  issuer: string;
  clientId: string;
  scopes: string;
  /** Postgres integer column — arrives as 0/1, not a boolean. */
  enabled: number;
  defaultWorkspaceId: string | null;
  defaultRole: string;
  createdAt: number;
  hasClientSecret: boolean;
};

// OIDC providers (Gate D4). Instance-level and admin-only, so a non-admin gets a
// 403 from the list and sees nothing at all rather than a panel of dead controls.
export function SsoSection() {
  const [connections, setConnections] = useState<SsoConnection[] | null>(null);
  const [adminOnly, setAdminOnly] = useState(false);
  const [editing, setEditing] = useState<SsoConnection | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/sso/connections");
    if (res.status === 403) {
      setAdminOnly(true);
      return;
    }
    if (res.ok) setConnections((await res.json()).connections);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const secret = (f.get("clientSecret") as string).trim();
    const body: Record<string, unknown> = {
      label: (f.get("label") as string).trim(),
      issuer: (f.get("issuer") as string).trim(),
      clientId: (f.get("clientId") as string).trim(),
      scopes: (f.get("scopes") as string).trim() || "openid email profile",
      defaultRole: f.get("defaultRole"),
      defaultWorkspaceId: (f.get("defaultWorkspaceId") as string).trim() || null,
    };
    // An empty secret box means "keep the current secret". Sending "" would clear
    // it and break every login through this provider with no visible cause, so the
    // key is omitted entirely rather than sent blank.
    if (secret) body.clientSecret = secret;

    const isNew = editing === "new";
    if (isNew && !secret) {
      setError("A client secret is required for a new provider");
      return;
    }
    const res = await fetch(isNew ? "/api/sso/connections" : `/api/sso/connections/${(editing as SsoConnection).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to save provider");
    }
  }

  /** Surface why a write was refused; silence would read as success. */
  async function report(res: Response, fallback: string) {
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? fallback);
  }

  async function toggle(c: SsoConnection) {
    setError(null);
    const res = await fetch(`/api/sso/connections/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    await report(res, c.enabled ? "Failed to disable provider" : "Failed to enable provider");
    load();
  }

  async function remove(c: SsoConnection) {
    if (!confirm(`Delete "${c.label}"? Anyone who signs in through this provider loses access immediately.`))
      return;
    setError(null);
    const res = await fetch(`/api/sso/connections/${c.id}`, { method: "DELETE" });
    await report(res, "Failed to delete provider");
    load();
  }

  if (adminOnly) return null;

  const current = editing === "new" ? null : editing;

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Single sign-on</h2>
          <p className="text-sm text-ink-muted">
            Let your team sign in through an OIDC provider (Okta, Entra ID, Google Workspace, Keycloak).
            New users join the workspace below with the role you pick.
          </p>
        </div>
        <button onClick={() => setEditing("new")} className="btn-primary">
          <IconPlus width={15} height={15} /> Add provider
        </button>
      </div>
      {/* Failures from the row buttons land here; the form has its own copy. */}
      {error && editing === null && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {!connections ? (
        <Spinner />
      ) : connections.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">
          No providers yet — everyone signs in with email and password.
        </p>
      ) : (
        <div className="divide-y divide-line/60">
          {connections.map((c) => (
            <div
              key={c.id}
              data-testid="sso-connection"
              data-connection-id={c.id}
              className="flex flex-wrap items-center gap-3 py-2.5"
            >
              <div className="min-w-[12rem] flex-1">
                <p className={`text-sm font-medium ${c.enabled ? "" : "text-ink-muted line-through"}`}>
                  {c.label}
                </p>
                <p className="break-all text-xs text-ink-muted">
                  {c.issuer} · joins as {c.defaultRole} · added {timeAgo(c.createdAt)}
                  {!c.hasClientSecret && " · no client secret set"}
                </p>
              </div>
              <button onClick={() => toggle(c)} className="btn-ghost !px-2 text-xs">
                {c.enabled ? "Disable" : "Enable"}
              </button>
              {/* Icon-only, so the provider name has to come from the label. */}
              <button
                onClick={() => setEditing(c)}
                aria-label={`Edit ${c.label}`}
                className="btn-ghost !px-2"
              >
                <IconEdit width={14} height={14} />
              </button>
              <button
                onClick={() => remove(c)}
                aria-label={`Delete ${c.label}`}
                className="btn-ghost !px-2 !text-red-400"
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        title={current ? `Edit ${current.label}` : "Add an OIDC provider"}
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Name (shown on the sign-in button)">
            <input name="label" required maxLength={80} defaultValue={current?.label} className="input" placeholder="Okta" />
          </Field>
          <Field label="Issuer URL">
            <input
              name="issuer"
              required
              type="url"
              maxLength={400}
              defaultValue={current?.issuer}
              className="input"
              placeholder="https://example.okta.com"
            />
          </Field>
          <Field label="Client ID">
            <input name="clientId" required maxLength={400} defaultValue={current?.clientId} className="input" />
          </Field>
          <Field label={current ? "Client secret (leave blank to keep the current one)" : "Client secret"}>
            <input
              name="clientSecret"
              type="password"
              maxLength={1000}
              className="input"
              placeholder={current?.hasClientSecret ? "•••••••• (unchanged)" : ""}
            />
          </Field>
          <Field label="Scopes">
            <input
              name="scopes"
              maxLength={400}
              defaultValue={current?.scopes}
              className="input"
              placeholder="openid email profile"
            />
          </Field>
          <Field label="Role for new users">
            <select name="defaultRole" defaultValue={current?.defaultRole ?? "member"} className="input">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Workspace new users join (optional — blank means none)">
            <input
              name="defaultWorkspaceId"
              maxLength={40}
              defaultValue={current?.defaultWorkspaceId ?? ""}
              className="input"
            />
          </Field>
          {current && (
            <p className="text-xs text-ink-muted">
              Changing the issuer or client ID takes effect on the next sign-in — check them against your
              provider before saving.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              {current ? "Save provider" : "Add provider"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


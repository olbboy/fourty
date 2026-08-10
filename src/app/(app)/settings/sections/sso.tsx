"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Modal, Field, Spinner, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash, IconEdit } from "@/components/icons";
import { ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

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
  const [askConfirm, confirmDialog] = useConfirm();
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
    const ok = await askConfirm({
      title: `Delete “${c.label}”?`,
      body: "Anyone who signs in through this provider loses access immediately.",
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/sso/connections/${c.id}`, { method: "DELETE" });
    await report(res, "Failed to delete provider");
    load();
  }

  if (adminOnly) return null;

  const current = editing === "new" ? null : editing;

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Single sign-on</h2>
          <p className="text-sm text-ink-muted">
            Let your team sign in through an OIDC provider (Okta, Entra ID, Google Workspace, Keycloak).
            New users join the workspace below with the role you pick.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <IconPlus width={15} height={15} /> Add provider
        </Button>
      </div>
      {/* Failures from the row buttons land here; the form has its own copy. */}
      {error && editing === null && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
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
              <Button onClick={() => toggle(c)} variant="outline" size="sm" className="text-xs">
                {c.enabled ? "Disable" : "Enable"}
              </Button>
              {/* Icon-only, so the provider name has to come from the label. */}
              <Button
                onClick={() => setEditing(c)}
                aria-label={`Edit ${c.label}`} variant="outline" size="icon-sm">
                <IconEdit width={14} height={14} />
              </Button>
              <Button
                onClick={() => remove(c)}
                aria-label={`Delete ${c.label}`} variant="outline" size="icon-sm" className="text-feedback-error">
                <IconTrash width={14} height={14} />
              </Button>
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
            <Input name="label" required maxLength={80} defaultValue={current?.label} placeholder="Okta" />
          </Field>
          <Field label="Issuer URL">
            <Input
              name="issuer"
              required
              type="url"
              maxLength={400}
              defaultValue={current?.issuer}
              placeholder="https://example.okta.com" />
          </Field>
          <Field label="Client ID">
            <Input name="clientId" required maxLength={400} defaultValue={current?.clientId} />
          </Field>
          <Field label={current ? "Client secret (leave blank to keep the current one)" : "Client secret"}>
            <Input
              name="clientSecret"
              type="password"
              maxLength={1000}
              placeholder={current?.hasClientSecret ? "•••••••• (unchanged)" : ""} />
          </Field>
          <Field label="Scopes">
            <Input
              name="scopes"
              maxLength={400}
              defaultValue={current?.scopes}
              placeholder="openid email profile" />
          </Field>
          <Field label="Role for new users">
            <NativeSelect name="defaultRole" defaultValue={current?.defaultRole ?? "member"} className="w-full">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Workspace new users join (optional — blank means none)">
            <Input
              name="defaultWorkspaceId"
              maxLength={40}
              defaultValue={current?.defaultWorkspaceId ?? ""} />
          </Field>
          {current && (
            <p className="text-xs text-ink-muted">
              Changing the issuer or client ID takes effect on the next sign-in — check them against your
              provider before saving.
            </p>
          )}
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">
              {current ? "Save provider" : "Add provider"}
            </Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}


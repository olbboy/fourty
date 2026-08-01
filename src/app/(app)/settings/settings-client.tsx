"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { useRouter } from "next/navigation";
import { PageHeader, Modal, Field, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconKey, IconUpload, IconEdit } from "@/components/icons";
import { useLocale, useT } from "@/lib/i18n/provider";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@/lib/i18n";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
};

type Member = {
  userId: string;
  role: string;
  deactivatedAt: number | null;
  createdAt: number;
  email: string;
  name: string;
};

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

const ROLES = ["admin", "member", "viewer"] as const;

export function SettingsClient() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Team, single sign-on, custom fields, API access, and data tools."
      />
      <MembersSection />
      <SsoSection />
      <LanguageSection />
      <CustomFieldsSection />
      <ApiKeysSection />
      <div className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">Data import</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Bring your book of business from any CRM — CSV import auto-maps common column names and
          links or creates companies on the fly.
        </p>
        <Link href="/settings/import" className="btn-primary inline-flex">
          <IconUpload width={15} height={15} /> Import contacts from CSV
        </Link>
      </div>
      <div className="card p-4">
        <h2 className="mb-1 text-sm font-semibold">REST API</h2>
        <p className="text-sm text-ink-muted">
          Every resource in Fourty is available over a clean REST API — authenticate with{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
            Authorization: Bearer &lt;api key&gt;
          </code>
          . Endpoints:{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
            /api/contacts · /api/companies · /api/deals · /api/tasks · /api/notes · /api/activities
            · /api/workflows · /api/search · /api/stats/dashboard
          </code>{" "}
          with GET/POST/PATCH/DELETE. A typed <strong>GraphQL</strong> API for every object is at{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/api/graphql</code>, and no-code{" "}
          <strong>custom objects</strong> are served at{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/api/objects/&lt;name&gt;</code>.
          Full examples in the README.
        </p>
      </div>
    </div>
  );
}

// OIDC providers (Gate D4). Instance-level and admin-only, so a non-admin gets a
// 403 from the list and sees nothing at all rather than a panel of dead controls.
function SsoSection() {
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

  async function toggle(c: SsoConnection) {
    await fetch(`/api/sso/connections/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !c.enabled }),
    });
    load();
  }

  async function remove(c: SsoConnection) {
    if (!confirm(`Delete "${c.label}"? Anyone who signs in through this provider loses access immediately.`))
      return;
    await fetch(`/api/sso/connections/${c.id}`, { method: "DELETE" });
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
      {!connections ? (
        <Spinner />
      ) : connections.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">
          No providers yet — everyone signs in with email and password.
        </p>
      ) : (
        <div className="divide-y divide-line/60">
          {connections.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
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
              <button onClick={() => setEditing(c)} className="btn-ghost !px-2">
                <IconEdit width={14} height={14} />
              </button>
              <button onClick={() => remove(c)} className="btn-ghost !px-2 !text-red-400">
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
          {error && <p className="text-sm text-red-500">{error}</p>}
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

// Interface language (Gate C4). Persists to a cookie via /api/locale, then
// refreshes so the server layout re-resolves the locale.
function LanguageSection() {
  const locale = useLocale();
  const t = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    setSaving(true);
    await fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">{t("settings.language")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.languageHint")}</p>
      <label htmlFor="locale-select" className="sr-only">
        {t("settings.language")}
      </label>
      <select
        id="locale-select"
        value={locale}
        disabled={saving}
        onChange={(e) => change(e.target.value)}
        className="input w-auto"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  );
}

const FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url"];

function CustomFieldsSection() {
  const [entity, setEntity] = useState<"contact" | "company" | "deal">("contact");
  const [fields, setFields] = useState<CustomFieldDef[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [type, setType] = useState("text");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/custom-fields?entity=${entity}`);
    if (res.ok) setFields((await res.json()).fields);
  }, [entity]);
  useEffect(() => {
    setFields(null);
    load();
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const label = (f.get("label") as string).trim();
    const res = await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity,
        label,
        key:
          (f.get("key") as string)?.trim() ||
          label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        type: f.get("type"),
        options:
          f.get("type") === "select"
            ? ((f.get("options") as string) ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      }),
    });
    if (res.ok) {
      setShowNew(false);
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
    }
  }

  async function remove(field: CustomFieldDef) {
    if (!confirm(`Delete field "${field.label}"? Existing values stay in records but stop displaying.`)) return;
    await fetch(`/api/custom-fields/${field.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Custom fields</h2>
          <p className="text-sm text-ink-muted">
            Extend any object with your own fields — they appear in forms, detail pages, and the API
            instantly.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <IconPlus width={15} height={15} /> New field
        </button>
      </div>
      <div className="mb-3 flex gap-1.5">
        {(["contact", "company", "deal"] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEntity(e)}
            className={`chip cursor-pointer !px-3 !py-1.5 capitalize transition ${
              entity === e
                ? "bg-accent-600 text-white"
                : "border border-line text-ink-muted hover:border-accent-400"
            }`}
          >
            {e}s
          </button>
        ))}
      </div>
      {!fields ? (
        <Spinner />
      ) : fields.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">No custom fields for {entity}s yet.</p>
      ) : (
        <div className="divide-y divide-line/60">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-ink-muted">
                  {f.key} · {f.type}
                  {f.type === "select" && f.options.length > 0 && ` (${f.options.join(", ")})`}
                </p>
              </div>
              <button onClick={() => remove(f)} className="btn-ghost !px-2 !text-red-400">
                <IconTrash width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal title={`New ${entity} field`} open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Label">
            <input name="label" required className="input" placeholder="e.g. Contract tier" />
          </Field>
          <Field label="Key (optional — auto-generated from label)">
            <input name="key" className="input" placeholder="contract_tier" pattern="[a-z][a-z0-9_]*" />
          </Field>
          <Field label="Type">
            <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="input">
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          {type === "select" && (
            <Field label="Options (comma separated)">
              <input name="options" className="input" placeholder="Bronze, Silver, Gold" />
            </Field>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary">
              Create field
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    if (res.ok) setKeys((await res.json()).keys);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewSecret(data.secret);
      setName("");
      load();
    }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke key "${k.name}"? Integrations using it will stop working.`)) return;
    await fetch(`/api/api-keys?id=${k.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="card p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <IconKey width={15} height={15} /> API keys
        </h2>
        <p className="text-sm text-ink-muted">
          Programmatic access for scripts and integrations. Keys are hashed at rest — the secret is
          shown once.
        </p>
      </div>
      <div className="mb-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          className="input max-w-xs"
          placeholder="Key name, e.g. Zapier"
        />
        <button onClick={create} disabled={!name.trim()} className="btn-primary">
          Generate
        </button>
      </div>
      {newSecret && (
        <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
            Copy this key now — it won&apos;t be shown again:
          </p>
          <code className="block select-all break-all rounded bg-surface px-2 py-1.5 text-xs">
            {newSecret}
          </code>
        </div>
      )}
      {!keys ? (
        <Spinner />
      ) : keys.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">No API keys yet.</p>
      ) : (
        <div className="divide-y divide-line/60">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className={`text-sm font-medium ${k.revokedAt ? "text-ink-muted line-through" : ""}`}>
                  {k.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {k.prefix}… · created {timeAgo(k.createdAt)}
                  {k.lastUsedAt && ` · last used ${timeAgo(k.lastUsedAt)}`}
                  {k.revokedAt && " · revoked"}
                </p>
              </div>
              {!k.revokedAt && (
                <button onClick={() => revoke(k)} className="btn-ghost !px-2 !text-red-400">
                  <IconTrash width={14} height={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MembersSection() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [adminOnly, setAdminOnly] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/members");
    if (res.status === 403) {
      setAdminOnly(true);
      return;
    }
    if (res.ok) setMembers((await res.json()).members);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite() {
    if (!email.trim()) return;
    setError(null);
    const res = await fetch("/api/members/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    if (res.ok) {
      setInvite((await res.json()).token);
      setEmail("");
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed to invite");
    }
  }

  async function changeRole(m: Member, next: string) {
    const res = await fetch(`/api/members/${m.userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Failed to change role");
    load();
  }

  async function remove(m: Member) {
    if (!confirm(`Remove ${m.name} from this workspace? They lose access immediately.`)) return;
    const res = await fetch(`/api/members/${m.userId}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Failed to remove");
    load();
  }

  // Members management is admin-only; hide the panel for members/viewers.
  if (adminOnly) return null;

  return (
    <div className="card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">Team members</h2>
        <p className="text-sm text-ink-muted">
          Invite teammates and control their access. Roles: <strong>admin</strong> (full control),{" "}
          <strong>member</strong> (read + write records), <strong>viewer</strong> (read only).
        </p>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendInvite()}
          className="input max-w-xs"
          placeholder="teammate@company.com"
          type="email"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="input max-w-[8rem]">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button onClick={sendInvite} disabled={!email.trim()} className="btn-primary">
          <IconPlus width={15} height={15} /> Invite
        </button>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {invite && (
        <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
            Share this invite token — the invitee redeems it to join (shown once):
          </p>
          <code className="block select-all break-all rounded bg-surface px-2 py-1.5 text-xs">
            {invite}
          </code>
        </div>
      )}
      {!members ? (
        <Spinner />
      ) : (
        <div className="divide-y divide-line/60">
          {members.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className={`text-sm font-medium ${m.deactivatedAt ? "text-ink-muted line-through" : ""}`}>
                  {m.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {m.email} · joined {timeAgo(m.createdAt)}
                  {m.deactivatedAt && " · removed"}
                </p>
              </div>
              {!m.deactivatedAt && (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value)}
                    className="input !w-auto !py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => remove(m)} className="btn-ghost !px-2 !text-red-400">
                    <IconTrash width={14} height={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

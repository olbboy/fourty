"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { PageHeader, Modal, Field, Spinner } from "@/components/ui";
import { IconPlus, IconTrash, IconKey, IconUpload } from "@/components/icons";

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

const ROLES = ["admin", "member", "viewer"] as const;

export function SettingsClient() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Settings" subtitle="Team, custom fields, API access, and data tools." />
      <MembersSection />
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
          with GET/POST/PATCH/DELETE. Full examples in the README.
        </p>
      </div>
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { ROLES } from "@/lib/permissions";

type Member = {
  userId: string;
  role: string;
  deactivatedAt: number | null;
  createdAt: number;
  email: string;
  name: string;
};

export function MembersSection() {
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
        {/* An unlabelled invite row: the placeholder is a fallback name at best
            and the role picker has nothing at all. */}
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendInvite()}
          aria-label="Email address to invite"
          className="input max-w-xs"
          placeholder="teammate@company.com"
          type="email"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Role for the invitee"
          className="input max-w-[8rem]"
        >
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
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
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
                  {/* One control per row, so each needs the member's name in its
                      own label — the visible text sits in a sibling element. */}
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value)}
                    aria-label={`Role for ${m.name}`}
                    className="input !w-auto !py-1 text-xs"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(m)}
                    aria-label={`Remove ${m.name}`}
                    className="btn-ghost !px-2 !text-red-400"
                  >
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

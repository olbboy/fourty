"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type Member = {
  userId: string;
  role: string;
  deactivatedAt: number | null;
  createdAt: number;
  email: string;
  name: string;
};

export function MembersSection() {
  const [askConfirm, confirmDialog] = useConfirm();
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
    const ok = await askConfirm({
      title: `Remove ${m.name} from this workspace?`,
      body: "They lose access immediately.",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    const res = await fetch(`/api/members/${m.userId}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? "Failed to remove");
    load();
  }

  // Members management is admin-only; hide the panel for members/viewers.
  if (adminOnly) return null;

  return (
    <Card size="flush" className="p-4">
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
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendInvite()}
          aria-label="Email address to invite"
          placeholder="teammate@company.com"
          type="email" className="max-w-xs" />
        <NativeSelect
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label="Role for the invitee" className="max-w-[8rem]">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NativeSelect>
        <Button onClick={sendInvite} disabled={!email.trim()}>
          <IconPlus width={15} height={15} /> Invite
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {invite && (
        <div className="mb-3 rounded-lg border border-feedback-warn/20 bg-feedback-warn-wash p-3">
          <p className="mb-1 text-xs font-semibold text-feedback-warn">
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
                  <NativeSelect
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value)}
                    aria-label={`Role for ${m.name}`} size="sm">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    onClick={() => remove(m)}
                    aria-label={`Remove ${m.name}`} variant="outline" size="icon-sm" className="text-feedback-error">
                    <IconTrash width={14} height={14} />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </Card>
  );
}

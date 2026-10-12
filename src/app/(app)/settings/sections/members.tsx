"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { ROLES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { roleLabel } from "@/lib/role-display";

/** Map known members-API English errors to catalog keys; else a generic fallback. */
function memberError(t: (key: MessageKey) => string, error: unknown, fallback: MessageKey): string {
  if (error === "Cannot demote the last admin") return t("settings.inviteLastAdminDemote");
  if (error === "Cannot remove the last admin") return t("settings.inviteLastAdminRemove");
  return t(fallback);
}

type Member = {
  userId: string;
  role: string;
  deactivatedAt: number | null;
  createdAt: number;
  email: string;
  name: string;
};

export function MembersSection() {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("member");
  // `emailed` is false when SMTP is unconfigured or the send couldn't be queued —
  // the link is then the only way the invitee gets in, so the panel shows it.
  const [invite, setInvite] = useState<{ url: string; to: string; emailed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/members");
      if (res.status === 403) {
        setAdminOnly(true);
        return;
      }
      if (!res.ok) throw new Error("members");
      setMembers((await res.json()).members);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite() {
    const to = email.trim();
    if (!to) return;
    setError(null);
    const res = await fetch("/api/members/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: to, role }),
    });
    if (res.ok) {
      const data = await res.json();
      setInvite({
        url: `${window.location.origin}/accept?token=${encodeURIComponent(data.token)}`,
        to,
        emailed: Boolean(data.emailed),
      });
      setEmail("");
      load();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(memberError(t, body.error, "settings.inviteFailed"));
    }
  }

  async function changeRole(m: Member, next: string) {
    setError(null);
    const res = await fetch(`/api/members/${m.userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(memberError(t, body.error, "settings.inviteFailedRole"));
    }
    load();
  }

  async function remove(m: Member) {
    const ok = await askConfirm({
      title: t("settings.inviteRemoveTitle", { name: m.name }),
      body: t("settings.inviteRemoveBody"),
      confirmLabel: t("settings.inviteRemove"),
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/members/${m.userId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(memberError(t, body.error, "settings.inviteFailedRemove"));
    }
    load();
  }

  // Members management is admin-only; hide the panel for members/viewers.
  if (adminOnly) return null;

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t("settings.members")}</h2>
        <p className="text-sm text-ink-muted">{t("settings.membersHint")}</p>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {/* An unlabelled invite row: the placeholder is a fallback name at best
            and the role picker has nothing at all. */}
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendInvite()}
          aria-label={t("settings.inviteEmailAria")}
          placeholder={t("settings.inviteEmailPlaceholder")}
          type="email" className="max-w-xs" />
        <NativeSelect
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label={t("settings.inviteRoleAria")} className="max-w-[8rem]">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, t)}
            </option>
          ))}
        </NativeSelect>
        <Button onClick={sendInvite} disabled={!email.trim()}>
          <IconPlus width={15} height={15} /> {t("settings.invite")}
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {invite && (
        <div
          className={`mb-3 rounded-lg border p-3 ${
            invite.emailed
              ? "border-feedback-ok/20 bg-feedback-ok-wash"
              : "border-feedback-warn/20 bg-feedback-warn-wash"
          }`}
        >
          <p
            className={`mb-1 text-xs font-semibold ${
              invite.emailed ? "text-feedback-ok" : "text-feedback-warn"
            }`}
          >
            {invite.emailed
              ? t("settings.inviteEmailed", { email: invite.to })
              : t("settings.inviteNoSmtp", { email: invite.to })}
          </p>
          <code className="block select-all break-all rounded bg-surface px-2 py-1.5 text-xs">
            {invite.url}
          </code>
        </div>
      )}
      {failed ? (
        <LoadError
          onRetry={() => {
            setMembers(null);
            void load();
          }}
        />
      ) : !members ? (
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
                  {m.email} · {t("settings.inviteJoined", { when: timeAgo(m.createdAt, locale) })}
                  {m.deactivatedAt && t("settings.inviteRemoved")}
                </p>
              </div>
              {!m.deactivatedAt && (
                <>
                  {/* One control per row, so each needs the member's name in its
                      own label — the visible text sits in a sibling element. */}
                  <NativeSelect
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value)}
                    aria-label={t("settings.inviteRoleFor", { name: m.name })} size="sm">
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r, t)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    onClick={() => remove(m)}
                    aria-label={t("settings.inviteRemoveAria", { name: m.name })} variant="outline" size="icon-sm" className="text-feedback-error">
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

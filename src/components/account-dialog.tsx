"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { translator, type Locale } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { deviceLabel } from "@/lib/device-label";

type SessionView = { id: string; userAgent: string | null; ip: string | null; lastSeenAt: number; current: boolean };

/**
 * "My account": change your own name and password (Phase 8). The name shows
 * across lists, owner pickers and timelines; changing the password signs out
 * your other devices and keeps this one signed in.
 */
export function AccountDialog({
  open,
  onClose,
  name,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  locale: Locale;
}) {
  const t = translator(locale);
  const router = useRouter();
  const [nextName, setNextName] = useState(name);
  const [current, setCurrent] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionView[] | null>(null);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/me/sessions").catch(() => null);
    if (res?.ok) setSessions(((await res.json()) as { sessions: SessionView[] }).sessions);
  }, []);
  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function endSession(url: string) {
    const res = await fetch(url, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setStatus({ kind: "error", text: t("account.failed") });
    void loadSessions();
  }

  async function send(url: string, method: "PATCH" | "POST", body: unknown, ok: string): Promise<boolean> {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: "error",
          text: data.error === "Current password is wrong" ? t("account.wrongPassword") : t("account.failed"),
        });
        return false;
      }
      setStatus({ kind: "ok", text: ok });
      return true;
    } catch {
      setStatus({ kind: "error", text: t("account.failed") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t("account.title")} open={open} onClose={onClose}>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send("/api/me", "PATCH", { name: nextName.trim() }, t("account.nameSaved"))) router.refresh();
        }}
      >
        <label htmlFor="account-name" className="block text-sm font-medium">
          {t("account.name")}
        </label>
        <div className="flex gap-2">
          <Input id="account-name" value={nextName} onChange={(e) => setNextName(e.target.value)} required maxLength={120} />
          <Button type="submit" disabled={busy || !nextName.trim() || nextName.trim() === name}>
            {t("action.save")}
          </Button>
        </div>
      </form>

      <form
        className="mt-6 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await send(
            "/api/me/password",
            "POST",
            { currentPassword: current, newPassword: nextPassword },
            t("account.passwordSaved"),
          );
          if (ok) {
            setCurrent("");
            setNextPassword("");
          }
        }}
      >
        <p className="text-sm font-medium">{t("account.password")}</p>
        <label htmlFor="account-current" className="block text-xs text-ink-muted">
          {t("account.currentPassword")}
        </label>
        <Input
          id="account-current"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <label htmlFor="account-new" className="block text-xs text-ink-muted">
          {t("account.newPassword")}
        </label>
        <Input
          id="account-new"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={nextPassword}
          onChange={(e) => setNextPassword(e.target.value)}
          required
        />
        <p className="text-xs text-ink-muted">{t("account.passwordHint")}</p>
        <Button type="submit" disabled={busy || !current || nextPassword.length < 8}>
          {t("account.changePassword")}
        </Button>
      </form>

      {sessions && (
        <section className="mt-6 space-y-2" aria-labelledby="account-sessions">
          <p id="account-sessions" className="text-sm font-medium">
            {t("account.sessions")}
          </p>
          <ul className="divide-y divide-line/60 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {deviceLabel(s.userAgent) || t("account.unknownDevice")}
                    {s.current && <span className="ml-2 text-xs text-feedback-ok">{t("account.thisDevice")}</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {[s.ip, t("account.lastActive", { when: timeAgo(s.lastSeenAt, locale) })].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t("account.signOutDeviceAria", { device: deviceLabel(s.userAgent) || t("account.unknownDevice") })}
                    onClick={() => void endSession(`/api/me/sessions/${encodeURIComponent(s.id)}`)}
                  >
                    {t("account.signOutDevice")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {sessions.length > 1 && (
            <Button size="sm" variant="outline" onClick={() => void endSession("/api/me/sessions")}>
              {t("account.signOutOthers")}
            </Button>
          )}
        </section>
      )}

      {status && (
        <p role={status.kind === "error" ? "alert" : "status"} className={`mt-4 text-sm ${status.kind === "error" ? "text-feedback-error" : "text-feedback-ok"}`}>
          {status.text}
        </p>
      )}
    </Modal>
  );
}

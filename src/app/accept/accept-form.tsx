"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

/** Map known invite-accept API English errors; else a generic fallback. */
function acceptError(t: (key: MessageKey) => string, error: unknown): string {
  if (error === "Invalid invite token") return t("accept.invalidToken");
  if (error === "Invite is invalid or expired") return t("accept.expired");
  if (error === "name and password are required to accept as a new user") {
    return t("accept.needCredentials");
  }
  return t("accept.error");
}

/**
 * Two shapes behind one submit: a signed-in visitor just confirms, and everyone
 * else supplies the name + password that /api/members/accept turns into an
 * account. The invite's email is authoritative either way — it comes from the
 * token, never from this form.
 */
export function AcceptForm({
  token,
  signedInAs,
  alreadyMember: memberOnLoad = false,
}: {
  token: string;
  signedInAs: string | null;
  alreadyMember?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The API answers 401 when the invited address already has an account. That
  // is not a dead end, so it gets its own prompt rather than a red error.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  // 409: this link was already used to join. Same way out as 401, different words.
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  // 409 for someone already in the workspace: nothing to join, and the link
  // stays open for the person it was made for.
  const [alreadyMember, setAlreadyMember] = useState(memberOnLoad);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { token };
    if (!signedInAs) {
      body.name = form.get("name");
      body.password = form.get("password");
    }
    const res = await fetch("/api/members/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      // Accepting as a new user also creates the session, so both paths land on
      // a usable workspace.
      router.push("/dashboard");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.error === "Already a member of this workspace") {
      setAlreadyMember(true);
      setBusy(false);
      return;
    }
    if (res.status === 401 || res.status === 409) {
      if (res.status === 409) setAlreadyJoined(true);
      setNeedsSignIn(true);
      setBusy(false);
      return;
    }
    setError(acceptError(t, data.error));
    setBusy(false);
  }

  if (alreadyMember) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm">{t("accept.alreadyMember")}</p>
        <a href="/dashboard" className="block">
          <Button className="w-full">{t("accept.openWorkspace")}</Button>
        </a>
      </Card>
    );
  }

  if (needsSignIn) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm">{t(alreadyJoined ? "accept.alreadyAccepted" : "accept.alreadyHasAccount")}</p>
        {/* Carry the accept link through login, so signing in lands the invitee
            back here instead of on the dashboard with a spent visit. A link that
            was already used has nothing left to do here: plain sign-in. */}
        <a
          href={alreadyJoined ? "/login" : `/login?next=${encodeURIComponent(`/accept?token=${encodeURIComponent(token)}`)}`}
          className="block"
        >
          <Button className="w-full">{t("accept.goToSignIn")}</Button>
        </a>
      </Card>
    );
  }

  return (
    <Card size="flush" render={<form onSubmit={onSubmit} />} className="space-y-4 p-6">
      {signedInAs ? (
        <p className="text-sm text-ink-muted">{t("accept.signedInAs", { email: signedInAs })}</p>
      ) : (
        <>
          {/* Labels sit beside their inputs and are bound with htmlFor — without
              it the text is decoration and the field announces as unlabelled. */}
          <div>
            <label htmlFor="accept-name" className="mb-1.5 block text-sm font-medium">
              {t("login.yourName")}
            </label>
            <Input id="accept-name" name="name" required placeholder={t("login.namePlaceholder")} />
          </div>
          <div>
            <label htmlFor="accept-password" className="mb-1.5 block text-sm font-medium">
              {t("accept.choosePassword")}
            </label>
            <Input
              id="accept-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••" />
            <p className="mt-1.5 text-xs text-ink-muted">{t("auth.minChars")}</p>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("settings.twofaWait") : signedInAs ? t("accept.join") : t("accept.createAndJoin")}
      </Button>
    </Card>
  );
}

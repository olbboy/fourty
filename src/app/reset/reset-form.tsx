"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

/** Map known reset-password API English errors; else a generic retry. */
function resetError(t: (key: MessageKey) => string, error: unknown): string {
  if (error === "This reset link is invalid or has expired") return t("auth.resetLinkInvalid");
  if (error === "Too many attempts. Try again later.") return t("auth.tooManyAttempts");
  return t("auth.resetFailed");
}

/**
 * The redeem half of the forgot-password flow. On success the user lands on
 * /login rather than a signed-in session: the reset deliberately killed every
 * session, and signing in with the password they just chose confirms it works.
 */
export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError(t("auth.mismatch"));
      setBusy(false);
      return;
    }
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) {
      router.push("/login");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(resetError(t, data.error));
    setBusy(false);
  }

  return (
    <Card size="flush" render={<form onSubmit={onSubmit} />} className="space-y-4 p-6">
      <div>
        <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium">
          {t("auth.newPassword")}
        </label>
        <Input
          id="reset-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••" />
        <p className="mt-1.5 text-xs text-ink-muted">{t("auth.minChars")}</p>
      </div>
      <div>
        <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium">
          {t("auth.repeat")}
        </label>
        <Input
          id="reset-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("settings.twofaWait") : t("auth.setPassword")}
      </Button>
    </Card>
  );
}

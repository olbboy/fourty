"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

/** Map known forgot-password API English errors; else a generic retry. */
function forgotError(t: (key: MessageKey) => string, error: unknown): string {
  if (error === "Too many reset requests. Try again later.") return t("auth.tooManyResetRequests");
  return t("auth.errorRetry");
}

/**
 * One field, one outcome: after submit the card always says "check your email"
 * — the API answers identically for known and unknown addresses, and the form
 * mirrors that so the page can't be used to probe which emails have accounts.
 */
export function ForgotForm() {
  const t = useT();
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setSent(email);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(forgotError(t, data.error));
    setBusy(false);
  }

  if (sent) {
    return (
      <Card className="space-y-3 p-6">
        <p className="text-sm">{t("auth.sent", { email: sent })}</p>
        <p className="text-sm text-ink-muted">{t("auth.sentHint")}</p>
      </Card>
    );
  }

  return (
    <Card size="flush" render={<form onSubmit={onSubmit} />} className="space-y-4 p-6">
      <div>
        <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium">
          {t("field.email")}
        </label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("login.emailPlaceholder")} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("settings.twofaWait") : t("auth.emailReset")}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        <a href="/login" className="underline underline-offset-2">
          {t("auth.backToSignIn")}
        </a>
      </p>
    </Card>
  );
}

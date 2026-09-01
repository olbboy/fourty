"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

/** Map known login/setup API English errors to catalog keys; else a generic fallback. */
function loginError(t: (key: MessageKey) => string, error: unknown): string {
  if (error === "Invalid email or password") return t("login.invalidCredentials");
  if (error === "Invalid two-factor code") return t("login.twoFactorInvalid");
  if (error === "Too many login attempts. Try again later.") return t("login.tooManyAttempts");
  if (error === "Workspace already set up") return t("login.alreadySetup");
  return t("login.error");
}

// `next` arrives pre-validated by the page (safeInternalPath) — this form
// never reads the query string itself, so the guard has exactly one call site.
export function LoginForm({ mode, next }: { mode: "setup" | "login"; next?: string | null }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withDemo, setWithDemo] = useState(true);
  // Revealed when the server answers `requires2fa` — the same form resubmits
  // with the code, so email and password stay as typed.
  const [needsCode, setNeedsCode] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      email: form.get("email"),
      password: form.get("password"),
    };
    if (mode === "setup") {
      body.name = form.get("name");
      body.seedDemo = withDemo;
    }
    const token = (form.get("token") as string | null)?.trim();
    if (token) body.token = token;
    const res = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push(next ?? "/dashboard");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      if (data.requires2fa && !token) {
        // First round-trip for a 2FA account: ask for the code, not an error.
        setNeedsCode(true);
      } else {
        setError(loginError(t, data.error));
      }
      setBusy(false);
    }
  }

  return (
    <Card size="flush" render={<form onSubmit={onSubmit} />} className="space-y-4 p-6">
      {/* Each label sits beside its input rather than wrapping it, so the pairing
          only exists if htmlFor says so — without it the text is decoration and
          the field announces as unlabelled. */}
      {mode === "setup" && (
        <div>
          <label htmlFor="login-name" className="mb-1.5 block text-sm font-medium">
            {t("login.yourName")}
          </label>
          <Input id="login-name" name="name" required placeholder={t("login.namePlaceholder")} />
        </div>
      )}
      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium">
          {t("field.email")}
        </label>
        <Input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t("login.emailPlaceholder")} />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium">
          {t("login.password")}
        </label>
        <Input
          id="login-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          placeholder="••••••••" />
      </div>
      {needsCode && (
        <div>
          <label htmlFor="login-token" className="mb-1.5 block text-sm font-medium">
            {t("login.twoFactorCode")}
          </label>
          <Input
            id="login-token"
            name="token"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            minLength={6}
            maxLength={20}
            placeholder="123456"
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            {t("login.twoFactorHint")}
          </p>
        </div>
      )}
      {mode === "setup" && (
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={withDemo}
            onChange={(e) => setWithDemo(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          {t("login.sampleData")}
        </label>
      )}
      {error && <p className="text-sm text-feedback-error">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t("settings.twofaWait") : mode === "setup" ? t("login.createWorkspace") : t("login.signIn")}
      </Button>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * One field, one outcome: after submit the card always says "check your email"
 * — the API answers identically for known and unknown addresses, and the form
 * mirrors that so the page can't be used to probe which emails have accounts.
 */
export function ForgotForm() {
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
    setError(data.error ?? "Something went wrong. Try again.");
    setBusy(false);
  }

  if (sent) {
    return (
      <Card className="space-y-3 p-6">
        <p className="text-sm">
          If <strong>{sent}</strong> has a Fourty account, a reset link is on its way. It works
          once and expires in an hour.
        </p>
        <p className="text-sm text-ink-muted">
          Nothing arriving? Check spam, or ask your administrator to reset your password from the
          server.
        </p>
      </Card>
    );
  }

  return (
    <Card size="flush" render={<form onSubmit={onSubmit} />} className="space-y-4 p-6">
      <div>
        <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Please wait…" : "Email me a reset link"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        <a href="/login" className="underline underline-offset-2">
          Back to sign in
        </a>
      </p>
    </Card>
  );
}

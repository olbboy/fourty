"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * Two shapes behind one submit: a signed-in visitor just confirms, and everyone
 * else supplies the name + password that /api/members/accept turns into an
 * account. The invite's email is authoritative either way — it comes from the
 * token, never from this form.
 */
export function AcceptForm({ token, signedInAs }: { token: string; signedInAs: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The API answers 401 when the invited address already has an account. That
  // is not a dead end, so it gets its own prompt rather than a red error.
  const [needsSignIn, setNeedsSignIn] = useState(false);
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
    if (res.status === 401) {
      setNeedsSignIn(true);
      setBusy(false);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Could not accept this invite");
    setBusy(false);
  }

  if (needsSignIn) {
    return (
      <Card className="space-y-4 p-6">
        <p className="text-sm">
          That email already has a Fourty account. Sign in and you&apos;ll come straight back to
          this invite.
        </p>
        {/* Carry the accept link through login, so signing in lands the invitee
            back here instead of on the dashboard with a spent visit. */}
        <a href={`/login?next=${encodeURIComponent(`/accept?token=${encodeURIComponent(token)}`)}`} className="block">
          <Button className="w-full">Go to sign in</Button>
        </a>
      </Card>
    );
  }

  return (
    <Card size="flush" render={<form onSubmit={onSubmit} />} className="space-y-4 p-6">
      {signedInAs ? (
        <p className="text-sm text-ink-muted">
          You&apos;re signed in as <strong className="text-ink">{signedInAs}</strong>. Accepting
          adds this workspace to your account.
        </p>
      ) : (
        <>
          {/* Labels sit beside their inputs and are bound with htmlFor — without
              it the text is decoration and the field announces as unlabelled. */}
          <div>
            <label htmlFor="accept-name" className="mb-1.5 block text-sm font-medium">
              Your name
            </label>
            <Input id="accept-name" name="name" required placeholder="Ada Lovelace" />
          </div>
          <div>
            <label htmlFor="accept-password" className="mb-1.5 block text-sm font-medium">
              Choose a password
            </label>
            <Input
              id="accept-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="••••••••" />
            <p className="mt-1.5 text-xs text-ink-muted">At least 8 characters.</p>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-feedback-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Please wait…" : signedInAs ? "Join workspace" : "Create account and join"}
      </Button>
    </Card>
  );
}

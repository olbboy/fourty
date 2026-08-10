"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function LoginForm({ mode }: { mode: "setup" | "login" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withDemo, setWithDemo] = useState(true);

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
    const res = await fetch(mode === "setup" ? "/api/auth/setup" : "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
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
            Your name
          </label>
          <Input id="login-name" name="name" required placeholder="Ada Lovelace" />
        </div>
      )}
      <div>
        <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <Input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com" />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium">
          Password
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
      {mode === "setup" && (
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={withDemo}
            onChange={(e) => setWithDemo(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Load sample data so I can explore
        </label>
      )}
      {error && <p className="text-sm text-feedback-error">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Please wait…" : mode === "setup" ? "Create workspace" : "Sign in"}
      </Button>
    </Card>
  );
}

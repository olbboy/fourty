"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={onSubmit} className="card space-y-4 p-6">
      {mode === "setup" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">Your name</label>
          <input name="name" required className="input" placeholder="Ada Lovelace" />
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Email</label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          className="input"
          placeholder="••••••••"
        />
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
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Please wait…" : mode === "setup" ? "Create workspace" : "Sign in"}
      </button>
    </form>
  );
}

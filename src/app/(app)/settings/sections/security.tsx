"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Field, Spinner } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { qrMatrix, qrPathD } from "@/lib/qr";

type TwoFactorStatus = { enabled: boolean; pending: boolean };
type Enrollment = { secret: string; otpauthUri: string };

/** The Base32 secret in groups of four — how authenticator apps print keys. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Scannable rendering of the enrollment URI. The matrix goes on a fixed white
 * card with a four-module quiet zone: scanners require light-on-dark contrast
 * and margin regardless of the app's theme, so this square never follows dark
 * mode.
 */
function QrCode({ uri }: { uri: string }) {
  // The encoder throws only when the payload overflows its largest version — a
  // very long account email, here. The manual key beside this is the fallback,
  // so a failed draw degrades to a note rather than crashing the settings page.
  const code = useMemo(() => {
    try {
      const matrix = qrMatrix(uri);
      return { d: qrPathD(matrix), size: matrix.length };
    } catch {
      return null;
    }
  }, [uri]);
  if (!code) {
    return (
      <div className="flex h-44 w-44 items-center justify-center rounded-md bg-surface-2 p-3 text-center text-xs text-ink-muted">
        Couldn’t draw a QR code — add the key below by hand instead.
      </div>
    );
  }
  return (
    <svg
      role="img"
      aria-label="QR code — scan with your authenticator app"
      viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`}
      className="h-44 w-44 rounded-md bg-white"
      shapeRendering="crispEdges"
    >
      <path d={code.d} fill="#000" />
    </svg>
  );
}

export function SecuritySection() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/2fa/status");
    if (res.ok) setStatus(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function beginEnroll() {
    if (busy) return; // a second click would mint a second pending secret
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/2fa/setup", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setEnroll(data);
      else setError(data.error ?? "Could not start setup");
    } finally {
      setBusy(false);
    }
  }

  async function enable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const token = (new FormData(e.currentTarget).get("token") as string).trim();
    const res = await fetch("/api/2fa/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setBackupCodes(data.backupCodes ?? []);
      setEnroll(null);
      load();
    } else {
      setError(data.error ?? "Invalid code");
    }
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = new FormData(e.currentTarget).get("password") as string;
    const res = await fetch("/api/2fa/disable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setShowDisable(false);
      load();
    } else {
      setError(data.error ?? "Could not turn off two-factor");
    }
  }

  async function copyCodes() {
    if (!backupCodes) return;
    // Clipboard access can be denied (permissions, insecure context) — the
    // codes stay selectable on screen either way, so failure is non-fatal.
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card size="flush" className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Two-factor authentication</h2>
          <p className="text-sm text-ink-muted">
            Protect your sign-in with a second step — a 6-digit code from an authenticator app.
            Applies to your account, not the whole workspace.
          </p>
        </div>
        {!status ? (
          <Spinner />
        ) : status.enabled ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-feedback-ok" data-testid="twofa-state">
              On
            </span>
            <Button variant="outline" onClick={() => { setError(null); setShowDisable(true); }}>
              Turn off…
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted" data-testid="twofa-state">
              Off
            </span>
            <Button onClick={beginEnroll} disabled={busy}>Turn on two-factor…</Button>
          </div>
        )}
      </div>
      {error && !enroll && !showDisable && <p className="mt-2 text-sm text-feedback-error">{error}</p>}

      {/* ── Enrollment: scan, then confirm with the first code ─────────────── */}
      <Modal
        title="Set up two-factor authentication"
        open={!!enroll}
        onClose={() => { setEnroll(null); setError(null); }}
      >
        {enroll && (
          <form onSubmit={enable} className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              <QrCode uri={enroll.otpauthUri} />
              <div className="min-w-52 flex-1 space-y-2 text-sm">
                <p className="text-ink-muted">
                  Scan the code with your authenticator app (Google Authenticator, 1Password,
                  Authy…), or add the key by hand:
                </p>
                <code
                  className="block rounded bg-surface-2 px-2 py-1.5 font-mono text-xs tracking-wide break-all"
                  data-testid="twofa-secret"
                >
                  {groupSecret(enroll.secret)}
                </code>
              </div>
            </div>
            <Field label="Enter the 6-digit code from the app to confirm">
              <Input
                name="token"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                minLength={6}
                maxLength={10}
                placeholder="123456"
              />
            </Field>
            {error && <p className="text-sm text-feedback-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setEnroll(null); setError(null); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Checking…" : "Turn on"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Backup codes: shown exactly once ───────────────────────────────── */}
      <Modal
        title="Save your backup codes"
        open={!!backupCodes}
        onClose={() => { setBackupCodes(null); setCopied(false); }}
      >
        {backupCodes && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">
              Each code signs you in once if you lose the authenticator. They are shown only now —
              store them somewhere safe.
            </p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded bg-surface-2 p-3 font-mono text-sm">
              {backupCodes.map((code) => (
                <li key={code} data-testid="backup-code">
                  {code}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              {copied && <span className="text-sm text-feedback-ok">Copied</span>}
              <Button variant="outline" onClick={copyCodes}>
                Copy codes
              </Button>
              <Button onClick={() => { setBackupCodes(null); setCopied(false); }}>Done</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Disable: password re-auth ──────────────────────────────────────── */}
      <Modal
        title="Turn off two-factor authentication"
        open={showDisable}
        onClose={() => { setShowDisable(false); setError(null); }}
      >
        <form onSubmit={disable} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Your account goes back to password-only sign-in, and the backup codes stop working.
          </p>
          <Field label="Confirm your password">
            <Input name="password" type="password" required autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowDisable(false); setError(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-feedback-error hover:bg-feedback-error/90">
              {busy ? "Please wait…" : "Turn off"}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

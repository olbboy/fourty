"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Field, Spinner, LoadError } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { qrMatrix, qrPathD } from "@/lib/qr";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

type TwoFactorStatus = { enabled: boolean; pending: boolean };

/** Map known 2FA-API English errors to catalog keys; else a generic fallback. */
function twofaError(t: (key: MessageKey) => string, error: unknown, fallback: MessageKey): string {
  if (error === "Invalid code") return t("settings.twofaInvalidCode");
  if (error === "Incorrect password") return t("settings.twofaIncorrectPassword");
  if (error === "2FA is already enabled") return t("settings.twofaAlreadyEnabled");
  return t(fallback);
}

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
  const t = useT();
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
        {t("settings.twofaQrFail")}
      </div>
    );
  }
  return (
    <svg
      role="img"
      aria-label={t("settings.twofaQrAria")}
      viewBox={`-4 -4 ${code.size + 8} ${code.size + 8}`}
      className="h-44 w-44 rounded-md bg-white"
      shapeRendering="crispEdges"
    >
      <path d={code.d} fill="#000" />
    </svg>
  );
}

export function SecuritySection() {
  const t = useT();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/2fa/status");
      if (!res.ok) throw new Error("2fa");
      setStatus(await res.json());
    } catch {
      setFailed(true);
    }
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
      else setError(twofaError(t, data.error, "settings.twofaFailedSetup"));
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
      setError(twofaError(t, data.error, "settings.twofaInvalidCode"));
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
      setError(twofaError(t, data.error, "settings.twofaFailedDisable"));
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
          <h2 className="text-sm font-semibold">{t("settings.twofa")}</h2>
          <p className="text-sm text-ink-muted">{t("settings.twofaHint")}</p>
        </div>
        {failed ? (
          <LoadError
            onRetry={() => {
              setStatus(null);
              void load();
            }}
          />
        ) : !status ? (
          <Spinner />
        ) : status.enabled ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-feedback-ok" data-testid="twofa-state">
              {t("settings.twofaOn")}
            </span>
            <Button variant="outline" onClick={() => { setError(null); setShowDisable(true); }}>
              {t("settings.twofaTurnOff")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted" data-testid="twofa-state">
              {t("settings.twofaOff")}
            </span>
            <Button onClick={beginEnroll} disabled={busy}>{t("settings.twofaTurnOn")}</Button>
          </div>
        )}
      </div>
      {error && !enroll && !showDisable && <p className="mt-2 text-sm text-feedback-error">{error}</p>}

      {/* ── Enrollment: scan, then confirm with the first code ─────────────── */}
      <Modal
        title={t("settings.twofaSetupTitle")}
        open={!!enroll}
        onClose={() => { setEnroll(null); setError(null); }}
      >
        {enroll && (
          <form onSubmit={enable} className="space-y-4">
            <div className="flex flex-wrap items-start gap-4">
              <QrCode uri={enroll.otpauthUri} />
              <div className="min-w-52 flex-1 space-y-2 text-sm">
                <p className="text-ink-muted">{t("settings.twofaScanHint")}</p>
                <code
                  className="block rounded bg-surface-2 px-2 py-1.5 font-mono text-xs tracking-wide break-all"
                  data-testid="twofa-secret"
                >
                  {groupSecret(enroll.secret)}
                </code>
              </div>
            </div>
            <Field label={t("settings.twofaCodeLabel")}>
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
                {t("action.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? t("settings.twofaChecking") : t("settings.twofaTurnOnConfirm")}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ── Backup codes: shown exactly once ───────────────────────────────── */}
      <Modal
        title={t("settings.twofaBackupTitle")}
        open={!!backupCodes}
        onClose={() => { setBackupCodes(null); setCopied(false); }}
      >
        {backupCodes && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{t("settings.twofaBackupHint")}</p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded bg-surface-2 p-3 font-mono text-sm">
              {backupCodes.map((code) => (
                <li key={code} data-testid="backup-code">
                  {code}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-end gap-2">
              {copied && <span className="text-sm text-feedback-ok">{t("settings.twofaCopied")}</span>}
              <Button variant="outline" onClick={copyCodes}>
                {t("settings.twofaCopyCodes")}
              </Button>
              <Button onClick={() => { setBackupCodes(null); setCopied(false); }}>{t("settings.twofaDone")}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Disable: password re-auth ──────────────────────────────────────── */}
      <Modal
        title={t("settings.twofaDisableTitle")}
        open={showDisable}
        onClose={() => { setShowDisable(false); setError(null); }}
      >
        <form onSubmit={disable} className="space-y-4">
          <p className="text-sm text-ink-muted">{t("settings.twofaDisableHint")}</p>
          <Field label={t("settings.twofaPassword")}>
            <Input name="password" type="password" required autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowDisable(false); setError(null); }}
            >
              {t("action.cancel")}
            </Button>
            <Button type="submit" disabled={busy} className="bg-feedback-error hover:bg-feedback-error/90">
              {busy ? t("settings.twofaWait") : t("settings.twofaTurnOffConfirm")}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

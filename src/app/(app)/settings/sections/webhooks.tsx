"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner, LoadError, useConfirm } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";

type SecretPayload = {
  secret: string;
  signatureHeader?: string;
  timestampHeader?: string;
};

// Admin-only (Gate D3). A non-admin gets a 403 from GET and sees nothing.
// The API stays the source of truth; this panel never talks to the signer.
export function WebhooksSection() {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [payload, setPayload] = useState<SecretPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/webhooks/secret");
      if (res.status === 403) {
        setAdminOnly(true);
        return;
      }
      if (!res.ok) throw new Error("webhooks");
      setPayload(await res.json());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rotate() {
    const ok = await askConfirm({
      title: t("settings.webhooksRotateTitle"),
      body: t("settings.webhooksRotateBody"),
      confirmLabel: t("settings.webhooksRotate"),
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/webhooks/secret", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setPayload((prev) => ({
        secret: data.secret,
        signatureHeader: prev?.signatureHeader,
        timestampHeader: prev?.timestampHeader,
      }));
    } else {
      setError(t("settings.webhooksFailedRotate"));
    }
  }

  if (adminOnly) return null;

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("settings.webhooks")}</h2>
          <p className="text-sm text-ink-muted">{t("settings.webhooksHint")}</p>
        </div>
        <Button onClick={rotate} disabled={busy || !payload} variant="outline" size="sm">
          {t("settings.rotateSecret")}
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {failed ? (
        <LoadError
          onRetry={() => {
            setPayload(null);
            void load();
          }}
        />
      ) : !payload ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("settings.webhooksSigningSecret")}
          </p>
          <code
            data-testid="webhook-signing-secret"
            className="mb-2 block select-all break-all rounded bg-surface-2 px-2 py-1.5 text-xs"
          >
            {payload.secret}
          </code>
          <p className="text-xs text-ink-muted">
            {t("settings.webhooksHeaders")}{" "}
            <code>{payload.signatureHeader ?? "X-Fourty-Signature"}</code>
            {", "}
            <code>{payload.timestampHeader ?? "X-Fourty-Timestamp"}</code>
            . {t("settings.webhooksSignedAs")}
          </p>
        </>
      )}
      {confirmDialog}
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconKey, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useLocale, useT } from "@/lib/i18n/provider";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
};

export function ApiKeysSection() {
  const t = useT();
  const locale = useLocale();
  const [askConfirm, confirmDialog] = useConfirm();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/api-keys");
      if (!res.ok) throw new Error("api-keys");
      setKeys((await res.json()).keys);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setError(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewSecret(data.secret);
      setName("");
      load();
    } else {
      setError(t("settings.apiKeysFailedCreate"));
    }
  }

  async function revoke(k: ApiKey) {
    const ok = await askConfirm({
      title: t("settings.apiKeysRevokeTitle", { name: k.name }),
      body: t("settings.apiKeysRevokeBody"),
      confirmLabel: t("settings.apiKeysRevoke"),
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/api-keys?id=${k.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(t("settings.apiKeysFailedRevoke"));
      return;
    }
    load();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <IconKey width={15} height={15} /> {t("settings.apiKeys")}
        </h2>
        <p className="text-sm text-ink-muted">{t("settings.apiKeysHint")}</p>
      </div>
      <div className="mb-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          aria-label={t("settings.apiKeysNameAria")}
          placeholder={t("settings.apiKeysNamePlaceholder")} className="max-w-xs" />
        <Button onClick={create} disabled={!name.trim()}>
          {t("settings.apiKeysGenerate")}
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      {newSecret && (
        <div className="mb-3 rounded-lg border border-feedback-warn/20 bg-feedback-warn-wash p-3">
          <p className="mb-1 text-xs font-semibold text-feedback-warn">
            {t("settings.apiKeysCopyNow")}
          </p>
          <code className="block select-all break-all rounded bg-surface px-2 py-1.5 text-xs">
            {newSecret}
          </code>
        </div>
      )}
      {failed ? (
        <LoadError
          onRetry={() => {
            setKeys(null);
            void load();
          }}
        />
      ) : !keys ? (
        <Spinner />
      ) : keys.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t("settings.apiKeysEmpty")}</p>
      ) : (
        <div className="divide-y divide-line/60">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className={`text-sm font-medium ${k.revokedAt ? "text-ink-muted line-through" : ""}`}>
                  {k.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {k.prefix}… · {t("settings.apiKeysCreated", { when: timeAgo(k.createdAt, locale) })}
                  {k.lastUsedAt && ` · ${t("settings.apiKeysLastUsed", { when: timeAgo(k.lastUsedAt, locale) })}`}
                  {k.revokedAt && ` · ${t("settings.apiKeysRevoked")}`}
                </p>
              </div>
              {!k.revokedAt && (
                <Button
                  onClick={() => revoke(k)}
                  aria-label={t("settings.apiKeysRevokeAria", { name: k.name })} variant="outline" size="icon-sm" className="text-feedback-error">
                  <IconTrash width={14} height={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </Card>
  );
}


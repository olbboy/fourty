"use client";

import { useCallback, useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";
import { Spinner, useConfirm } from "@/components/ui";
import { IconKey, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
};

export function ApiKeysSection() {
  const [askConfirm, confirmDialog] = useConfirm();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/api-keys");
    if (res.ok) setKeys((await res.json()).keys);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
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
    }
  }

  async function revoke(k: ApiKey) {
    const ok = await askConfirm({
      title: `Revoke key “${k.name}”?`,
      body: "Integrations using it will stop working.",
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    await fetch(`/api/api-keys?id=${k.id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <IconKey width={15} height={15} /> API keys
        </h2>
        <p className="text-sm text-ink-muted">
          Programmatic access for scripts and integrations. Keys are hashed at rest — the secret is
          shown once.
        </p>
      </div>
      <div className="mb-3 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          aria-label="Name for the new API key"
          placeholder="Key name, e.g. Zapier" className="max-w-xs" />
        <Button onClick={create} disabled={!name.trim()}>
          Generate
        </Button>
      </div>
      {newSecret && (
        <div className="mb-3 rounded-lg border border-feedback-warn/20 bg-feedback-warn-wash p-3">
          <p className="mb-1 text-xs font-semibold text-feedback-warn">
            Copy this key now — it won&apos;t be shown again:
          </p>
          <code className="block select-all break-all rounded bg-surface px-2 py-1.5 text-xs">
            {newSecret}
          </code>
        </div>
      )}
      {!keys ? (
        <Spinner />
      ) : keys.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">No API keys yet.</p>
      ) : (
        <div className="divide-y divide-line/60">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className={`text-sm font-medium ${k.revokedAt ? "text-ink-muted line-through" : ""}`}>
                  {k.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {k.prefix}… · created {timeAgo(k.createdAt)}
                  {k.lastUsedAt && ` · last used ${timeAgo(k.lastUsedAt)}`}
                  {k.revokedAt && " · revoked"}
                </p>
              </div>
              {!k.revokedAt && (
                <Button
                  onClick={() => revoke(k)}
                  aria-label={`Revoke ${k.name}`} variant="outline" size="icon-sm" className="text-feedback-error">
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


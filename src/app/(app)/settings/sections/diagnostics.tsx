"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner, LoadError } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";

const CAP_I18N: Record<string, { label: MessageKey; from: MessageKey; gives: MessageKey }> = {
  AI_PROVIDER: {
    label: "settings.cap.ai.label",
    from: "settings.cap.ai.from",
    gives: "settings.cap.ai.gives",
  },
  MAILBOX: {
    label: "settings.cap.mailbox.label",
    from: "settings.cap.mailbox.from",
    gives: "settings.cap.mailbox.gives",
  },
  CALENDAR: {
    label: "settings.cap.calendar.label",
    from: "settings.cap.calendar.from",
    gives: "settings.cap.calendar.gives",
  },
  WEBHOOKS: {
    label: "settings.cap.webhooks.label",
    from: "settings.cap.webhooks.from",
    gives: "settings.cap.webhooks.gives",
  },
  CUSTOM_OBJECTS: {
    label: "settings.cap.objects.label",
    from: "settings.cap.objects.from",
    gives: "settings.cap.objects.gives",
  },
};

/**
 * Settings → Diagnostics (Phase 0). Read-only list of what this workspace can
 * reach, plus the one editable line of identity the AI assistant is grounded
 * with. Admin-only server-side; a non-admin gets a 403 and sees nothing, the
 * same contract the other admin panels use — the API stays the single source of
 * truth on permission.
 *
 * No secrets are rendered, not even redacted ones: the payload carries booleans
 * and labels only.
 */
type Capability = {
  id: string;
  label: string;
  configuredFrom: string;
  gives: string;
  on: boolean;
};

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

function capCopy(c: Capability, t: TFn): { label: string; from: string; gives: string } {
  const keys = CAP_I18N[c.id];
  if (!keys) return { label: c.label, from: c.configuredFrom, gives: c.gives };
  return { label: t(keys.label), from: t(keys.from), gives: t(keys.gives) };
}

export function DiagnosticsSection() {
  const t = useT();
  const [caps, setCaps] = useState<Capability[] | null>(null);
  const [failed, setFailed] = useState(false);
  // The cap comes from the server rather than a copy of the constant here: the
  // API is what enforces it, and two numbers drift.
  const [aboutMax, setAboutMax] = useState(320);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState(true);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/diagnostics");
      if (res.status === 403) {
        setHidden(true);
        return;
      }
      if (!res.ok) throw new Error("diagnostics");
      const data = await res.json();
      setCaps(data.capabilities);
      setAboutMax(data.aboutMax);
      setName(data.workspace.name);
      setAbout(data.workspace.about ?? "");
      setSaved(data.workspace.about ?? "");
      setResearch(data.keylessResearch);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function saveAbout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ about }),
      });
      if (!res.ok) {
        setError(t("settings.diagnosticsFailedSave"));
        return;
      }
      setSaved(((await res.json()).workspace.about as string | null) ?? "");
    } catch {
      setError(t("settings.diagnosticsFailedSave"));
    } finally {
      setSaving(false);
    }
  }

  /** The switch is optimistic, then reconciled with what the server stored. */
  async function toggleResearch(next: boolean) {
    setResearch(next);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keylessResearch: next }),
      });
      if (res.ok) setResearch((await res.json()).keylessResearch as boolean);
      else {
        setResearch(!next);
        setError(t("settings.diagnosticsFailedResearch"));
      }
    } catch {
      setResearch(!next);
      setError(t("settings.diagnosticsFailedResearch"));
    }
  }

  if (hidden) return null;

  return (
    <Card size="flush" className="p-4">
      <h2 className="mb-1 text-sm font-semibold">{t("settings.diagnostics")}</h2>
      <p className="mb-3 text-sm text-ink-muted">{t("settings.diagnosticsHint")}</p>

      {failed ? (
        <LoadError
          onRetry={() => {
            setCaps(null);
            void load();
          }}
        />
      ) : caps === null ? (
        <Spinner />
      ) : (
        <ul className="mb-4 space-y-2">
          {caps.map((c) => {
            const copy = capCopy(c, t);
            return (
              <li key={c.id} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                    c.on
                      ? "bg-feedback-ok-wash text-feedback-ok"
                      : "bg-surface-2 text-ink-muted"
                  }`}
                >
                  {c.on ? t("settings.twofaOn") : t("settings.twofaOff")}
                </span>
                <span>
                  <strong className="font-medium">{copy.label}</strong>
                  <span className="text-ink-muted"> — {copy.gives}.</span>
                  <br />
                  <span className="text-xs text-ink-muted">
                    {t("settings.diagnosticsConfiguredFrom", { source: copy.from })}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p role="alert" className="mb-3 text-sm text-feedback-error">
          {error}
        </p>
      )}

      <div className="mb-4 border-t border-line pt-3">
        <label htmlFor="keyless-research" className="flex items-start gap-3 text-sm">
          <input
            id="keyless-research"
            type="checkbox"
            checked={research}
            onChange={(e) => toggleResearch(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <strong className="font-medium">{t("settings.diagnosticsResearchTitle")}</strong>
            <span className="text-ink-muted"> {t("settings.diagnosticsResearchHint")}</span>
            <br />
            <span className="text-xs text-ink-muted">{t("settings.diagnosticsResearchOff")}</span>
          </span>
        </label>
      </div>

      <form onSubmit={saveAbout} className="border-t border-line pt-3">
        <label htmlFor="workspace-about" className="mb-1 block text-sm font-medium">
          {t("settings.diagnosticsAboutLabel", { name: name || t("settings.diagnosticsWorkspace") })}
        </label>
        <p className="mb-2 text-xs text-ink-muted">
          {t("settings.diagnosticsAboutHint", { max: aboutMax })}
        </p>
        <Input
          id="workspace-about"
          value={about}
          maxLength={aboutMax}
          onChange={(e) => setAbout(e.target.value)}
          placeholder={t("settings.diagnosticsAboutPlaceholder")} />
        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" disabled={saving || about === saved}>
            {saving ? t("form.saving") : t("action.save")}
          </Button>
          <span className="text-xs text-ink-muted">
            {about.length}/{aboutMax}
          </span>
        </div>
      </form>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/ui";

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

export function DiagnosticsSection() {
  const [caps, setCaps] = useState<Capability[] | null>(null);
  // The cap comes from the server rather than a copy of the constant here: the
  // API is what enforces it, and two numbers drift.
  const [aboutMax, setAboutMax] = useState(320);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [research, setResearch] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/diagnostics");
    if (res.status === 403) {
      setHidden(true);
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setCaps(data.capabilities);
    setAboutMax(data.aboutMax);
    setName(data.workspace.name);
    setAbout(data.workspace.about ?? "");
    setSaved(data.workspace.about ?? "");
    setResearch(data.keylessResearch);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function saveAbout(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/diagnostics", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ about }),
    });
    if (res.ok) setSaved(((await res.json()).workspace.about as string | null) ?? "");
    setSaving(false);
  }

  /** The switch is optimistic, then reconciled with what the server stored. */
  async function toggleResearch(next: boolean) {
    setResearch(next);
    const res = await fetch("/api/diagnostics", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keylessResearch: next }),
    });
    if (res.ok) setResearch((await res.json()).keylessResearch as boolean);
    else setResearch(!next);
  }

  if (hidden) return null;

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-sm font-semibold">Diagnostics</h2>
      <p className="mb-3 text-sm text-ink-muted">
        What this workspace can reach. The assistant is told exactly this list, so it stops planning
        around integrations that are not connected.
      </p>

      {caps === null ? (
        <Spinner />
      ) : (
        <ul className="mb-4 space-y-2">
          {caps.map((c) => (
            <li key={c.id} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${
                  c.on
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                    : "bg-surface-2 text-ink-muted"
                }`}
              >
                {c.on ? "On" : "Off"}
              </span>
              <span>
                <strong className="font-medium">{c.label}</strong>
                <span className="text-ink-muted"> — {c.gives}.</span>
                <br />
                <span className="text-xs text-ink-muted">Configured from {c.configuredFrom}</span>
              </span>
            </li>
          ))}
        </ul>
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
            <strong className="font-medium">Read connected mailboxes for facts</strong>
            <span className="text-ink-muted">
              {" "}
              — signatures, replies and meetings become suggestions on a contact, with the source shown.
              No API key, no vendor and no AI model is involved, so this works on a fresh install.
            </span>
            <br />
            <span className="text-xs text-ink-muted">
              Turning it off stops the reading. Facts already on your records stay, and can be reverted
              one by one.
            </span>
          </span>
        </label>
      </div>

      <form onSubmit={saveAbout} className="border-t border-line pt-3">
        <label htmlFor="workspace-about" className="mb-1 block text-sm font-medium">
          What {name || "this workspace"} does
        </label>
        <p className="mb-2 text-xs text-ink-muted">
          One line, at most {aboutMax} characters. It opens the assistant&apos;s prompt, so it should
          read like an introduction to a new rep: what you sell and to whom.
        </p>
        <input
          id="workspace-about"
          value={about}
          maxLength={aboutMax}
          onChange={(e) => setAbout(e.target.value)}
          className="input"
          placeholder="We sell fleet telematics to mid-size logistics operators in the EU."
        />
        <div className="mt-2 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving || about === saved}>
            {saving ? "Saving…" : "Save"}
          </button>
          <span className="text-xs text-ink-muted">
            {about.length}/{aboutMax}
          </span>
        </div>
      </form>
    </div>
  );
}

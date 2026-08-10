"use client";

import { useCallback, useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { Modal, Field, Spinner, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url"];

export function CustomFieldsSection() {
  const [askConfirm, confirmDialog] = useConfirm();
  const [entity, setEntity] = useState<"contact" | "company" | "deal">("contact");
  const [fields, setFields] = useState<CustomFieldDef[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [type, setType] = useState("text");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/custom-fields?entity=${entity}`);
    if (res.ok) setFields((await res.json()).fields);
  }, [entity]);
  useEffect(() => {
    setFields(null);
    load();
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const label = (f.get("label") as string).trim();
    const res = await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entity,
        label,
        key:
          (f.get("key") as string)?.trim() ||
          label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
        type: f.get("type"),
        options:
          f.get("type") === "select"
            ? ((f.get("options") as string) ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
      }),
    });
    if (res.ok) {
      setShowNew(false);
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
    }
  }

  async function remove(field: CustomFieldDef) {
    const ok = await askConfirm({
      title: `Delete field “${field.label}”?`,
      body: "Existing values stay in records but stop displaying.",
    });
    if (!ok) return;
    await fetch(`/api/custom-fields/${field.id}`, { method: "DELETE" });
    load();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Custom fields</h2>
          <p className="text-sm text-ink-muted">
            Extend any object with your own fields — they appear in forms, detail pages, and the API
            instantly.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <IconPlus width={15} height={15} /> New field
        </Button>
      </div>
      <div className="mb-3 flex gap-1.5">
        {(["contact", "company", "deal"] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEntity(e)}
            className={`chip cursor-pointer !px-3 !py-1.5 capitalize transition ${
              entity === e
                ? "bg-primary text-primary-foreground"
                : "border border-line text-ink-muted hover:border-accent-400"
            }`}
          >
            {e}s
          </button>
        ))}
      </div>
      {!fields ? (
        <Spinner />
      ) : fields.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">No custom fields for {entity}s yet.</p>
      ) : (
        <div className="divide-y divide-line/60">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-ink-muted">
                  {f.key} · {f.type}
                  {f.type === "select" && f.options.length > 0 && ` (${f.options.join(", ")})`}
                </p>
              </div>
              <Button
                onClick={() => remove(f)}
                aria-label={`Delete ${f.label}`} variant="outline" size="icon-sm" className="text-feedback-error">
                <IconTrash width={14} height={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal title={`New ${entity} field`} open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Label">
            <Input name="label" required placeholder="e.g. Contract tier" />
          </Field>
          <Field label="Key (optional — auto-generated from label)">
            <Input name="key" placeholder="contract_tier" pattern="[a-z][a-z0-9_]*" />
          </Field>
          <Field label="Type">
            <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full">
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {type === "select" && (
            <Field label="Options (comma separated)">
              <Input name="options" placeholder="Bronze, Silver, Gold" />
            </Field>
          )}
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">
              Create field
            </Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}


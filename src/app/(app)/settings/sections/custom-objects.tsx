"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Modal, Field, Spinner, useConfirm } from "@/components/ui";
import { IconPlus, IconTrash, IconArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

/**
 * Definition management for no-code custom objects (ADR-007). Everything here
 * drives the existing /api/custom-objects surface — records live on their own
 * page at /objects/{apiName}. The sidebar listens for `fourty:objects-changed`
 * so a created or deleted object shows up without a reload.
 */

export type CustomObjectDef = {
  id: string;
  apiName: string;
  nameSingular: string;
  namePlural: string;
  icon: string;
  description: string | null;
};

export type ObjectFieldDef = {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string[];
  required: number;
  order: number;
};

const FIELD_TYPES = ["text", "number", "date", "select", "checkbox", "url"];

export function objectsChanged(): void {
  window.dispatchEvent(new CustomEvent("fourty:objects-changed"));
}

/** Derive an api_name / field key from a human label (mirrors custom-fields). */
function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function CustomObjectsSection() {
  const [askConfirm, confirmDialog] = useConfirm();
  const [objects, setObjects] = useState<CustomObjectDef[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [fieldsFor, setFieldsFor] = useState<CustomObjectDef | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/custom-objects");
    if (res.ok) setObjects((await res.json()).objects);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const namePlural = (f.get("namePlural") as string).trim();
    const res = await fetch("/api/custom-objects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        namePlural,
        nameSingular: (f.get("nameSingular") as string).trim(),
        apiName: (f.get("apiName") as string)?.trim() || slugify(namePlural),
        description: (f.get("description") as string)?.trim() || null,
      }),
    });
    if (res.ok) {
      setShowNew(false);
      load();
      objectsChanged();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
    }
  }

  async function remove(object: CustomObjectDef) {
    const ok = await askConfirm({
      title: `Delete “${object.namePlural}”?`,
      body: "The object, its fields, and every record in it are deleted permanently.",
    });
    if (!ok) return;
    await fetch(`/api/custom-objects/${object.id}`, { method: "DELETE" });
    load();
    objectsChanged();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Custom objects</h2>
          <p className="text-sm text-ink-muted">
            Model anything beyond contacts and deals — Projects, Tickets, Subscriptions. Each
            object gets its own page, fields, REST/GraphQL endpoints, and MCP tools.
          </p>
        </div>
        <Button onClick={() => { setError(null); setShowNew(true); }}>
          <IconPlus width={15} height={15} /> New object
        </Button>
      </div>

      {!objects ? (
        <Spinner />
      ) : objects.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">No custom objects yet.</p>
      ) : (
        <div className="divide-y divide-line/60">
          {objects.map((o) => (
            <div key={o.id} data-testid="custom-object" className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{o.namePlural}</p>
                <p className="truncate text-xs text-ink-muted">
                  {o.apiName} · singular “{o.nameSingular}”
                  {o.description ? ` — ${o.description}` : ""}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setFieldsFor(o)}>
                Fields…
              </Button>
              <Link
                href={`/objects/${o.apiName}`}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent-600 hover:underline"
              >
                Open <IconArrowRight width={14} height={14} />
              </Link>
              <Button
                onClick={() => remove(o)}
                aria-label={`Delete ${o.namePlural}`}
                variant="outline"
                size="icon-sm"
                className="text-feedback-error"
              >
                <IconTrash width={14} height={14} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal title="New custom object" open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={create} className="space-y-4">
          <Field label="Plural name (shown in the sidebar)">
            <Input name="namePlural" required placeholder="e.g. Projects" />
          </Field>
          <Field label="Singular name">
            <Input name="nameSingular" required placeholder="e.g. Project" />
          </Field>
          <Field label="API name (optional — auto-generated from the plural)">
            <Input name="apiName" placeholder="projects" pattern="[a-z][a-z0-9_]*" />
          </Field>
          <Field label="Description (optional)">
            <Input name="description" placeholder="What this object tracks" />
          </Field>
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">Create object</Button>
          </div>
        </form>
      </Modal>

      {fieldsFor && (
        <ObjectFieldsModal
          object={fieldsFor}
          onClose={() => setFieldsFor(null)}
          askConfirm={askConfirm}
        />
      )}
      {confirmDialog}
    </Card>
  );
}

function ObjectFieldsModal({
  object,
  onClose,
  askConfirm,
}: {
  object: CustomObjectDef;
  onClose: () => void;
  askConfirm: (req: { title: string; body?: string }) => Promise<boolean>;
}) {
  const [fields, setFields] = useState<ObjectFieldDef[] | null>(null);
  const [type, setType] = useState("text");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/custom-objects/${object.id}`);
    if (res.ok) setFields((await res.json()).fields);
  }, [object.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function addField(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    const label = (f.get("label") as string).trim();
    const res = await fetch(`/api/custom-objects/${object.id}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label,
        key: (f.get("key") as string)?.trim() || slugify(label),
        type: f.get("type"),
        required: f.get("required") === "on",
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
      form.reset();
      setType("text");
      load();
    } else {
      setError((await res.json().catch(() => ({}))).error ?? "Failed");
    }
  }

  async function removeField(field: ObjectFieldDef) {
    const ok = await askConfirm({
      title: `Delete field “${field.label}”?`,
      body: "Existing values stay in records but stop displaying.",
    });
    if (!ok) return;
    await fetch(`/api/custom-objects/${object.id}/fields/${field.id}`, { method: "DELETE" });
    load();
  }

  return (
    <Modal title={`${object.namePlural} — fields`} open onClose={onClose}>
      <div className="space-y-4">
        {!fields ? (
          <Spinner />
        ) : fields.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No fields yet — records need at least one to be useful.
          </p>
        ) : (
          <div className="divide-y divide-line/60">
            {fields.map((f) => (
              <div key={f.id} data-testid="object-field" className="flex items-center gap-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {f.label}
                    {f.required === 1 && <span className="text-feedback-error"> *</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {f.key} · {f.type}
                    {f.type === "select" && f.options.length > 0 && ` (${f.options.join(", ")})`}
                  </p>
                </div>
                <Button
                  onClick={() => removeField(f)}
                  aria-label={`Delete ${f.label}`}
                  variant="outline"
                  size="icon-sm"
                  className="text-feedback-error"
                >
                  <IconTrash width={14} height={14} />
                </Button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addField} className="space-y-3 rounded-md border border-line/60 p-3">
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Add a field</p>
          <Field label="Label">
            <Input name="label" required placeholder="e.g. Status" />
          </Field>
          <Field label="Key (optional — auto-generated from label)">
            <Input name="key" placeholder="status" pattern="[a-z][a-z0-9_]*" />
          </Field>
          <Field label="Type">
            <NativeSelect
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {type === "select" && (
            <Field label="Options (comma separated)">
              <Input name="options" placeholder="Open, In progress, Done" />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" name="required" className="h-4 w-4 accent-indigo-600" />
            Required
          </label>
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              <IconPlus width={14} height={14} /> Add field
            </Button>
          </div>
        </form>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}

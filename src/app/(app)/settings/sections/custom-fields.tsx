"use client";

import { useCallback, useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { Modal, Field, Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n";
import { formatCustomObjectError } from "@/lib/custom-object-display";
import { FIELD_TYPES, fieldTypeLabel } from "@/lib/field-type-display";

function sameOptions(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const NEW_FIELD_TITLE: Record<"contact" | "company" | "deal", MessageKey> = {
  contact: "settings.newContactField",
  company: "settings.newCompanyField",
  deal: "settings.newDealField",
};

const ENTITY_NAV: Record<"contact" | "company" | "deal", MessageKey> = {
  contact: "nav.contacts",
  company: "nav.companies",
  deal: "nav.deals",
};

export function CustomFieldsSection() {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [entity, setEntity] = useState<"contact" | "company" | "deal">("contact");
  const [fields, setFields] = useState<CustomFieldDef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDef | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState("text");
  const [editOptions, setEditOptions] = useState("");
  const [editRequired, setEditRequired] = useState(false);
  const [type, setType] = useState("text");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch(`/api/custom-fields?entity=${entity}`);
      if (!res.ok) throw new Error("custom-fields");
      setFields((await res.json()).fields);
    } catch {
      setFailed(true);
    }
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
      setShowNew(false);
      load();
    } else {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failed"));
    }
  }

  function openEdit(field: CustomFieldDef) {
    setShowNew(false);
    setError(null);
    setEditing(field);
    setEditLabel(field.label);
    setEditType(field.type);
    setEditOptions((field.options ?? []).join(", "));
    setEditRequired(field.required === 1);
  }

  async function saveField(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    const label = editLabel.trim();
    const type = editType;
    const required = editRequired;
    const options =
      type === "select"
        ? editOptions
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const body: Record<string, unknown> = {};
    if (label !== editing.label) body.label = label;
    if (type !== editing.type) body.type = type;
    if (required !== (editing.required === 1)) body.required = required;
    if (type === "select" && !sameOptions(options, editing.options ?? [])) body.options = options;
    if (Object.keys(body).length === 0) {
      setEditing(null);
      return;
    }
    const res = await fetch(`/api/custom-fields/${editing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditing(null);
      load();
    } else {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedSaveField"));
    }
  }

  async function remove(field: CustomFieldDef) {
    const ok = await askConfirm({
      title: t("settings.deleteFieldTitle", { label: field.label }),
      body: t("settings.deleteFieldBody"),
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/custom-fields/${field.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedDeleteField"));
      return;
    }
    load();
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("settings.customFields")}</h2>
          <p className="text-sm text-ink-muted">{t("settings.customFieldsHint")}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowNew(true);
          }}
        >
          <IconPlus width={15} height={15} /> {t("settings.newField")}
        </Button>
      </div>
      {error && !showNew && !editing && <p className="mb-3 text-sm text-feedback-error">{error}</p>}
      <div className="mb-3 flex gap-1.5">
        {(["contact", "company", "deal"] as const).map((e) => (
          <Button
            key={e}
            onClick={() => {
              setEditing(null);
              setEntity(e);
            }}
            size="sm"
            variant={entity === e ? "default" : "outline"}
            className={`rounded-4xl text-xs ${
              entity === e ? "" : "text-ink-muted hover:border-accent-400"
            }`}
          >
            {t(ENTITY_NAV[e])}
          </Button>
        ))}
      </div>
      {failed ? (
        <LoadError
          onRetry={() => {
            setFields(null);
            void load();
          }}
        />
      ) : !fields ? (
        <Spinner />
      ) : fields.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t("settings.customFieldsEmpty", { entity })}</p>
      ) : (
        <div className="divide-y divide-line/60">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-ink-muted">
                  {f.key} · {fieldTypeLabel(f.type, t)}
                  {f.required ? t("settings.requiredSuffix") : ""}
                  {f.type === "select" && f.options.length > 0 && ` (${f.options.join(", ")})`}
                </p>
              </div>
              <Button
                onClick={() => openEdit(f)}
                aria-label={t("settings.editFieldAria", { label: f.label })}
                variant="outline"
                size="icon-sm"
              >
                <IconEdit width={14} height={14} />
              </Button>
              <Button
                onClick={() => remove(f)}
                aria-label={t("settings.deleteFieldAria", { label: f.label })}
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

      <Modal
        title={t(NEW_FIELD_TITLE[entity])}
        open={showNew}
        onClose={() => {
          setShowNew(false);
          setError(null);
        }}
      >
        <form onSubmit={create} className="space-y-4">
          <Field label={t("settings.fieldLabel")}>
            <Input name="label" required placeholder={t("settings.fieldLabelPlaceholder")} />
          </Field>
          <Field label={t("settings.fieldKey")}>
            <Input name="key" placeholder={t("settings.fieldKeyPlaceholder")} pattern="[a-z][a-z0-9_]*" />
          </Field>
          <Field label={t("settings.fieldType")}>
            <NativeSelect name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-full">
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {fieldTypeLabel(ft, t)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {type === "select" && (
            <Field label={t("settings.fieldOptions")}>
              <Input name="options" placeholder={t("settings.fieldOptionsPlaceholder")} />
            </Field>
          )}
          <Field label={t("settings.fieldRequired")}>
            <input type="checkbox" name="required" className="h-4 w-4 accent-indigo-600" />
          </Field>
          {error && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">
              {t("settings.createField")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={editing ? t("settings.editFieldAria", { label: editing.label }) : t("settings.saveField")}
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setError(null);
        }}
      >
        <form onSubmit={saveField} className="space-y-4">
          <Field label={t("settings.fieldLabel")}>
            <Input name="label" required value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
          </Field>
          <Field label={t("settings.fieldType")}>
            <NativeSelect
              name="type"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
              className="w-full"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {fieldTypeLabel(ft, t)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {editType === "select" && (
            <Field label={t("settings.fieldOptions")}>
              <Input
                name="options"
                value={editOptions}
                onChange={(e) => setEditOptions(e.target.value)}
                placeholder={t("settings.fieldOptionsPlaceholder")}
              />
            </Field>
          )}
          <Field label={t("settings.fieldRequired")}>
            <input
              type="checkbox"
              name="required"
              checked={editRequired}
              onChange={(e) => setEditRequired(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
          </Field>
          {error && editing && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">{t("settings.saveField")}</Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}


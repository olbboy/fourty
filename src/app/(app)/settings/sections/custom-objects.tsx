"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CustomObjectDef, CustomObjectFieldDef } from "@/lib/types";
import { Modal, Field, Spinner, LoadError, useConfirm } from "@/components/ui";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { formatCustomObjectError } from "@/lib/custom-object-display";
import { FIELD_TYPES, fieldTypeLabel } from "@/lib/field-type-display";

function sameOptions(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function slugifyApiName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function guessPlural(singular: string): string {
  const s = singular.trim();
  if (!s) return "";
  if (/[sxz]$/i.test(s) || /(?:ch|sh)$/i.test(s)) return `${s}es`;
  if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
}

export function objectsChanged(): void {
  window.dispatchEvent(new CustomEvent("fourty:objects-changed"));
}

export function CustomObjectsSection() {
  const t = useT();
  const [askConfirm, confirmDialog] = useConfirm();
  const [objects, setObjects] = useState<CustomObjectDef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [fieldsById, setFieldsById] = useState<Record<string, CustomObjectFieldDef[]>>({});
  const [fieldsFailed, setFieldsFailed] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [addingFieldTo, setAddingFieldTo] = useState<CustomObjectDef | null>(null);
  const [editingField, setEditingField] = useState<{
    obj: CustomObjectDef;
    field: CustomObjectFieldDef;
  } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editType, setEditType] = useState("text");
  const [editOptions, setEditOptions] = useState("");
  const [editRequired, setEditRequired] = useState(false);
  const [fieldType, setFieldType] = useState("text");
  const [singular, setSingular] = useState("");
  const [plural, setPlural] = useState("");
  const [apiName, setApiName] = useState("");
  const [apiNameTouched, setApiNameTouched] = useState(false);
  const [pluralTouched, setPluralTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
    const res = await fetch("/api/custom-objects");
    if (!res.ok) throw new Error("custom-objects");
    const objects = ((await res.json()).objects ?? []) as CustomObjectDef[];
    setObjects(objects);
    const entries = await Promise.all(
      objects.map(async (obj) => {
        try {
          const r = await fetch(`/api/custom-objects/${obj.id}`);
          if (!r.ok) throw new Error(String(r.status));
          const fields = ((await r.json()).fields ?? []) as CustomObjectFieldDef[];
          return { id: obj.id, fields: Array.isArray(fields) ? fields : [], failed: false };
        } catch {
          return { id: obj.id, fields: [] as CustomObjectFieldDef[], failed: true };
        }
      }),
    );
    setFieldsById(Object.fromEntries(entries.map((e) => [e.id, e.fields])));
    setFieldsFailed(Object.fromEntries(entries.map((e) => [e.id, e.failed])));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetNewObject() {
    setSingular("");
    setPlural("");
    setApiName("");
    setApiNameTouched(false);
    setPluralTouched(false);
    setError(null);
  }

  async function createObject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/custom-objects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nameSingular: (f.get("nameSingular") as string).trim(),
        namePlural: (f.get("namePlural") as string).trim(),
        apiName: (f.get("apiName") as string).trim(),
        description: (f.get("description") as string).trim() || null,
      }),
    });
    if (res.ok) {
      setShowNew(false);
      resetNewObject();
      objectsChanged();
      load();
    } else {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedCreateObject"));
    }
  }

  async function createField(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addingFieldTo) return;
    setError(null);
    const f = new FormData(e.currentTarget);
    const label = (f.get("label") as string).trim();
    const res = await fetch(`/api/custom-objects/${addingFieldTo.id}/fields`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label,
        key:
          (f.get("key") as string)?.trim() ||
          slugifyApiName(label),
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
      setAddingFieldTo(null);
      setFieldType("text");
      load();
    } else {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedAddField"));
    }
  }

  async function removeObject(obj: CustomObjectDef) {
    const ok = await askConfirm({
      title: t("settings.deleteObjectTitle", { name: obj.namePlural }),
      body: t("settings.deleteObjectBody"),
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/custom-objects/${obj.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedDeleteObject"));
    } else {
      objectsChanged();
    }
    load();
  }

  async function removeField(obj: CustomObjectDef, field: CustomObjectFieldDef) {
    const ok = await askConfirm({
      title: t("settings.deleteFieldTitle", { label: field.label }),
      body: t("settings.deleteFieldBody"),
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/custom-objects/${obj.id}/fields/${field.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedDeleteField"));
    }
    load();
  }

  function openEdit(obj: CustomObjectDef, field: CustomObjectFieldDef) {
    setAddingFieldTo(null);
    setError(null);
    setEditingField({ obj, field });
    setEditLabel(field.label);
    setEditType(field.type);
    setEditOptions((field.options ?? []).join(", "));
    setEditRequired(field.required === 1);
  }

  async function saveField(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingField) return;
    setError(null);
    const { obj, field } = editingField;
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
    if (label !== field.label) body.label = label;
    if (type !== field.type) body.type = type;
    if (required !== (field.required === 1)) body.required = required;
    if (type === "select" && !sameOptions(options, field.options ?? [])) body.options = options;
    if (Object.keys(body).length === 0) {
      setEditingField(null);
      return;
    }
    const res = await fetch(`/api/custom-objects/${obj.id}/fields/${field.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setEditingField(null);
      load();
    } else {
      setError(formatCustomObjectError((await res.json().catch(() => ({}))).error, t, "settings.failedSaveField"));
    }
  }

  return (
    <Card size="flush" className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t("settings.customObjects")}</h2>
          <p className="text-sm text-ink-muted">{t("settings.customObjectsHint")}</p>
        </div>
        <Button
          onClick={() => {
            setEditingField(null);
            resetNewObject();
            setShowNew(true);
          }}
        >
          <IconPlus width={15} height={15} /> {t("settings.newObject")}
        </Button>
      </div>
      {error && addingFieldTo === null && editingField === null && !showNew && (
        <p className="mb-3 text-sm text-feedback-error">{error}</p>
      )}
      {failed ? (
        <LoadError
          onRetry={() => {
            setObjects(null);
            void load();
          }}
        />
      ) : !objects ? (
        <Spinner />
      ) : objects.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t("settings.customObjectsEmpty")}</p>
      ) : (
        <div className="divide-y divide-line/60">
          {objects.map((obj) => {
            const fields = fieldsById[obj.id] ?? [];
            return (
              <div
                key={obj.id}
                data-testid="custom-object"
                data-api-name={obj.apiName}
                className="py-2.5"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium">{obj.namePlural}</p>
                    <p className="text-xs text-ink-muted">
                      {obj.apiName}
                      {fields.length > 0 &&
                        ` · ${t(fields.length === 1 ? "settings.fieldCount" : "settings.fieldCountPlural", { count: fields.length })}`}
                      {obj.description ? ` · ${obj.description}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/objects/${obj.apiName}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
                  >
                    {t("settings.openObject")}
                  </Link>
                  <Button onClick={() => { setError(null); setEditingField(null); setFieldType("text"); setAddingFieldTo(obj); }} variant="outline" size="sm" className="text-xs">
                    {t("settings.addField")}
                  </Button>
                  <Button
                    onClick={() => removeObject(obj)}
                    aria-label={t("record.deleteAria", { name: obj.namePlural })}
                    variant="outline"
                    size="icon-sm"
                    className="text-feedback-error"
                  >
                    <IconTrash width={14} height={14} />
                  </Button>
                </div>
                {fieldsFailed[obj.id] ? (
                  <LoadError compact onRetry={() => void load()} />
                ) : fields.length > 0 ? (
                  <ul className="mt-2 space-y-1 pl-1">
                    {fields.map((field) => (
                      <li key={field.id} className="flex items-center gap-2 text-xs text-ink-muted">
                        <span className="flex-1">
                          {field.label} · {field.key} · {fieldTypeLabel(field.type, t)}
                          {field.required ? t("settings.requiredSuffix") : ""}
                          {field.type === "select" && field.options.length > 0 && ` (${field.options.join(", ")})`}
                        </span>
                        <Button
                          onClick={() => openEdit(obj, field)}
                          aria-label={t("settings.editFieldAria", { label: field.label })}
                          variant="outline"
                          size="icon-sm"
                        >
                          <IconEdit width={12} height={12} />
                        </Button>
                        <Button
                          onClick={() => removeField(obj, field)}
                          aria-label={t("settings.deleteFieldAria", { label: field.label })}
                          variant="outline"
                          size="icon-sm"
                          className="text-feedback-error"
                        >
                          <IconTrash width={12} height={12} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title={t("settings.newObjectModal")}
        open={showNew}
        onClose={() => {
          setShowNew(false);
          resetNewObject();
        }}
      >
        <form onSubmit={createObject} className="space-y-4">
          <Field label={t("settings.objectSingular")}>
            <Input
              name="nameSingular"
              required
              placeholder={t("settings.objectSingularPlaceholder")}
              value={singular}
              onChange={(e) => {
                const next = e.target.value;
                setSingular(next);
                if (!apiNameTouched) setApiName(slugifyApiName(next));
                if (!pluralTouched) setPlural(guessPlural(next));
              }}
            />
          </Field>
          <Field label={t("settings.objectPlural")}>
            <Input
              name="namePlural"
              required
              placeholder={t("settings.objectPluralPlaceholder")}
              value={plural}
              onChange={(e) => {
                setPluralTouched(true);
                setPlural(e.target.value);
              }}
            />
          </Field>
          <Field label={t("settings.objectApiName")}>
            <Input
              name="apiName"
              required
              placeholder={t("settings.objectApiNamePlaceholder")}
              pattern="[a-z][a-z0-9_]*"
              value={apiName}
              onChange={(e) => {
                setApiNameTouched(true);
                setApiName(e.target.value);
              }}
            />
          </Field>
          <Field label={t("settings.objectDescription")}>
            <Input name="description" placeholder={t("settings.objectDescriptionPlaceholder")} />
          </Field>
          {error && showNew && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">{t("settings.createObject")}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={addingFieldTo ? t("settings.newObjectField", { name: addingFieldTo.nameSingular }) : t("settings.newField")}
        open={addingFieldTo !== null}
        onClose={() => {
          setAddingFieldTo(null);
          setFieldType("text");
          setError(null);
        }}
      >
        <form onSubmit={createField} className="space-y-4">
          <Field label={t("settings.fieldLabel")}>
            <Input name="label" required placeholder={t("settings.objectFieldLabelPlaceholder")} />
          </Field>
          <Field label={t("settings.fieldKey")}>
            <Input name="key" placeholder={t("settings.objectFieldKeyPlaceholder")} pattern="[a-z][a-z0-9_]*" />
          </Field>
          <Field label={t("settings.fieldType")}>
            <NativeSelect name="type" value={fieldType} onChange={(e) => setFieldType(e.target.value)} className="w-full">
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {fieldTypeLabel(ft, t)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {fieldType === "select" && (
            <Field label={t("settings.fieldOptions")}>
              <Input name="options" placeholder={t("settings.objectFieldOptionsPlaceholder")} />
            </Field>
          )}
          <Field label={t("settings.fieldRequired")}>
            <input type="checkbox" name="required" className="h-4 w-4 accent-indigo-600" />
          </Field>
          {error && addingFieldTo && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">{t("settings.createField")}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        title={
          editingField
            ? t("settings.editObjectField", { name: editingField.obj.nameSingular })
            : t("settings.saveField")
        }
        open={editingField !== null}
        onClose={() => {
          setEditingField(null);
          setError(null);
        }}
      >
        <form onSubmit={saveField} className="space-y-4">
          <Field label={t("settings.fieldLabel")}>
            <Input
              name="label"
              required
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
            />
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
                placeholder={t("settings.objectFieldOptionsPlaceholder")}
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
          {error && editingField && <p className="text-sm text-feedback-error">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit">{t("settings.saveField")}</Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </Card>
  );
}

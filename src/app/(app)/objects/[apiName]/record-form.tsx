"use client";

import { useState } from "react";
import type { CustomObjectFieldDef, CustomRecord } from "@/lib/types";
import { Field } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { fromDateInputValue, toDateInputValue } from "@/lib/format";
import { useT } from "@/lib/i18n/provider";

function toFormValues(
  fields: CustomObjectFieldDef[],
  data: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = data[f.key];
    if (f.type === "date") {
      values[f.key] = typeof raw === "number" ? toDateInputValue(raw) : (raw ?? "");
    } else if (f.type === "checkbox") {
      values[f.key] = raw === true || raw === 1 || raw === "true";
    } else {
      values[f.key] = raw ?? "";
    }
  }
  return values;
}

function fromFormValues(
  fields: CustomObjectFieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (f.type === "checkbox") {
      data[f.key] = raw === true;
      continue;
    }
    if (f.type === "date") {
      const n = fromDateInputValue(String(raw ?? ""));
      if (n != null) data[f.key] = n;
      continue;
    }
    if (f.type === "number") {
      if (raw === "" || raw == null) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) data[f.key] = n;
      continue;
    }
    if (raw !== "" && raw != null) data[f.key] = raw;
  }
  return data;
}

export function RecordForm({
  apiName,
  fields,
  record,
  onSaved,
}: {
  apiName: string;
  fields: CustomObjectFieldDef[];
  record?: CustomRecord;
  onSaved: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    toFormValues(fields, record?.data ?? {}),
  );

  function set(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(record ? `/api/objects/${apiName}/${record.id}` : `/api/objects/${apiName}`, {
      method: record ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: fromFormValues(fields, values) }),
    });
    if (res.ok) onSaved();
    else {
      setError((await res.json().catch(() => ({}))).error ?? t("form.failedSave"));
      setBusy(false);
    }
  }

  if (fields.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        {t("page.objects.noFields")}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {fields.map((def) => (
        <Field key={def.id} label={def.required ? `${def.label} *` : def.label}>
          {def.type === "select" ? (
            <NativeSelect
              value={String(values[def.key] ?? "")}
              onChange={(e) => set(def.key, e.target.value)}
              required={Boolean(def.required)}
              className="w-full"
            >
              <option value="">—</option>
              {def.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          ) : def.type === "checkbox" ? (
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={values[def.key] === true}
              onChange={(e) => set(def.key, e.target.checked)}
            />
          ) : (
            <Input
              type={def.type === "number" ? "number" : def.type === "date" ? "date" : def.type === "url" ? "url" : "text"}
              value={String(values[def.key] ?? "")}
              onChange={(e) => set(def.key, e.target.value)}
              required={Boolean(def.required)}
            />
          )}
        </Field>
      ))}
      {error && <p className="text-sm text-feedback-error">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {record ? t("action.save") : t("page.objects.create")}
        </Button>
      </div>
    </form>
  );
}

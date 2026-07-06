"use client";

import { useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { Field } from "./ui";

export function useCustomFields(entity: "contact" | "company" | "deal") {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  useEffect(() => {
    fetch(`/api/custom-fields?entity=${entity}`)
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d) => setDefs(d.fields ?? []));
  }, [entity]);
  return defs;
}

export function CustomFieldsInputs({
  defs,
  values,
  onChange,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  if (defs.length === 0) return null;

  function set(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      {defs.map((def) => (
        <Field key={def.id} label={def.label}>
          {def.type === "select" ? (
            <select
              className="input"
              value={String(values[def.key] ?? "")}
              onChange={(e) => set(def.key, e.target.value || null)}
            >
              <option value="">—</option>
              {def.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : def.type === "checkbox" ? (
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={values[def.key] === true}
              onChange={(e) => set(def.key, e.target.checked)}
            />
          ) : (
            <input
              className="input"
              type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
              value={String(values[def.key] ?? "")}
              onChange={(e) =>
                set(
                  def.key,
                  def.type === "number"
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value || null,
                )
              }
            />
          )}
        </Field>
      ))}
    </>
  );
}

/** Read-only display of custom values on detail pages. */
export function CustomFieldsDisplay({
  defs,
  values,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
}) {
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((def) => {
        const v = values[def.key];
        return (
          <div key={def.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {def.label}
            </p>
            <p className="mt-0.5 text-sm">
              {v === null || v === undefined || v === ""
                ? "—"
                : def.type === "checkbox"
                  ? v
                    ? "Yes"
                    : "No"
                  : String(v)}
            </p>
          </div>
        );
      })}
    </>
  );
}

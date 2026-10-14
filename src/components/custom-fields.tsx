"use client";

import { useCallback, useEffect, useState } from "react";
import type { CustomFieldDef } from "@/lib/types";
import { Field, LoadError } from "./ui";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";

export function useCustomFields(entity: "contact" | "company" | "deal") {
  const [defs, setDefs] = useState<CustomFieldDef[]>([]);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const reload = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/custom-fields?entity=${entity}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!cancelled) setDefs(Array.isArray(d.fields) ? d.fields : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, retry]);

  return { defs, failed, retry: reload };
}

export function CustomFieldsInputs({
  defs,
  values,
  onChange,
  failed,
  onRetry,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  failed?: boolean;
  onRetry?: () => void;
}) {
  if (failed && onRetry) return <LoadError compact onRetry={onRetry} />;
  if (defs.length === 0) return null;

  function set(key: string, value: unknown) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      {defs.map((def) => (
        <Field key={def.id} label={def.label}>
          {def.type === "select" ? (
            <NativeSelect
              value={String(values[def.key] ?? "")}
              onChange={(e) => set(def.key, e.target.value || null)}
              className="w-full"
            >
              <option value="">—</option>
              {def.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </NativeSelect>
          ) : def.type === "multiselect" ? (
            <div role="group" aria-label={def.label} className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
              {def.options.map((o) => {
                const chosen = choicesOf(values[def.key]);
                return (
                  <label key={o} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-indigo-600"
                      checked={chosen.includes(o)}
                      onChange={(e) => set(def.key, e.target.checked ? [...chosen, o] : chosen.filter((c) => c !== o))}
                    />
                    {o}
                  </label>
                );
              })}
            </div>
          ) : def.type === "checkbox" ? (
            <input
              type="checkbox"
              className="h-4 w-4 accent-indigo-600"
              checked={values[def.key] === true}
              onChange={(e) => set(def.key, e.target.checked)}
            />
          ) : (
            <Input
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

/** The choices a tags value holds; a single choice may be stored as text. */
function choicesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" && value ? [value] : [];
}

/** Read-only display of custom values on detail pages. */
export function CustomFieldsDisplay({
  defs,
  values,
  failed,
  onRetry,
}: {
  defs: CustomFieldDef[];
  values: Record<string, unknown>;
  failed?: boolean;
  onRetry?: () => void;
}) {
  if (failed && onRetry) return <LoadError compact onRetry={onRetry} />;
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
              {v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
                ? "—"
                : Array.isArray(v)
                  ? v.join(", ")
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

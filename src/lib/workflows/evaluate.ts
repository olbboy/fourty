import type { WorkflowCondition } from "./types";

/**
 * Pure condition evaluation — the testable heart of the workflow engine.
 * Templates like "{{name}}" in action params resolve from the snapshot.
 */

export function evaluateCondition(
  cond: WorkflowCondition,
  snapshot: Record<string, unknown>,
): boolean {
  const raw = snapshot[cond.field];
  switch (cond.op) {
    case "is_empty":
      return raw === null || raw === undefined || raw === "";
    case "not_empty":
      return !(raw === null || raw === undefined || raw === "");
    case "eq":
      return looseEquals(raw, cond.value);
    case "neq":
      return !looseEquals(raw, cond.value);
    case "contains":
      return String(raw ?? "").toLowerCase().includes(String(cond.value ?? "").toLowerCase());
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = Number(raw);
      const b = Number(cond.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (cond.op === "gt") return a > b;
      if (cond.op === "gte") return a >= b;
      if (cond.op === "lt") return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === (b === true || b === "true" || b === 1);
  }
  return String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
}

export function evaluateConditions(
  conditions: WorkflowCondition[],
  snapshot: Record<string, unknown>,
): boolean {
  return conditions.every((c) => evaluateCondition(c, snapshot));
}

/** Resolve "{{field}}" placeholders against the entity snapshot. */
export function renderTemplate(template: string, snapshot: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const val = snapshot[key];
    return val === null || val === undefined ? "" : String(val);
  });
}

export type WorkflowEvent =
  | "contact.created"
  | "contact.updated"
  | "company.created"
  | "deal.created"
  | "deal.stage_changed"
  | "deal.won"
  | "deal.lost"
  | "task.completed";

export type ConditionOp =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_empty"
  | "not_empty";

export type WorkflowCondition = {
  field: string;
  op: ConditionOp;
  value?: string | number | boolean | null;
};

export type WorkflowAction =
  | { type: "create_task"; title: string; priority?: string; dueInDays?: number }
  | { type: "add_note"; body: string }
  | { type: "update_field"; field: string; value: string | number | boolean | null }
  | { type: "webhook"; url: string }
  | { type: "log"; message: string }
  // Optional generative draft (ADR-015, Tier 3). `prompt` supports {{templates}}.
  // The result is written as a DRAFT note by the ai.generate worker; no-op when
  // AI is disabled. Off by default — see src/lib/ai.
  | { type: "ai_draft"; prompt: string };

export type WorkflowTrigger = { event: WorkflowEvent };

export type WorkflowDef = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
};

/** Snapshot of the entity that fired the event, flattened for condition checks. */
export type EventContext = {
  event: WorkflowEvent;
  entityType: "contact" | "company" | "deal" | "task";
  entityId: string;
  snapshot: Record<string, unknown>;
};

export const EVENT_LABELS: Record<WorkflowEvent, string> = {
  "contact.created": "Contact created",
  "contact.updated": "Contact updated",
  "company.created": "Company created",
  "deal.created": "Deal created",
  "deal.stage_changed": "Deal stage changed",
  "deal.won": "Deal won",
  "deal.lost": "Deal lost",
  "task.completed": "Task completed",
};

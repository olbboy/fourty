import type { MessageKey } from "@/lib/i18n";
import type { WorkflowEvent } from "@/lib/workflows/types";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export const EVENT_KEYS: Record<WorkflowEvent, MessageKey> = {
  "contact.created": "event.contact.created",
  "contact.updated": "event.contact.updated",
  "company.created": "event.company.created",
  "deal.created": "event.deal.created",
  "deal.stage_changed": "event.deal.stage_changed",
  "deal.won": "event.deal.won",
  "deal.lost": "event.deal.lost",
  "task.completed": "event.task.completed",
};

export const WORKFLOW_EVENTS = Object.keys(EVENT_KEYS) as WorkflowEvent[];

const FIELD_KEYS: Record<string, MessageKey> = {
  status: "field.status",
  source: "field.source",
  score: "field.score",
  email: "field.email",
  jobTitle: "field.jobTitle",
  city: "field.city",
  country: "field.country",
  firstName: "field.firstName",
  lastName: "field.lastName",
  name: "field.name",
  industry: "field.industry",
  size: "field.size",
  annualRevenue: "field.annualRevenue",
  amount: "field.amount",
  currency: "field.currency",
  stageName: "field.stage",
  title: "field.title",
  priority: "field.priority",
};

/** Workflow condition/update field is a stable API token; map it at display time. */
export function workflowFieldLabel(field: string, t: Translate): string {
  const key = FIELD_KEYS[field];
  return key ? t(key) : field;
}

/** Trigger event is a stable API token; map it at display time. */
export function workflowEventLabel(event: string, t: Translate): string {
  const key = EVENT_KEYS[event as WorkflowEvent];
  return key ? t(key) : event;
}

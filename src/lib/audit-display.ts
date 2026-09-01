import type { MessageKey } from "@/lib/i18n";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const OBJECT_KEYS: Record<string, MessageKey> = {
  contact: "audit.object.contact",
  company: "audit.object.company",
  deal: "audit.object.deal",
  task: "audit.object.task",
  note: "audit.object.note",
  record: "audit.object.record",
  user: "audit.object.user",
  api_key: "audit.object.api_key",
  webhook_secret: "audit.object.webhook_secret",
  field_permission: "audit.object.field_permission",
  workflow: "audit.object.workflow",
  custom_object: "audit.object.custom_object",
  custom_object_field: "audit.object.custom_object_field",
  custom_field: "audit.object.custom_field",
  saved_view: "audit.object.saved_view",
  sso_connection: "audit.object.sso_connection",
  sync_account: "audit.object.sync_account",
  settings: "nav.settings",
};

const CRUD_KEYS: Record<string, MessageKey> = {
  created: "audit.verb.created",
  updated: "audit.verb.updated",
  deleted: "audit.verb.deleted",
};

const ACTION_KEYS: Record<string, MessageKey> = {
  "contacts.imported": "audit.action.contacts.imported",
  "webhook_secret.rotated": "audit.action.webhook_secret.rotated",
  "field_permission.cleared": "audit.action.field_permission.cleared",
  "field_permission.set": "audit.action.field_permission.set",
  "member.invited": "audit.action.member.invited",
  "member.role_changed": "audit.action.member.role_changed",
  "member.removed": "audit.action.member.removed",
  "member.joined": "audit.action.member.joined",
  "fact.proposed": "audit.action.fact.proposed",
  "fact.applied": "audit.action.fact.applied",
  "fact.dismissed": "audit.action.fact.dismissed",
  "fact.accepted": "audit.action.fact.accepted",
  "fact.reverted": "audit.action.fact.reverted",
  "activity.logged": "audit.action.activity.logged",
  "api_key.revoked": "audit.action.api_key.revoked",
  "sync_account.connected": "audit.action.sync_account.connected",
  "sync_account.ran": "audit.action.sync_account.ran",
  "sync_account.ingested": "audit.action.sync_account.ingested",
};

/** Null actorId is a system write (worker, research pass), not a person. */
export function auditActorLabel(
  actorId: string | null,
  actors: Record<string, string>,
  t: Translate,
): string {
  if (!actorId) return t("settings.auditSystem");
  return actors[actorId] ?? actorId;
}

/**
 * `meta.via` is a stable English machine token (mcp, ai, csv-import…).
 * Translate the “via” chrome; leave unknown tokens as written.
 */
export function formatAuditVia(via: string, t: Translate): string {
  return t("settings.auditVia", { via });
}

/** Object type is a stable API token; map known ones at display time. */
export function auditObjectLabel(objectType: string, t: Translate): string {
  const key = OBJECT_KEYS[objectType];
  return key ? t(key) : objectType;
}

/** Action is a stable API token (`contact.created`); map it at display time. */
export function auditActionLabel(action: string, t: Translate): string {
  const special = ACTION_KEYS[action];
  if (special) return t(special);
  const dot = action.lastIndexOf(".");
  if (dot < 0) return action;
  const verb = CRUD_KEYS[action.slice(dot + 1)];
  if (!verb) return action;
  return t(verb, { object: auditObjectLabel(action.slice(0, dot), t) });
}

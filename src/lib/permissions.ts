/**
 * RBAC permission matrix (Gate B3, ADR-005). Three workspace roles:
 *   - admin  — full control, including workspace administration
 *   - member — read + write CRM objects; no administration
 *   - viewer — read-only CRM objects
 *
 * The role comes from `workspace_members` (session) or the API key's `role`.
 * `can()` is a pure function so it's trivially testable and the single source of
 * truth for `authorize()` in src/lib/api.ts.
 */

export type Role = "admin" | "member" | "viewer";
export type Action = "read" | "create" | "update" | "delete";

// CRM objects: members read+write, viewers read-only. Names match the API route
// segment (e.g. /api/contacts → "contacts").
export const CRM_OBJECTS = [
  "contacts",
  "companies",
  "deals",
  "tasks",
  "notes",
  "activities",
  "workflows",
  "custom-fields",
  "custom-objects",
  "objects",
  "sync",
  "saved-views",
  "pipelines",
  "stages",
  "import",
  "export",
] as const;

// Administration objects: admin-only for every action (incl. read).
export const ADMIN_OBJECTS = ["members", "api-keys", "settings", "audit", "field-permissions"] as const;

export type CrmObject = (typeof CRM_OBJECTS)[number];
export type AdminObject = (typeof ADMIN_OBJECTS)[number];
export type PermObject = CrmObject | AdminObject;

const CRM_SET: ReadonlySet<string> = new Set(CRM_OBJECTS);

/** Can `role` perform `action` on `object`? Unknown objects default to deny. */
export function can(role: string, object: string, action: Action): boolean {
  if (role === "admin") return true;
  if (!CRM_SET.has(object)) return false; // administration objects: admin only
  if (role === "member") return true; // full read+write on CRM objects
  if (role === "viewer") return action === "read";
  return false;
}

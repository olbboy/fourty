import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";
import { getAssignee } from "@/lib/actions/assignees";

/**
 * Where leads go (Q107), stored as one JSON value in `settings`. The Default
 * lead owner receives a contact an API key makes without naming an owner.
 */
export type LeadSettings = { defaultOwnerId: string | null };

const SETTINGS_KEY = "leads";
const DEFAULT_LEADS: LeadSettings = { defaultOwnerId: null };

export const leadSettingsPatch = z.object({ defaultOwnerId: z.string().min(1).max(64).nullable() });

export async function loadLeadSettings(): Promise<LeadSettings> {
  const row = (await db.select({ value: tables.settings.value }).from(tables.settings).where(eq(tables.settings.key, SETTINGS_KEY)).limit(1))[0];
  if (!row) return DEFAULT_LEADS;
  try {
    return { ...DEFAULT_LEADS, ...(JSON.parse(row.value) as Partial<LeadSettings>) };
  } catch {
    return DEFAULT_LEADS;
  }
}

/** Save; an owner who is not an active member of the workspace is refused. */
export async function saveLeadSettings(patch: LeadSettings): Promise<{ ok: true; settings: LeadSettings } | { ok: false; error: string }> {
  if (patch.defaultOwnerId && !(await getAssignee(patch.defaultOwnerId))) return { ok: false, error: "defaultOwnerId: not a workspace member" };
  const value = JSON.stringify(patch);
  await db
    .insert(tables.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: [tables.settings.workspaceId, tables.settings.key], set: { value } });
  return { ok: true, settings: patch };
}

/** The Default lead owner while they are still an active member; null otherwise, so a lead is never refused for it. */
export async function defaultLeadOwner(): Promise<string | null> {
  const { defaultOwnerId } = await loadLeadSettings();
  return defaultOwnerId && (await getAssignee(defaultOwnerId)) ? defaultOwnerId : null;
}

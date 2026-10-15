import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, tables } from "@/db";

/**
 * Where leads go (Q107, Q114), stored as one JSON value in `settings`. The
 * Default lead owner receives a contact, company, deal or task an API key makes
 * without naming an owner (applied in resolveOwner).
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

/** Save. The route checks the owner is an active member first. */
export async function saveLeadSettings(patch: LeadSettings): Promise<LeadSettings> {
  const value = JSON.stringify(patch);
  await db
    .insert(tables.settings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: [tables.settings.workspaceId, tables.settings.key], set: { value } });
  return patch;
}

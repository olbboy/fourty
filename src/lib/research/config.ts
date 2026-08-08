import { eq } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * The keyless research kill switch (plan Decision 4).
 *
 * Research is **on by default once a mailbox is connected**, and independent of
 * `AI_PROVIDER` — the parsing pass needs no model, so gating it behind an AI
 * setting would hide the one feature that works on a fresh install with no keys.
 * Connecting a mailbox is the consent to process that mail inside the tenant;
 * this switch is how a workspace withdraws it.
 *
 * Off means the pass stops reading, not that it forgets: rows already written
 * stay, with their evidence, and a rep can still revert them.
 */

export const KEYLESS_RESEARCH_KEY = "research.keyless";

/** Anything but an explicit off is on — a missing row is a fresh install. */
export async function isKeylessResearchEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ value: tables.settings.value })
    .from(tables.settings)
    .where(eq(tables.settings.key, KEYLESS_RESEARCH_KEY))
    .limit(1);
  if (!row) return true;
  const value = row.value.trim().toLowerCase();
  return !(value === "off" || value === "false" || value === "0");
}

/** Persist the switch. Runs inside the caller's `withWorkspace()` transaction. */
export async function setKeylessResearch(enabled: boolean): Promise<void> {
  await db
    .insert(tables.settings)
    .values({ key: KEYLESS_RESEARCH_KEY, value: enabled ? "on" : "off" })
    .onConflictDoUpdate({
      target: [tables.settings.workspaceId, tables.settings.key],
      set: { value: enabled ? "on" : "off" },
    });
}

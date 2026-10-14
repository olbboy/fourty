import { eq } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Disconnect a mailbox or calendar feed. Ingested mail and events carry an
 * account_id with no foreign key behind it (the ingest tables are written,
 * never read back), so nothing at the database level would clear them, and
 * their dedup index is keyed by account: drop them with the account. Contact
 * timeline activities are keyed to the contact and are left alone.
 */
export async function disconnectSyncAccount(id: string): Promise<void> {
  await db.delete(tables.emailMessages).where(eq(tables.emailMessages.accountId, id));
  await db.delete(tables.calendarEvents).where(eq(tables.calendarEvents.accountId, id));
  await db.delete(tables.syncAccounts).where(eq(tables.syncAccounts.id, id));
}

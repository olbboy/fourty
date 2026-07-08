import { eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { parseEmail } from "./parse-email";
import { parseIcs } from "./parse-ics";

/**
 * Sync ingestion engine (Gate C6). Turns raw messages/calendars into linked,
 * deduped rows. Must run inside a withWorkspace() transaction so RLS scopes every
 * read/write. Dedup is enforced by the unique (workspace, account, provider-id)
 * index via ON CONFLICT DO NOTHING — re-ingesting the same Message-ID/UID is a
 * no-op, so this is safe to run repeatedly (at-least-once friendly).
 */

export type IngestResult = { ingested: number; linked: number; duplicates: number };

/** First contact in the active workspace whose email matches any of `emails` (case-insensitive). */
export async function matchContact(emails: string[]): Promise<string | null> {
  const clean = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (clean.length === 0) return null;
  const conds: SQL[] = clean.map((e) => ilike(tables.contacts.email, e));
  const row = (
    await db
      .select({ id: tables.contacts.id })
      .from(tables.contacts)
      .where(or(...conds))
      .limit(1)
  )[0];
  return row?.id ?? null;
}

async function touchContact(contactId: string, at: number | null): Promise<void> {
  await db
    .update(tables.contacts)
    .set({ lastActivityAt: sql`GREATEST(COALESCE(${tables.contacts.lastActivityAt}, 0), ${at ?? Date.now()})` })
    .where(eq(tables.contacts.id, contactId));
}

export async function ingestEmails(accountId: string, rawMessages: string[]): Promise<IngestResult> {
  const result: IngestResult = { ingested: 0, linked: 0, duplicates: 0 };
  for (const raw of rawMessages) {
    const msg = parseEmail(raw);
    if (!msg.messageId) continue; // can't dedupe without an id — skip
    const contactId = await matchContact(msg.participants);
    const inserted = await db
      .insert(tables.emailMessages)
      .values({
        id: newId(),
        accountId,
        messageId: msg.messageId,
        fromAddr: msg.from,
        toAddrs: JSON.stringify(msg.to),
        subject: msg.subject,
        snippet: msg.snippet,
        contactId,
        sentAt: msg.sentAt,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ id: tables.emailMessages.id });
    if (inserted.length === 0) {
      result.duplicates += 1;
      continue;
    }
    result.ingested += 1;
    if (contactId) {
      result.linked += 1;
      await logActivity({
        type: "email",
        entityType: "contact",
        entityId: contactId,
        meta: { subject: msg.subject, from: msg.from, messageId: msg.messageId },
      });
      await touchContact(contactId, msg.sentAt);
    }
  }
  return result;
}

export async function ingestCalendar(accountId: string, rawIcs: string): Promise<IngestResult> {
  const result: IngestResult = { ingested: 0, linked: 0, duplicates: 0 };
  for (const ev of parseIcs(rawIcs)) {
    const contactId = await matchContact(ev.attendees);
    const inserted = await db
      .insert(tables.calendarEvents)
      .values({
        id: newId(),
        accountId,
        uid: ev.uid,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        attendees: JSON.stringify(ev.attendees),
        contactId,
        startAt: ev.startAt,
        endAt: ev.endAt,
        createdAt: Date.now(),
      })
      .onConflictDoNothing()
      .returning({ id: tables.calendarEvents.id });
    if (inserted.length === 0) {
      result.duplicates += 1;
      continue;
    }
    result.ingested += 1;
    if (contactId) {
      result.linked += 1;
      await logActivity({
        type: "meeting",
        entityType: "contact",
        entityId: contactId,
        meta: { title: ev.title, uid: ev.uid, startAt: ev.startAt },
      });
      await touchContact(contactId, ev.startAt);
    }
  }
  return result;
}

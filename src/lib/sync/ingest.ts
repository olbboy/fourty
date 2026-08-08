import { eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, tables } from "@/db";
import { newId } from "@/lib/id";
import { logActivity } from "@/lib/activity";
import { TASK_KINDS } from "@/lib/agent-tasks/kinds";
import { openTask, scheduleTask } from "@/lib/agent-tasks/schedule";
import { isKeylessResearchEnabled } from "@/lib/research/config";
import { extractSignature } from "@/lib/research/signature";
import { parseEmail, threadIdOf } from "./parse-email";
import { parseIcs } from "./parse-ics";

/**
 * Sync ingestion engine (Gate C6). Turns raw messages/calendars into linked,
 * deduped rows. Must run inside a withWorkspace() transaction so RLS scopes every
 * read/write. Dedup is enforced by the unique (workspace, account, provider-id)
 * index via ON CONFLICT DO NOTHING — re-ingesting the same Message-ID/UID is a
 * no-op, so this is safe to run repeatedly (at-least-once friendly).
 *
 * Phase 3 adds one responsibility: **extract-at-ingest**. A signature block sits
 * at the end of a body, and Fourty stores no bodies — so the extraction happens
 * here, while the text is still in memory, and only its structured result is
 * persisted. Turning that result into facts is a separate `contact.evidence`
 * task rather than an inline `recordFact()` call: re-runs stay idempotent, the
 * extraction is debuggable after the fact, and this transaction stays short.
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
  const touched = new Set<string>();
  // Read once for the batch, and read *before* extracting: the switch is
  // documented as stopping the reading, so it has to gate the extraction and
  // not merely the facts derived from it. Off means the four signature columns
  // are never written at all.
  const research = await isKeylessResearchEnabled();
  for (const raw of rawMessages) {
    const msg = parseEmail(raw);
    if (!msg.messageId) continue; // can't dedupe without an id — skip
    const contactId = await matchContact(msg.participants);
    // The body is read here and never written: only what the extractor found,
    // plus the 280-char snippet, survives this function.
    const signature = research
      ? extractSignature(msg.body, { address: msg.from, displayName: msg.fromName })
      : null;
    const inserted = await db
      .insert(tables.emailMessages)
      .values({
        id: newId(),
        accountId,
        messageId: msg.messageId,
        threadId: threadIdOf(msg),
        fromAddr: msg.from,
        toAddrs: JSON.stringify(msg.to),
        subject: msg.subject,
        snippet: msg.snippet,
        signatureTitle: signature?.title ?? null,
        signatureEmployer: signature?.employer ?? null,
        signaturePhone: signature?.phone ?? null,
        signatureRaw: signature?.raw ?? null,
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
      touched.add(contactId);
      await logActivity({
        type: "email",
        entityType: "contact",
        entityId: contactId,
        meta: { subject: msg.subject, from: msg.from, messageId: msg.messageId },
      });
      await touchContact(contactId, msg.sentAt);
    }
  }
  if (research) await bookEvidence(touched);
  return result;
}

export async function ingestCalendar(accountId: string, rawIcs: string): Promise<IngestResult> {
  const result: IngestResult = { ingested: 0, linked: 0, duplicates: 0 };
  const touched = new Set<string>();
  const research = await isKeylessResearchEnabled();
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
      touched.add(contactId);
      await logActivity({
        type: "meeting",
        entityType: "contact",
        entityId: contactId,
        meta: { title: ev.title, uid: ev.uid, startAt: ev.startAt },
      });
      await touchContact(contactId, ev.startAt);
    }
  }
  if (research) await bookEvidence(touched);
  return result;
}

/**
 * Book a research pass for each contact this sync actually said something new
 * about. Only for freshly inserted rows: a re-pull of the same messages is a
 * duplicate, and re-booking on a duplicate would put every mailbox back to work
 * on every sync forever.
 *
 * This only ever *creates* — the same discipline `bookRecurringWork` learned in
 * Phase 2. `scheduleTask` moves an open task's `dueAt`, so re-booking one that
 * is mid-retry would overwrite the backoff `failTask` had just set.
 */
async function bookEvidence(contactIds: Set<string>): Promise<void> {
  for (const contactId of contactIds) {
    if (await openTask("contact.evidence", "contact", contactId)) continue;
    await scheduleTask({
      kind: "contact.evidence",
      entityType: "contact",
      entityId: contactId,
      reason: TASK_KINDS["contact.evidence"].label,
    });
  }
}

import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, tables } from "@/db";

/**
 * Who a message or a meeting is about (Phase 3).
 *
 * **Exact address match only. No fuzzy name matching, ever.** A contact with no
 * email address is not matched at all — a confidently wrong fact about a real
 * person is worse than a blank field, and "A. Marchetti" appears in four
 * mailboxes belonging to four different people.
 *
 * Every read here runs inside the caller's `withWorkspace()` transaction, so RLS
 * scopes it, and field permissions still gate what a *human* is shown; this
 * module only decides which rows are about which contact.
 */

export type ResearchContact = {
  id: string;
  email: string;
  jobTitle: string | null;
  companyId: string | null;
};

export type ResearchMessage = typeof tables.emailMessages.$inferSelect;
export type ResearchMeeting = typeof tables.calendarEvents.$inferSelect;

/** The contact, or null when there is nothing to match on. */
export async function researchContact(contactId: string): Promise<ResearchContact | null> {
  const [row] = await db
    .select({
      id: tables.contacts.id,
      email: tables.contacts.email,
      jobTitle: tables.contacts.jobTitle,
      companyId: tables.contacts.companyId,
    })
    .from(tables.contacts)
    .where(eq(tables.contacts.id, contactId))
    .limit(1);
  if (!row) return null;
  const email = row.email?.trim().toLowerCase();
  if (!email) return null;
  return { id: row.id, email, jobTitle: row.jobTitle, companyId: row.companyId };
}

/** Messages this address actually sent, newest first. Never messages *to* them. */
export async function messagesFrom(email: string, limit: number): Promise<ResearchMessage[]> {
  return db
    .select()
    .from(tables.emailMessages)
    .where(sql`lower(${tables.emailMessages.fromAddr}) = ${email}`)
    .orderBy(desc(tables.emailMessages.sentAt))
    .limit(limit);
}

/**
 * How many messages we hold on each of these threads. A reply is only evidence
 * when we hold the thread it replies to — otherwise it is a first contact that
 * happens to carry a References header.
 */
export async function threadSizes(threadIds: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(threadIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ threadId: tables.emailMessages.threadId, count: sql<number>`count(*)::int` })
    .from(tables.emailMessages)
    .where(inArray(tables.emailMessages.threadId, unique))
    .groupBy(tables.emailMessages.threadId);
  return new Map(rows.map((r) => [r.threadId!, Number(r.count)]));
}

/**
 * Meetings this address was an attendee on that have already happened, newest
 * first. A future invite is not attendance, and Fourty's ICS reader does not
 * parse PARTSTAT — so what is observed is "listed as an attendee on a meeting
 * that has since taken place", and the rationale says exactly that rather than
 * claiming they accepted.
 *
 * The SQL narrows with a LIKE against the stored JSON array; membership is then
 * confirmed in JS against the parsed array, so a substring can never pass for an
 * address (`ada@x.io` must not match `ada@x.io.uk`).
 */
export async function meetingsWith(email: string, limit: number, now: number): Promise<ResearchMeeting[]> {
  const rows = await db
    .select()
    .from(tables.calendarEvents)
    .where(
      and(
        isNotNull(tables.calendarEvents.startAt),
        lte(tables.calendarEvents.startAt, now),
        sql`lower(${tables.calendarEvents.attendees}) like ${"%" + likeEscape(email) + "%"} escape '\\'`,
      ),
    )
    .orderBy(desc(tables.calendarEvents.startAt))
    .limit(limit);
  return rows.filter((row) => attendedBy(row.attendees, email));
}

/**
 * `%` and `_` are legal in an address local-part. The exact check below would
 * catch a widened match anyway; escaping keeps the narrowing query honest about
 * what it is narrowing to.
 */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Exact membership in the stored attendee array — never a substring. */
export function attendedBy(attendeesJson: string, email: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(attendeesJson);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  return parsed.some((a) => typeof a === "string" && a.trim().toLowerCase() === email);
}

/** `ada@fernhill.example` → `fernhill.example`. Null when there is no domain. */
export function domainOfAddress(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

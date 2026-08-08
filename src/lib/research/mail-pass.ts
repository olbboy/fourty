import type { Evidence } from "@/lib/facts/evidence";
import { resolveCompanyValue } from "@/lib/facts/fields";
import { recordFact } from "@/lib/facts/record-fact";
import { isFreeMailDomain } from "./domains";
import { isKeylessResearchEnabled } from "./config";
import {
  domainOfAddress,
  meetingsWith,
  messagesFrom,
  researchContact,
  threadSizes,
  type ResearchMeeting,
  type ResearchMessage,
} from "./identity";

/**
 * The keyless research pass (Phase 3): read this contact's own mail and
 * meetings, turn them into observations, and hand them to the evidence ledger.
 *
 * **Deterministic and keyless.** No model, no network, no vendor — it runs on a
 * fresh install with no API key of any kind, which is the whole claim this phase
 * exists to make true. It is a class-B caller (`via: "research"`), so
 * `recordFact()` may apply a VERIFIED fact to a field no human owns, and may
 * never touch one a human does.
 *
 * Nothing here writes a column itself. Every write goes through `recordFact()`,
 * where the three invariants live.
 */

/** Bounds. A ten-year mailbox must not turn one pass into an hour of work. */
export const MAX_MESSAGES = 50;
export const MAX_MEETINGS = 20;
/**
 * How many observations may back one claim. The score ceiling is 0.99 and the
 * bands are decided by the first two or three, so the rest only make the stored
 * rationale longer than a rep will read.
 */
export const MAX_OBSERVATIONS = 6;

export type EvidencePassResult = {
  messages: number;
  meetings: number;
  applied: number;
  proposed: number;
  /** The line a human reads on the record's background-work panel. */
  outcome: string;
};

export async function runContactEvidencePass(
  contactId: string,
  now = Date.now(),
): Promise<EvidencePassResult> {
  const empty = { messages: 0, meetings: 0, applied: 0, proposed: 0 };
  if (!(await isKeylessResearchEnabled())) {
    return { ...empty, outcome: "keyless research is switched off for this workspace" };
  }

  const contact = await researchContact(contactId);
  if (!contact) {
    // No email address is not a failure to retry: there is nothing to match on,
    // and matching on a name is the one thing this pass will never do.
    return { ...empty, outcome: "no email address on this contact — nothing to match on" };
  }

  const messages = await messagesFrom(contact.email, MAX_MESSAGES);
  const meetings = await meetingsWith(contact.email, MAX_MEETINGS, now);
  if (messages.length === 0 && meetings.length === 0) {
    return { ...empty, outcome: "no mail or meetings from this address yet" };
  }

  const threads = await threadSizes(messages.map((m) => m.threadId ?? ""));
  const corroboration = [
    ...messages.map((m) => threadReply(m, threads)),
    ...meetings.map(meetingAttendance),
  ].filter((e): e is Evidence => e !== null);

  const outcomes: string[] = [];
  let applied = 0;
  let proposed = 0;

  const record = async (field: string, value: string, source: ResearchMessage): Promise<void> => {
    const evidence = backing(source, corroboration, extra(field, source, contact.email));
    const result = await recordFact(
      { entityType: "contact", entityId: contactId, field, value, evidence },
      { userId: null, via: "research" },
    );
    if (!result.ok) return; // dismissed, already applied, or below the floor — all normal
    if (result.applied) {
      applied += 1;
      outcomes.push(`${label(field)} filled in`);
    } else {
      proposed += 1;
      outcomes.push(`${label(field)} proposed`);
    }
  };

  const titleSource = messages.find((m) => (m.signatureTitle ?? "").trim() !== "");
  if (titleSource && titleSource.signatureTitle!.trim() !== (contact.jobTitle ?? "").trim()) {
    await record("job_title", titleSource.signatureTitle!.trim(), titleSource);
  }

  const employerSource = messages.find((m) => (m.signatureEmployer ?? "").trim() !== "");
  if (employerSource) {
    const employer = employerSource.signatureEmployer!.trim();
    // Resolve before recording only to skip the no-op: a signature that names
    // the company the contact is already linked to is not an observation worth
    // a row. `recordFact` resolves it again and owns the decision.
    const resolution = await resolveCompanyValue(employer);
    const alreadyLinked = resolution.resolved && resolution.companyId === contact.companyId;
    if (!alreadyLinked) await record("company_id", employer, employerSource);
  }

  return {
    messages: messages.length,
    meetings: meetings.length,
    applied,
    proposed,
    outcome: summary(messages.length, meetings.length, outcomes),
  };
}

// ── Observations ─────────────────────────────────────────────────────────────

/**
 * The evidence behind one claim: the signature that carried it, then whatever
 * else corroborates that this address is this person.
 *
 * **One observation per source message.** The message that supplied the claim
 * contributes its signature and nothing else — counting the same email twice,
 * once as a signature and again as a reply, is the double-count `evidence.ts`
 * refuses ("two facts on one page are one observation"), and it is what would
 * let a single email auto-apply a job title. A lone signature is 0.80, which is
 * PROBABLE: a suggestion for a rep. It reaches VERIFIED only alongside a second,
 * genuinely independent source — a reply on a thread we hold, or a meeting.
 */
function backing(source: ResearchMessage, corroboration: Evidence[], extras: Evidence[]): Evidence[] {
  const signature: Evidence = {
    kind: "crm.signature-block",
    detail: `their signature${on(source.sentAt)} reads ${quote(source.signatureRaw ?? "")}`,
  };
  const others = corroboration.filter((e) => e.sourceUrl !== messageRef(source));
  return [signature, ...extras, ...others].slice(0, MAX_OBSERVATIONS);
}

/**
 * A reply on a thread we hold. Not "any mail from their address" — we selected
 * these rows *by* that address, so treating it as evidence would be the pass
 * confirming its own query. A reply on a conversation we also hold the other
 * side of is a real, independent observation.
 */
function threadReply(msg: ResearchMessage, threads: Map<string, number>): Evidence | null {
  const thread = msg.threadId;
  if (!thread || thread === msg.messageId) return null; // not a reply to anything
  if ((threads.get(thread) ?? 0) < 2) return null; // we do not hold the thread
  return {
    kind: "crm.thread-reply",
    detail: `they replied on the ${quote(subjectOf(msg))} thread${on(msg.sentAt)}`,
    sourceUrl: messageRef(msg),
  };
}

/**
 * Attendance, described as what was actually observed. Fourty's ICS reader does
 * not parse PARTSTAT, so nobody here knows whether the invite was *accepted* —
 * claiming so in a rationale a rep reads would be a small lie with no upside.
 */
function meetingAttendance(event: ResearchMeeting): Evidence {
  return {
    kind: "crm.meeting-attendance",
    detail: `they were on the attendee list for ${quote(event.title ?? "a meeting")}${on(event.startAt)}`,
    sourceUrl: `fourty:calendar_event/${event.id}`,
  };
}

/**
 * Claim-specific extras. Today that is one thing: an employer whose domain
 * disagrees with the domain the person writes from. A contradiction does not
 * nudge the score down, it holds the claim below the proposal floor entirely —
 * "signature says Acme, mail says Fernhill" is not 60% true, it is unresolved,
 * and the pass must not pick a side.
 */
function extra(field: string, source: ResearchMessage, address: string): Evidence[] {
  if (field !== "company_id") return [];
  const claimed = source.signatureEmployer?.trim().toLowerCase();
  const from = domainOfAddress(address);
  if (!claimed || !from || isFreeMailDomain(from)) return [];
  if (!claimed.includes(".") || sameOrganisation(claimed, from)) return [];
  return [
    {
      kind: "contradiction",
      detail: `their signature says ${claimed}, but they write from ${from}`,
    },
  ];
}

/** `mail.acme.example` and `acme.example` are the same organisation. */
function sameOrganisation(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

// ── Wording ──────────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = { job_title: "Job title", company_id: "Company" };
const label = (field: string): string => LABELS[field] ?? field;

/** A stable reference to a row, so two observations from one message collapse. */
const messageRef = (msg: ResearchMessage): string => `fourty:email_message/${msg.id}`;

function summary(messages: number, meetings: number, outcomes: string[]): string {
  const read = `read ${messages} message(s) and ${meetings} meeting(s)`;
  if (outcomes.length === 0) return `${read} — nothing new to say about this contact`;
  return `${read} — ${outcomes.join(", ")}`;
}

/** ` on 14 July 2026`, or nothing when the row has no date. */
function on(at: number | null): string {
  if (at === null) return "";
  return ` on ${DATE.format(new Date(at))}`;
}

// UTC so a rationale reads the same wherever the worker runs, and so a test can
// assert the string it produces.
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Quote a fragment of the customer's own text into a rationale. Newlines and
 * control characters are flattened because the rationale is one line in a
 * tooltip; the text stays data and is never rendered as HTML (ADR-018).
 */
function quote(value: string): string {
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return `"${flat.slice(0, 120)}"`;
}

function subjectOf(msg: ResearchMessage): string {
  return (msg.subject ?? "").trim() || "untitled";
}

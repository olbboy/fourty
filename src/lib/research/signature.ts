import { FREE_MAIL_DOMAINS, SOCIAL_DOMAINS } from "./domains";

/**
 * Signature-block extraction (Phase 3). Pure: no database, no clock, no network.
 *
 * Comp AI's own source ranking puts a signature block above any data vendor,
 * because a person updates their signature the week they are promoted. This
 * module is what makes that claim keyless — it runs on the message text during
 * ingest, and only what it returns is ever persisted.
 *
 * **The bias is against extracting.** A missed title costs nothing: the field
 * stays empty and a rep fills it in. A wrong title lands on a customer record,
 * where nobody can tell it is wrong. So every rule here refuses on doubt, and
 * the fixtures include footers that must yield nothing at all.
 */

export type Signature = {
  /** A job title, or null. Never a guess. */
  title: string | null;
  /**
   * The employer, as a **domain** when the block carries a website, and as the
   * name beside the title otherwise. Only a domain resolves to a `company_id`
   * (`resolveCompanyValue`); a name stays a proposal for a rep, which is the
   * correct outcome rather than a failure.
   */
  employer: string | null;
  phone: string | null;
  /** The block itself, quoted back to a rep as the rationale. Bounded. */
  raw: string;
};

/** `signature_raw` is a stored column, so the block it holds is capped. */
export const SIGNATURE_RAW_MAX = 500;

/** Beyond this a "block" is prose, and prose is not a signature. */
const MAX_BLOCK_LINES = 8;

/**
 * A line only counts as a title line when it carries one of these. It is a
 * closed list on purpose: matching "anything before a comma" turns `Thanks,
 * Alice` into the job title "Thanks".
 */
const TITLE_WORDS = [
  "head",
  "director",
  "vp",
  "svp",
  "evp",
  "vice president",
  "president",
  "chief",
  "ceo",
  "cto",
  "cfo",
  "coo",
  "ciso",
  "cmo",
  "manager",
  "lead",
  "engineer",
  "developer",
  "architect",
  "designer",
  "analyst",
  "scientist",
  "consultant",
  "specialist",
  "founder",
  "co-founder",
  "cofounder",
  "owner",
  "partner",
  "principal",
  "officer",
  "coordinator",
  "administrator",
  "supervisor",
  "executive",
  "recruiter",
  "counsel",
  "controller",
  "accountant",
  "strategist",
  "producer",
  "editor",
  "advisor",
  "adviser",
  "representative",
  "associate",
  "intern",
];

/**
 * A block containing any of these is a disclaimer, a mobile footer or a mailing
 * list boilerplate — never a signature to mine. Refusing the whole block rather
 * than the line is deliberate: a legal footer sits *inside* the trailing block
 * often enough that per-line filtering would leave half a disclaimer looking
 * like a title.
 */
const DISCLAIMER_MARKERS = [
  "confidential",
  "disclaimer",
  "privileged",
  "intended recipient",
  "unsubscribe",
  "sent from my",
  "all rights reserved",
  "do not reply",
  "no-reply",
  "please consider the environment",
  "virus",
  "opinions expressed",
];

/** Where a quoted reply begins. Everything from here down is somebody else's mail. */
const QUOTE_MARKERS: RegExp[] = [
  /^-{2,}\s*original message\s*-{2,}/i,
  /^-{2,}\s*forwarded message\s*-{2,}/i,
  /^on\b.{5,200}\bwrote:\s*$/i,
  /^_{5,}\s*$/,
  /^from:\s*.+/i,
  /^sent:\s*.+/i,
  /^\s*>/,
];

/** Social links and personal mailboxes are not the employer's website. */
const NOT_EMPLOYER_DOMAINS = [...SOCIAL_DOMAINS, ...FREE_MAIL_DOMAINS];

/** Who sent the message. A signature only counts when it is theirs. */
export type Sender = { address: string | null; displayName: string | null };

/**
 * Extract a signature from a decoded message body, or return null.
 *
 * Null is the common, correct answer. The caller persists nothing when it gets
 * one, and a message with no signature is not a failure to log.
 */
export function extractSignature(body: string | null | undefined, sender: Sender): Signature | null {
  if (!body) return null;
  const own = stripQuoted(body);
  const found = signatureBlock(own);
  if (!found) return null;
  const { lines: block, viaDelimiter } = found;

  // Without the `-- ` delimiter, a trailing paragraph is only a signature when
  // it carries a phone, a website or an address. This is the rule that keeps
  // prose out: "Please contact our account manager" ends a mail, contains a
  // title word, and is not a signature. The cost is missing a bare name-and-
  // title block — a miss, which costs nothing.
  if (!viaDelimiter && !hasContactMarker(block)) return null;
  if (!belongsToSender(block, sender, viaDelimiter)) return null;

  const text = block.join("\n");
  const lower = text.toLowerCase();
  if (DISCLAIMER_MARKERS.some((m) => lower.includes(m))) return null;

  const domain = employerDomain(block);
  const titled = titleLine(block);
  const phone = phoneIn(block);

  const title = titled?.title ?? null;
  const employer = domain ?? titled?.employer ?? null;
  if (!title && !employer && !phone) return null;

  return { title, employer, phone, raw: text.slice(0, SIGNATURE_RAW_MAX) };
}

/**
 * Drop the quoted conversation. A reply carries the other person's signature
 * below the quote marker, and attributing their title to this contact is the
 * single worst thing this module could do.
 */
export function stripQuoted(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (QUOTE_MARKERS.some((re) => re.test(line.trim()))) break;
    out.push(line);
  }
  return out;
}

type Block = { lines: string[]; viaDelimiter: boolean };

/**
 * The candidate block: what follows the RFC 3676 `-- ` delimiter, else the last
 * paragraph of the message. A trailing paragraph longer than `MAX_BLOCK_LINES`
 * is prose the sender happened to end on, so it is refused rather than mined —
 * and so is a one-line one, which is a sign-off ("Talk Thursday") far more often
 * than it is a signature.
 */
function signatureBlock(lines: string[]): Block | null {
  const delimiter = lines.findLastIndex((l) => /^--\s*$/.test(l.trim()));
  if (delimiter !== -1) {
    const block = trimBlank(lines.slice(delimiter + 1));
    return sized(block, 1) ? { lines: block, viaDelimiter: true } : null;
  }

  const trimmed = trimBlank(lines);
  const lastBlank = trimmed.findLastIndex((l) => l.trim() === "");
  if (lastBlank === -1) return null; // one paragraph: a note, not a note + signature
  const block = trimBlank(trimmed.slice(lastBlank + 1));
  return sized(block, 2) ? { lines: block, viaDelimiter: false } : null;
}

function sized(block: string[], min: number): boolean {
  return block.length >= min && block.length <= MAX_BLOCK_LINES;
}

/** A phone, a website or an address — what an actual signature carries. */
function hasContactMarker(block: string[]): boolean {
  if (phoneIn(block) !== null) return true;
  if (employerDomain(block) !== null) return true;
  return addressesIn(block).length > 0;
}

const ADDRESS_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function addressesIn(block: string[]): string[] {
  return (block.join("\n").match(ADDRESS_RE) ?? []).map((a) => a.toLowerCase());
}

/**
 * Is this block the sender's own sign-off, or somebody else's details they
 * pasted at the end of the mail?
 *
 * This is the check that stops "Sure, see below — Jane Doe, VP of Sales,
 * jane@acme.example" from making the *sender* a VP of Sales. Everything
 * downstream trusts that a `signature_title` describes the person who sent the
 * message, so the question has to be settled here, where the From header is
 * still available:
 *
 * 1. If the block carries any email address, one of them must be the sender's.
 *    A block full of somebody else's contact details is somebody else's.
 * 2. Otherwise the block must be either delimited by RFC 3676's `-- ` (which the
 *    sender's own client wrote) or carry a word from the sender's own name.
 */
function belongsToSender(block: string[], sender: Sender, viaDelimiter: boolean): boolean {
  const addresses = addressesIn(block);
  if (addresses.length > 0) {
    const own = sender.address?.trim().toLowerCase();
    return own !== undefined && own !== "" && addresses.includes(own);
  }
  return viaDelimiter || mentionsName(block, sender.displayName);
}

/** Any word of the sender's name, whole, somewhere in the block. */
function mentionsName(block: string[], name: string | null): boolean {
  if (!name) return false;
  const text = block.join("\n").toLowerCase();
  return name
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/i)
    .filter((word) => word.length >= 2)
    .some((word) => new RegExp(`(^|[^a-zà-ÿ])${escapeRe(word)}([^a-zà-ÿ]|$)`, "i").test(text));
}

function trimBlank(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end).map((l) => l.trim());
}

/** Separators a signature uses between a title and an employer. */
const SEGMENT_SPLIT = /\s*(?:,|\||•|·|—|–|\sat\s|\s@\s)\s*/;

/**
 * The title line, split into title and the employer beside it.
 *
 * Only a line carrying a word from `TITLE_WORDS` qualifies, and only the segment
 * carrying that word becomes the title. A line with no such word contributes
 * nothing — including the line holding the person's name, which is exactly the
 * line a looser rule would misread as their job.
 */
function titleLine(block: string[]): { title: string; employer: string | null } | null {
  for (const line of block) {
    if (line.includes("@") || /^https?:/i.test(line)) continue;
    const segments = line.split(SEGMENT_SPLIT).map((s) => s.trim()).filter(Boolean);
    const index = segments.findIndex(isTitle);
    if (index === -1) continue;
    const title = segments[index];
    // Whatever sits after the title on the same line is the employer — but only
    // when it reads like a name rather than a phone number or an address.
    const rest = segments.slice(index + 1).find((s) => isEmployerName(s)) ?? null;
    return { title, employer: rest };
  }
  return null;
}

function isTitle(segment: string): boolean {
  const lower = segment.toLowerCase();
  if (segment.length < 2 || segment.length > 80) return false;
  // A title is a noun phrase. Six words is "Senior Vice President of Global
  // Engineering"; anything longer, or anything punctuated like a sentence, is a
  // sentence that happens to contain the word "director".
  if (segment.split(/\s+/).length > 6) return false;
  if (/[.!?]$/.test(segment) || /\.\s/.test(segment)) return false;
  if (/\d{3,}/.test(segment)) return false; // a phone number or an address
  return TITLE_WORDS.some((word) => new RegExp(`(^|[^a-z])${escapeRe(word)}([^a-z]|$)`, "i").test(lower));
}

function isEmployerName(segment: string): boolean {
  if (segment.length < 2 || segment.length > 80) return false;
  if (/\d{3,}/.test(segment)) return false;
  if (isTitle(segment)) return false;
  return /[a-z]/i.test(segment);
}

/**
 * The employer's domain. A website first, then the domain of a work address in
 * the block — both resolve to a `company_id` by exact match, and a signature
 * with an address and no website is the more common shape of the two. Social
 * links and personal mailboxes count as neither.
 */
function employerDomain(block: string[]): string | null {
  const tokens = block.flatMap((line) => line.split(/\s+/));
  for (const token of tokens) {
    const domain = domainOf(token);
    if (domain && !NOT_EMPLOYER_DOMAINS.includes(domain)) return domain;
  }
  for (const token of tokens) {
    const address = token.match(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/i);
    const domain = address?.[1].toLowerCase();
    if (domain && !NOT_EMPLOYER_DOMAINS.includes(domain)) return domain;
  }
  return null;
}

function domainOf(token: string): string | null {
  const cleaned = token
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/[.,;:)\]]+$/, "")
    .trim();
  if (cleaned.includes("@")) return null; // an address, not a website
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned) && /\.[a-z]{2,}$/.test(cleaned) ? cleaned : null;
}

/**
 * A phone number in the block. Stored for a rep to see; no fact is written from
 * it in v1, because there is no phone entry in the fact-field catalogue.
 */
function phoneIn(block: string[]): string | null {
  for (const line of block) {
    if (/\b(fax)\b/i.test(line)) continue;
    const m = line.match(/\+?\d[\d\s().-]{7,20}\d/);
    if (!m) continue;
    const candidate = m[0].trim();
    const digits = candidate.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    return candidate;
  }
  return null;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Minimal RFC 822/2822 message parser (Gate C6). Extracts the headers we link on
 * (Message-ID, From, To, Subject, Date) plus a body snippet. Not a full MIME
 * decoder — it reads the top-level headers and a plain-text preview, which is all
 * the sync engine needs to dedupe and link a message to a contact.
 */

export type ParsedEmail = {
  messageId: string;
  from: string | null;
  to: string[];
  subject: string | null;
  sentAt: number | null;
  snippet: string | null;
  /** All participant addresses (from + to), lowercased, for contact matching. */
  participants: string[];
};

/** Extract a bare email address from a header value like `Ada <ada@x.io>` or `ada@x.io`. */
export function extractEmail(value: string): string | null {
  const angled = value.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : value).trim();
  const m = candidate.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

function extractEmails(value: string): string[] {
  // Split on commas that separate addresses; tolerate display names with commas
  // by falling back to a global email regex.
  const all = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  return all.map((e) => e.toLowerCase());
}

/** Unfold headers (continuation lines start with whitespace) into a key→value map. */
function parseHeaders(headerBlock: string): Map<string, string> {
  const lines = headerBlock.split(/\r?\n/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += " " + line.trim();
    } else {
      unfolded.push(line);
    }
  }
  const map = new Map<string, string>();
  for (const line of unfolded) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (!map.has(key)) map.set(key, val); // first wins
  }
  return map;
}

export function parseEmail(raw: string): ParsedEmail {
  const sep = raw.search(/\r?\n\r?\n/);
  const headerBlock = sep === -1 ? raw : raw.slice(0, sep);
  const body = sep === -1 ? "" : raw.slice(sep).replace(/^\r?\n\r?\n/, "");
  const h = parseHeaders(headerBlock);

  const messageIdRaw = h.get("message-id") ?? "";
  const messageId = messageIdRaw.replace(/[<>]/g, "").trim();

  const fromHeader = h.get("from") ?? "";
  const from = fromHeader ? extractEmail(fromHeader) : null;
  const to = h.get("to") ? extractEmails(h.get("to")!) : [];
  const cc = h.get("cc") ? extractEmails(h.get("cc")!) : [];

  const dateHeader = h.get("date");
  const parsedDate = dateHeader ? Date.parse(dateHeader) : NaN;
  const sentAt = Number.isFinite(parsedDate) ? parsedDate : null;

  const snippet = body
    ? body.replace(/\s+/g, " ").trim().slice(0, 280) || null
    : null;

  const participants = Array.from(new Set([...(from ? [from] : []), ...to, ...cc]));

  return {
    messageId,
    from,
    to,
    subject: h.get("subject") ?? null,
    sentAt,
    snippet,
    participants,
  };
}

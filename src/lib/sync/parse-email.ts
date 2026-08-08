/**
 * RFC 822/2045 message parser. Extracts the headers we link on (Message-ID,
 * From, To, Subject, Date, In-Reply-To/References) plus the message text.
 *
 * The text half exists for one reason: a signature block lives at the **end** of
 * a body, and Fourty never stores a body. So the text is decoded here, handed to
 * the signature extractor at ingest, and thrown away — only the 280-char
 * `snippet` and whatever the extractor found are persisted (Phase 3).
 *
 * That makes this a real, if small, MIME reader: multipart/alternative and
 * multipart/mixed, quoted-printable and base64, a text/html fallback when a
 * sender ships no plain part. It is deliberately not a complete implementation —
 * attachments are skipped, not decoded, and an unreadable part yields nothing
 * rather than a guess.
 */

export type ParsedEmail = {
  messageId: string;
  from: string | null;
  /** The display name on the From header, if any — `Ada Marchetti <ada@x.io>`. */
  fromName: string | null;
  to: string[];
  subject: string | null;
  sentAt: number | null;
  /**
   * The decoded message text. **In-memory only** — no caller may persist it.
   * The signature extractor reads it during ingest and it is dropped with the
   * parse result.
   */
  body: string | null;
  snippet: string | null;
  /** The message this one replies to, if any — how a reply is recognised. */
  inReplyTo: string | null;
  /** The References chain, oldest first. Its first entry is the thread root. */
  references: string[];
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

/** Split a message (or a MIME part) into its header block and its raw body. */
function splitEntity(raw: string): { headers: Map<string, string>; body: string } {
  const sep = raw.search(/\r?\n\r?\n/);
  if (sep === -1) return { headers: parseHeaders(raw), body: "" };
  return {
    headers: parseHeaders(raw.slice(0, sep)),
    body: raw.slice(sep).replace(/^\r?\n\r?\n/, ""),
  };
}

// ── MIME text extraction ─────────────────────────────────────────────────────

type ContentType = { type: string; params: Map<string, string> };

/** `text/plain; charset="utf-8"` → type + params, values unquoted. */
function parseContentType(value: string | undefined): ContentType {
  const raw = value ?? "text/plain";
  const [head, ...rest] = raw.split(";");
  const params = new Map<string, string>();
  for (const part of rest) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = part
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    params.set(key, val);
  }
  return { type: head.trim().toLowerCase(), params };
}

/** Node knows these names; anything else is read as UTF-8 rather than guessed. */
function nodeCharset(charset: string | undefined): BufferEncoding {
  switch ((charset ?? "").toLowerCase()) {
    case "iso-8859-1":
    case "latin1":
    case "windows-1252":
      return "latin1";
    case "us-ascii":
    case "ascii":
      return "ascii";
    default:
      return "utf8";
  }
}

function decodeQuotedPrintable(input: string, charset: BufferEncoding): string {
  const bytes = input
    .replace(/=\r?\n/g, "") // soft line break
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  // The replacement produced one char per byte; reinterpret as bytes so a
  // multi-byte UTF-8 sequence comes back as one character rather than two.
  return Buffer.from(bytes, "latin1").toString(charset);
}

function decodeBody(body: string, encoding: string | undefined, charset: BufferEncoding): string {
  const cte = (encoding ?? "7bit").trim().toLowerCase();
  if (cte === "quoted-printable") return decodeQuotedPrintable(body, charset);
  if (cte === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString(charset);
  return charset === "utf8" ? body : Buffer.from(body, "latin1").toString(charset);
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Last resort when a sender ships HTML only. Block-level tags become newlines
 * because the signature extractor works line by line — flattening the whole
 * message to one line would hide the signature it is looking for.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The delimiter lines of a multipart body, split into its parts. */
function splitParts(body: string, boundary: string): string[] {
  const start = `--${boundary}`;
  const end = `--${boundary}--`;
  const parts: string[] = [];
  let current: string[] | null = null;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    if (trimmed === end) break;
    if (trimmed === start) {
      if (current) parts.push(current.join("\n"));
      current = [];
      continue;
    }
    if (current) current.push(line);
  }
  if (current) parts.push(current.join("\n"));
  return parts;
}

/** A malformed message must not be able to cost unbounded work. */
const MAX_DEPTH = 5;
const MAX_PARTS = 20;

/**
 * The readable text of an entity. `text/plain` wins over `text/html` wherever
 * both exist — not only inside multipart/alternative, because senders nest the
 * alternative inside a mixed part and the plain half is still the better read.
 */
function textOf(headers: Map<string, string>, body: string, depth = 0): string {
  if (depth > MAX_DEPTH) return "";
  const ct = parseContentType(headers.get("content-type"));
  const charset = nodeCharset(ct.params.get("charset"));

  if (ct.type.startsWith("multipart/")) {
    const boundary = ct.params.get("boundary");
    if (!boundary) return "";
    let html = "";
    for (const raw of splitParts(body, boundary).slice(0, MAX_PARTS)) {
      const part = splitEntity(raw);
      const partType = parseContentType(part.headers.get("content-type")).type;
      const text = textOf(part.headers, part.body, depth + 1);
      if (!text) continue;
      if (partType === "text/html") html ||= text;
      else return text; // plain (or a nested part that resolved to plain)
    }
    return html;
  }

  if (ct.type === "text/html") {
    return htmlToText(decodeBody(body, headers.get("content-transfer-encoding"), charset));
  }
  if (ct.type === "text/plain" || ct.type === "") {
    return decodeBody(body, headers.get("content-transfer-encoding"), charset).trim();
  }
  // An attachment is skipped, not decoded: nothing here wants its bytes.
  return "";
}

/**
 * RFC 2047 encoded words in a header (`=?utf-8?B?…?=`). Subjects are quoted back
 * to a rep in an evidence rationale, and mojibake on a customer record reads as
 * a bug in the CRM.
 */
function decodeHeaderWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (whole, charset: string, encoding: string, text: string) => {
      const target = nodeCharset(charset);
      try {
        if (encoding.toLowerCase() === "b") return Buffer.from(text, "base64").toString(target);
        return decodeQuotedPrintable(text.replace(/_/g, " "), target);
      } catch {
        return whole;
      }
    },
  );
}

/**
 * The display name on an address header. Used to check that a signature block
 * is the sender's own rather than a contact card they pasted, so a header with
 * only an address yields null and the check falls back to something stricter.
 */
export function displayName(header: string): string | null {
  const angled = header.indexOf("<");
  const raw = angled === -1 ? "" : header.slice(0, angled);
  const name = decodeHeaderWords(raw).trim().replace(/^"(.*)"$/, "$1").trim();
  return name && !name.includes("@") ? name : null;
}

/** `<a@x>` `<b@y>` → `["a@x", "b@y"]`, oldest first. */
function messageIds(value: string | undefined): string[] {
  if (!value) return [];
  return (value.match(/<[^>]+>/g) ?? []).map((id) => id.slice(1, -1).trim()).filter(Boolean);
}

export function parseEmail(raw: string): ParsedEmail {
  const { headers: h, body: rawBody } = splitEntity(raw);

  const messageIdRaw = h.get("message-id") ?? "";
  const messageId = messageIdRaw.replace(/[<>]/g, "").trim();

  const fromHeader = h.get("from") ?? "";
  const from = fromHeader ? extractEmail(fromHeader) : null;
  const to = h.get("to") ? extractEmails(h.get("to")!) : [];
  const cc = h.get("cc") ? extractEmails(h.get("cc")!) : [];

  const dateHeader = h.get("date");
  const parsedDate = dateHeader ? Date.parse(dateHeader) : NaN;
  const sentAt = Number.isFinite(parsedDate) ? parsedDate : null;

  const body = textOf(h, rawBody) || null;
  const snippet = body ? body.replace(/\s+/g, " ").trim().slice(0, 280) || null : null;

  const subjectRaw = h.get("subject");
  const participants = Array.from(new Set([...(from ? [from] : []), ...to, ...cc]));

  return {
    messageId,
    from,
    fromName: fromHeader ? displayName(fromHeader) : null,
    to,
    subject: subjectRaw ? decodeHeaderWords(subjectRaw) : null,
    sentAt,
    body,
    snippet,
    inReplyTo: messageIds(h.get("in-reply-to"))[0] ?? null,
    references: messageIds(h.get("references")),
    participants,
  };
}

/**
 * The thread a message belongs to: the root of its References chain, else the
 * message it replies to, else itself. Two messages in one conversation land on
 * the same value, which is what "they replied on a thread we hold" needs.
 */
export function threadIdOf(msg: ParsedEmail): string | null {
  return msg.references[0] ?? msg.inReplyTo ?? msg.messageId ?? null;
}

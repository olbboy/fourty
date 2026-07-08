/**
 * Minimal iCalendar (RFC 5545) VEVENT parser (Gate C6). Unfolds folded lines,
 * walks BEGIN:VEVENT…END:VEVENT blocks, and extracts the fields the sync engine
 * links on: UID, SUMMARY, DESCRIPTION, LOCATION, DTSTART/DTEND, and ATTENDEE/
 * ORGANIZER emails. Handles UTC (…Z), floating, and all-day (VALUE=DATE) times.
 */

export type ParsedEvent = {
  uid: string;
  title: string | null;
  description: string | null;
  location: string | null;
  startAt: number | null;
  endAt: number | null;
  attendees: string[]; // lowercased emails
};

/** Unfold RFC 5545 folded lines: a CRLF followed by space/tab continues the line. */
function unfold(ics: string): string[] {
  const rawLines = ics.split(/\r?\n/);
  const out: string[] = [];
  for (const line of rawLines) {
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Split a content line into { name, params, value } — `DTSTART;VALUE=DATE:20260708`. */
function splitLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = left.indexOf(";");
  const name = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
  const params = semi === -1 ? "" : left.slice(semi + 1);
  return { name, params, value };
}

/** Parse an iCal date/date-time to epoch millis (UTC). */
export function parseIcsDate(value: string): number | null {
  const v = value.trim();
  // All-day: YYYYMMDD
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  // Date-time: YYYYMMDDTHHMMSS with optional trailing Z (UTC). Floating times are
  // interpreted as UTC too (no tz database in-repo — documented simplification).
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (dt) {
    return Date.UTC(
      Number(dt[1]),
      Number(dt[2]) - 1,
      Number(dt[3]),
      Number(dt[4]),
      Number(dt[5]),
      Number(dt[6]),
    );
  }
  const fallback = Date.parse(v);
  return Number.isFinite(fallback) ? fallback : null;
}

function mailtoEmail(value: string): string | null {
  const m = value.match(/mailto:([^\s;]+)/i) ?? value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? (m[1] ?? m[0]).toLowerCase() : null;
}

export function parseIcs(ics: string): ParsedEvent[] {
  const lines = unfold(ics);
  const events: ParsedEvent[] = [];
  let cur: ParsedEvent | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      cur = { uid: "", title: null, description: null, location: null, startAt: null, endAt: null, attendees: [] };
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      if (cur && cur.uid) {
        cur.attendees = Array.from(new Set(cur.attendees));
        events.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const parsed = splitLine(line);
    if (!parsed) continue;
    switch (parsed.name) {
      case "UID":
        cur.uid = parsed.value.trim();
        break;
      case "SUMMARY":
        cur.title = parsed.value.trim() || null;
        break;
      case "DESCRIPTION":
        cur.description = parsed.value.replace(/\\n/g, "\n").trim() || null;
        break;
      case "LOCATION":
        cur.location = parsed.value.trim() || null;
        break;
      case "DTSTART":
        cur.startAt = parseIcsDate(parsed.value);
        break;
      case "DTEND":
        cur.endAt = parseIcsDate(parsed.value);
        break;
      case "ATTENDEE":
      case "ORGANIZER": {
        const email = mailtoEmail(parsed.value);
        if (email) cur.attendees.push(email);
        break;
      }
    }
  }
  return events;
}

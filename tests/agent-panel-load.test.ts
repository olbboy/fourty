import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.resolve(__dirname, "../src/components/agent-panel/index.tsx"), "utf8");

/**
 * A failed conversations GET used to become `[]`, which unlocks the composer
 * and makes the next send start a second conversation on top of history that
 * never appeared. A failed transcript GET used to look like an empty thread.
 */
describe("agent panel load", () => {
  it("does not treat a failed conversations GET as an empty thread list", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : \{ conversations: \[\] \}/);
    expect(src).not.toMatch(/if \(live\) setThreads\(\[\]\)/);
    expect(src).toContain("if (!r.ok) throw");
    expect(src).toContain("setListFailed");
    expect(src).toContain("LoadError");
  });

  it("does not swallow a failed transcript GET", () => {
    expect(src).not.toMatch(/r\.ok \? r\.json\(\) : null/);
    expect(src).toContain("setTranscriptFailed");
  });
});

/**
 * Confirm/cancel used to flip the card to Confirmed before the POST, so a 409
 * still read as a stored decision and `unreachable` locked the buttons. The
 * mark now sits after the !ok gate; failure returns to awaiting_confirmation.
 */
describe("agent panel decide", () => {
  it("does not mark a proposal resolved before the POST succeeds", () => {
    const start = src.indexOf("async function decide");
    const end = src.indexOf("return (", start);
    const decide = src.slice(start, end);
    expect(decide.indexOf("await fetch")).toBeGreaterThan(0);
    expect(decide.indexOf("await fetch")).toBeLessThan(decide.indexOf("resolved:"));
    expect(decide).toContain("if (!res.ok || !res.body)");
    expect(decide).toContain('setTurn({ kind: "awaiting_confirmation" })');
  });
});

/**
 * A failed send POST used to set `unreachable`, which the composer maps to
 * `offline` — no retry, and the hint claims no provider. A 429/500 is not that;
 * failTurn leaves an error row and returns to idle.
 */
describe("agent panel send", () => {
  it("does not lock the composer offline on a failed send POST", () => {
    const start = src.indexOf("async function send");
    const end = src.indexOf("async function decide");
    const send = src.slice(start, end);
    expect(send).not.toContain('setTurn({ kind: "unreachable" })');
    expect(send).toContain("failTurn");
    expect(src).toContain("chat.unreachable");
    expect(src).toContain('setTurn({ kind: "idle" })');
  });
});

/**
 * A 200 SSE that ends without `done` used to leave `turn: streaming`, so the
 * composer stayed `working` for 90s. consume now drops streaming → idle, and
 * leaves awaiting_confirmation alone.
 */
describe("agent panel facts", () => {
  it("does not fetch /api/facts for records that cannot have facts", () => {
    expect(src).toContain('entityType === "contact" || entityType === "company"');
    expect(src).toContain("opened && showFacts");
    expect(src).toContain("{showFacts ? (");
  });
});

describe("agent panel consume", () => {
  it("does not leave the composer working after a stream without done", () => {
    const start = src.indexOf("const consume = useCallback");
    const end = src.indexOf("async function send");
    const consume = src.slice(start, end);
    expect(consume).toContain('setTurn((s) => (s.kind === "streaming" ? { kind: "idle" } : s))');
  });
});




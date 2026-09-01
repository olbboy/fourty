import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { t } from "@/lib/i18n";

function src(): string {
  return readFileSync(path.resolve(__dirname, "../src/components/ai-chat.tsx"), "utf8");
}

/**
 * A failed GET /api/ai/chat used to return early (and catch as "start empty"),
 * so a 500 looked like a brand-new thread. The next send would start a second
 * conversation on top of history that never appeared. Restore now throws on
 * !ok and renders LoadError compact; the composer stays closed until retry.
 */
describe("ai chat restore", () => {
  it("does not swallow a failed GET as an empty transcript", () => {
    const file = src();
    expect(file).not.toMatch(/if \(!res\.ok\) return;/);
    expect(file).not.toContain("offline / disabled — start empty");
    expect(file).toContain("if (!res.ok) throw");
    expect(file).toContain("setFailed");
    expect(file).toContain("LoadError");
    expect(file).toContain("compact");
  });

  it("does not offer the composer on a failed restore", () => {
    expect(src()).toContain("{!failed && (");
  });
});

/**
 * A failed POST used to enter `streaming` whenever a JSON error body existed,
 * then never receive a `done` event — the composer stayed disabled. consume()
 * now treats !ok like the per-record panel: error row, status idle.
 */
describe("ai chat consume", () => {
  it("does not treat a failed POST as a stream", () => {
    const file = src();
    expect(file).toContain("if (!res.ok || !res.body)");
    expect(file).toContain("failTurn");
    expect(file).toContain("chat.unreachable");
  });

  it("catalogues the unreachable copy in both locales", () => {
    expect(t("en", "chat.unreachable")).toBe("The assistant could not be reached. Try again.");
    expect(t("vi", "chat.unreachable")).toBe("Không kết nối được trợ lý. Thử lại.");
  });
});

/**
 * Confirm/cancel used to flip the card to Confirmed before the POST, so a 409
 * still read as a stored decision. The mark now sits after the !ok gate.
 */
describe("ai chat decide", () => {
  it("does not mark a proposal resolved before the POST succeeds", () => {
    const file = src();
    const start = file.indexOf("async function decide");
    const end = file.indexOf("if (!enabled)");
    const decide = file.slice(start, end);
    expect(decide.indexOf("await fetch")).toBeGreaterThan(0);
    expect(decide.indexOf("await fetch")).toBeLessThan(decide.indexOf("resolved:"));
    expect(decide).toContain("if (!res.ok || !res.body)");
    expect(decide).toContain("failTurn");
  });
});

/**
 * The send route returns 409 until a pending write is confirmed. The composer
 * used to stay enabled, so a typed message looked ready and then failed. It
 * now matches the per-record panel: only `idle` can send.
 */
describe("ai chat composer", () => {
  it("does not send while a proposal is waiting", () => {
    const file = src();
    expect(file).toContain('if (!message || status !== "idle") return');
    expect(file).toContain('disabled={status !== "idle"}');
    expect(file).toContain("agent.placeholder.confirming");
  });

  it("claims streaming before the send POST leaves", () => {
    const file = src();
    const start = file.indexOf("async function send");
    const end = file.indexOf("async function decide");
    const send = file.slice(start, end);
    expect(send.indexOf('setStatus("streaming")')).toBeGreaterThan(0);
    expect(send.indexOf('setStatus("streaming")')).toBeLessThan(send.indexOf("await fetch"));
  });
});





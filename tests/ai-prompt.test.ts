import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/lib/ai/prompt";

describe("buildSystemPrompt", () => {
  it("requires a spoken answer after tool results", () => {
    const prompt = buildSystemPrompt("en", new Date("2026-08-31T00:00:00Z"));
    expect(prompt).toMatch(/after any tool result/i);
    expect(prompt).toMatch(/spoken answer/i);
  });
});

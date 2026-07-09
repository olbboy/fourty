import { beforeAll, afterEach, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { aiClientFromEnv, aiEnabled, __setAiClient, type AiClient } from "@/lib/ai";

/**
 * Optional generative AI (ADR-015, Tier 3) — off by default, BYO-key, and
 * strictly human-in-the-loop (writes DRAFT notes, never mutates records). Tests
 * inject a fake AI client (the injectable-transport pattern) so nothing hits a
 * real provider, and exercise the full workflow → queue → worker path on real PG.
 */
describe("optional generative AI (Tier 3)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let dispatchEvent: typeof import("@/lib/workflows/engine").dispatchEvent;
  let ws: string;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ dispatchEvent } = await import("@/lib/workflows/engine"));
    ws = await createWorkspace();
  });

  afterEach(() => __setAiClient(undefined)); // clear any injected client

  it("is disabled by default when no provider is configured", () => {
    __setAiClient(undefined);
    const prev = process.env.FOURTY_ENABLE_AI;
    delete process.env.FOURTY_ENABLE_AI;
    try {
      expect(aiClientFromEnv()).toBeNull();
      expect(aiEnabled()).toBe(false);
    } finally {
      if (prev !== undefined) process.env.FOURTY_ENABLE_AI = prev;
    }
  });

  it("resolves a provider client only when enabled AND keyed", () => {
    __setAiClient(undefined);
    const saved = {
      FOURTY_ENABLE_AI: process.env.FOURTY_ENABLE_AI,
      FOURTY_AI_PROVIDER: process.env.FOURTY_AI_PROVIDER,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };
    try {
      process.env.FOURTY_ENABLE_AI = "1";
      process.env.FOURTY_AI_PROVIDER = "anthropic";
      delete process.env.ANTHROPIC_API_KEY;
      expect(aiClientFromEnv()).toBeNull(); // enabled but no key → still off

      process.env.ANTHROPIC_API_KEY = "sk-test";
      const c = aiClientFromEnv();
      expect(c?.provider).toBe("anthropic");
      expect(c?.model).toBe("claude-opus-4-8");
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("ai_draft workflow writes a human-review draft note, audited via:ai", async () => {
    const fake: AiClient = {
      provider: "fake",
      model: "fake",
      generate: async ({ prompt }) => `DRAFT for: ${prompt}`,
    };
    __setAiClient(fake);
    await withWorkspace(ws, async () => {
      await db.insert(tables.contacts).values({
        id: "ai-c1",
        firstName: "Neo",
        lastName: "Anderson",
        status: "lead",
        custom: "{}",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await db.insert(tables.workflows).values({
        id: "wf-ai",
        name: "AI follow-up",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "ai_draft", prompt: "follow up with {{firstName}}" }]),
        createdAt: Date.now(),
      });

      await dispatchEvent({
        event: "contact.created",
        entityType: "contact",
        entityId: "ai-c1",
        snapshot: { firstName: "Neo" },
      });

      const draft = (await db.select().from(tables.notes)).find((n) => n.entityId === "ai-c1");
      expect(draft).toBeTruthy();
      expect(draft!.body).toContain("🤖 AI draft");
      expect(draft!.body).toContain("DRAFT for: follow up with Neo");
      expect(draft!.authorId).toBeNull(); // AI-authored, not a human

      const audits = await db.select().from(tables.auditLog);
      expect(audits.some((a) => a.action === "note.created" && a.meta.includes('"via":"ai"'))).toBe(true);
    });
  });

  it("ai_draft is a clean no-op when AI is disabled", async () => {
    __setAiClient(null); // force "disabled"
    await withWorkspace(ws, async () => {
      const before = (await db.select().from(tables.notes)).length;
      await db.insert(tables.workflows).values({
        id: "wf-ai-off",
        name: "AI off",
        enabled: 1,
        trigger: JSON.stringify({ event: "company.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "ai_draft", prompt: "x" }]),
        createdAt: Date.now(),
      });
      await dispatchEvent({
        event: "company.created",
        entityType: "company",
        entityId: "ai-co1",
        snapshot: {},
      });
      expect((await db.select().from(tables.notes)).length).toBe(before);
      const run = (await db.select().from(tables.workflowRuns)).find((r) => r.entityId === "ai-co1");
      expect(run?.log).toContain("skipped ai_draft: AI disabled");
    });
  });
});

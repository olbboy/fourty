import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isAiEnabled, streamChat, ProviderError, type StreamEvent } from "@/lib/ai/provider";
import { toProviderTools } from "@/lib/ai/tool-bridge";
import { TOOLS } from "@/mcp/tools";

/**
 * Live GLM / OpenAI-compatible ping. Skips when no key is in the environment
 * or `.env` (CI has none). Never logs the key.
 */

const GLM_MODELS = ["glm-4.5-flash", "glm-4-flash", "glm-4-plus", "glm-5.3", "glm-4.6"] as const;

function applyLocalEnv(): void {
  let text: string;
  try {
    text = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
  } catch {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function textOf(events: StreamEvent[]): string {
  return events
    .filter((e): e is Extract<StreamEvent, { type: "text" }> => e.type === "text")
    .map((e) => e.delta)
    .join("");
}

applyLocalEnv();

const LIVE = isAiEnabled();

describe.skipIf(!LIVE)("GLM / OpenAI-compatible live provider", () => {
  it(
    "streams a short reply",
    async () => {
      const tried: string[] = [];
      let last: unknown;
      const explicit = (process.env.AI_MODEL ?? "").trim();
      const models = explicit ? [explicit, ...GLM_MODELS.filter((m) => m !== explicit)] : [...GLM_MODELS];
      for (const model of models) {
        process.env.AI_MODEL = model;
        tried.push(model);
        try {
          const events = await collect(
            streamChat({
              messages: [{ role: "user", content: "Reply with the single word OK." }],
            }),
          );
          const text = textOf(events);
          expect(events.at(-1)?.type).toBe("done");
          expect(text.length).toBeGreaterThan(0);
          return;
        } catch (err) {
          last = err;
          const msg = err instanceof ProviderError ? err.message : String(err);
          if (!/provider responded 4\d\d/.test(msg)) throw err;
        }
      }
      throw new Error(
        `no live model accepted a ping (tried ${tried.join(", ")}): ${
          last instanceof Error ? last.message : String(last)
        }`,
      );
    },
    90_000,
  );

  it(
    "emits a tool call when asked to use tools",
    async () => {
      const events = await collect(
        streamChat({
          messages: [
            {
              role: "user",
              content:
                "Call the echo tool with text exactly hello. Do not answer in prose before the tool call.",
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "echo",
                description: "Echo the given text back.",
                parameters: {
                  type: "object",
                  properties: { text: { type: "string" } },
                  required: ["text"],
                },
              },
            },
          ],
        }),
      );
      const tools = events.filter(
        (e): e is Extract<StreamEvent, { type: "tool_calls" }> => e.type === "tool_calls",
      );
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].calls[0]?.name).toBe("echo");
    },
    90_000,
  );
});

type ChatEvent = { type: string; name?: string; text?: string; message?: string };

async function readSse(res: Response): Promise<ChatEvent[]> {
  if (!res.body) return [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const events: ChatEvent[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const block of parts) {
      const line = block.trim();
      if (!line) continue;
      events.push(JSON.parse(line.replace(/^data:\s*/, "")) as ChatEvent);
    }
  }
  return events;
}

function spokenOf(events: ChatEvent[]): string {
  return events
    .filter((e) => e.type === "delta")
    .map((e) => e.text ?? "")
    .join("");
}

describe.skipIf(!LIVE)("GLM live agent against CRM tools", () => {
  let ws: string;
  let key: string;

  beforeAll(async () => {
    process.env.AI_MAX_TOKENS = process.env.AI_MAX_TOKENS || "2048";
    const { resetDb, createWorkspace } = await import("./pg-setup");
    const { db, tables, withWorkspace } = await import("@/db");
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    await resetDb();
    ws = await createWorkspace({ name: "GlmLive" });
    key = "frty_glm_live";
    await withWorkspace(ws, async () => {
      await db.insert(tables.apiKeys).values({
        id: newId(),
        workspaceId: ws,
        name: "glm-live",
        prefix: "frty",
        keyHash: sha256(key),
        role: "admin",
        createdAt: Date.now(),
      });
      await db.insert(tables.contacts).values({
        id: newId(),
        firstName: "Ada",
        lastName: "Marchetti",
        email: "ada@fernhill.example",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
  });

  afterAll(() => {
    delete process.env.AI_RATELIMIT_PER_HOUR;
  });

  it("exposes MCP tools including list_contacts to the provider", () => {
    const names = toProviderTools(TOOLS).map((t) => t.function.name);
    expect(names).toContain("list_contacts");
  });

  it(
    "runAgent with only list_contacts names the seeded contact",
    async () => {
      const { runAgent } = await import("@/lib/ai/agent");
      const listOnly = TOOLS.filter((t) => t.name === "list_contacts");
      expect(listOnly).toHaveLength(1);
      const events: ChatEvent[] = [];
      for await (const e of runAgent(
        {
          ctx: { workspaceId: ws, role: "admin", userId: null, via: "ai" },
          ownerId: "glm-live",
          systemPrompt:
            "You are a CRM assistant. Call list_contacts to look up people. Never invent a last name.",
          deps: { streamChat },
          tools: listOnly,
          maxSteps: 3,
        },
        {
          kind: "message",
          conversationId: null,
          message: "Use list_contacts with query Ada and tell me Ada's last name. Do not invent it.",
        },
      )) {
        events.push(e);
      }
      expect(events.some((e) => e.type === "conversation")).toBe(true);
      expect(events.some((e) => e.type === "tool_result" && e.name === "list_contacts")).toBe(true);
      expect(spokenOf(events).toLowerCase()).toContain("marchetti");
    },
    240_000,
  );

  it(
    "lists the seeded contact through POST /api/ai/chat",
    async () => {
      const { POST } = await import("@/app/api/ai/chat/route");
      const res = await POST(
        new Request("http://localhost/api/ai/chat", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: JSON.stringify({
            message:
              "Use list_contacts (query Ada) and tell me Ada's last name. Do not invent it.",
          }),
        }),
      );
      expect(res.status).toBe(200);
      const events = await readSse(res);
      expect(events.map((e) => e.type)).toContain("conversation");
      expect(events.some((e) => e.type === "error")).toBe(false);
      expect(events.some((e) => e.type === "tool_result" && e.name === "list_contacts")).toBe(true);
      expect(spokenOf(events).toLowerCase()).toContain("marchetti");
    },
    360_000,
  );
});


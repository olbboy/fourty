/**
 * Optional, bring-your-own-key generative layer (ADR-015, Tier 3).
 *
 * OFF BY DEFAULT. Enabled only when `FOURTY_ENABLE_AI=1` and a provider key is
 * configured — exactly the dormant-until-env idiom Fourty uses for OAuth mail
 * (src/lib/sync/oauth.ts) and OTel (src/lib/otel.ts). When unconfigured,
 * `aiClientFromEnv()` returns null and every AI feature simply doesn't appear.
 *
 * Provider-agnostic by design (privacy + no lock-in): Anthropic, OpenAI, or a
 * LOCAL model via Ollama — the operator brings the key and picks the provider,
 * so CRM data never leaves the box unless they opt in, and a local model keeps
 * it on-prem entirely. Implemented as thin `fetch` calls, NOT a heavyweight SDK,
 * to preserve Fourty's zero-heavy-dependency ethos (ADR-004/ADR-010): the core
 * stays at ~10 runtime deps and installs in 30 seconds.
 *
 * The provider endpoint is operator-configured (trusted env), so — unlike the
 * webhook action's user-supplied URL — it is NOT run through the SSRF guard;
 * that keeps localhost/on-prem model servers (Ollama) reachable.
 */

export type AiInput = { system?: string; prompt: string };
export type AiClient = {
  provider: string;
  model: string;
  generate(input: AiInput): Promise<string>;
};

// Test seam (mirrors the injectable-transport pattern of the sync engine,
// ADR-009): inject a fake client so tests never hit a real provider. `undefined`
// = not overridden; `null` = force "disabled"; a client = force-enabled.
let override: AiClient | null | undefined;
export function __setAiClient(client: AiClient | null | undefined): void {
  override = client;
}

/** True when a generative provider is configured and enabled. */
export function aiEnabled(): boolean {
  return aiClientFromEnv() !== null;
}

/**
 * Resolve a generative client from the environment, or null when AI is disabled
 * or unconfigured. Never throws at import/callsite — callers treat null as "off".
 */
export function aiClientFromEnv(): AiClient | null {
  if (override !== undefined) return override;
  if (process.env.FOURTY_ENABLE_AI !== "1") return null;

  const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? 1024);

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    const model = process.env.AI_MODEL ?? "claude-opus-4-8";
    return { provider, model, generate: (i) => anthropicGenerate(key, model, maxTokens, i) };
  }
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const model = process.env.AI_MODEL ?? "gpt-4o-mini";
    return { provider, model, generate: (i) => openaiGenerate(key, model, maxTokens, i) };
  }
  if (provider === "ollama") {
    // Local model server — no API key; the operator points at their own host.
    const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const model = process.env.AI_MODEL ?? "llama3.1";
    return { provider, model, generate: (i) => ollamaGenerate(base, model, maxTokens, i) };
  }
  return null;
}

// ── Provider adapters (thin fetch — no SDK) ──────────────────────────────────

async function anthropicGenerate(key: string, model: string, maxTokens: number, input: AiInput): Promise<string> {
  // Anthropic Messages API. No sampling params (temperature/top_p are rejected
  // on current models) and no `thinking` — plain drafting.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(input.system ? { system: input.system } : {}),
      messages: [{ role: "user", content: input.prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

async function openaiGenerate(key: string, model: string, maxTokens: number, input: AiInput): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.prompt });
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function ollamaGenerate(base: string, model: string, maxTokens: number, input: AiInput): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.prompt });
  const res = await fetch(`${base.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, options: { num_predict: maxTokens } }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return (data.message?.content ?? "").trim();
}

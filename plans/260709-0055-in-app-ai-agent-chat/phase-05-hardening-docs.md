---
phase: 5
title: "Hardening & Docs"
status: done
priority: P2
dependencies: [1, 2, 3, 4]
effort: "S"
---

# Phase 5: Hardening & Docs

## Overview

Close the guardrails (step/cost bounds, injection posture, audit coverage), prove non-regression,
and document the feature honestly (BYO setup, optionality, tested provider matrix, cost note). No new
behavior — this phase makes round-1 shippable and truthful.

## Requirements

- Functional: enforce loop bounds + graceful provider-error surfacing; ensure every executed write is audited `via: 'ai'`; document setup + limits.
- Non-functional: existing 94 tests unaffected with AI unset; docs match code (README/ADR); claims cross-checked (repo convention: `CLAIMS.md`/`PARITY.md`).

## Architecture

- **Guardrails review** (mostly assertions on Phase 3): `MAX_STEPS` enforced; enforced `max_tokens` (RT-E) + per-user AI quota (RT-E); provider HTTP error / timeout → SSE `error` event + persisted assistant error message that is a **fixed generic string** (RT-I — raw upstream text logged server-side only, never persisted/streamed); atomic single-execution of confirmed writes (RT-B); `via: 'ai'` recorded exactly once (RT-A).
- **Injection posture**: confirm system prompt hardening + the structural guarantee (writes human-confirmed) are documented as the mitigation; note that read tools return structured JSON.
- **Provider matrix (validated)** <!-- Updated: Validation Session 1 - document matrix + degrade -->: document that tool-calling is **tested against OpenAI-compatible cloud providers (OpenAI/Groq/OpenRouter)**; Ollama/LM Studio are **best-effort** — the agent degrades to a text-only assistant when a model does not emit `tool_calls`. No provider-specific adapters in round 1 (YAGNI).
- **Docs**:
  - `README.md` — new "AI agent / chat" bullet + a short setup block (`AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`/`AI_MAX_TOKENS`/`AI_RATELIMIT_PER_HOUR`, "optional — disabled when unset", tested against OpenAI/Groq/OpenRouter/Ollama). Document the per-user AI quota + `max_tokens` as the cost guardrails (RT-E).
  - `docs/adr/0NN-ai-agent-chat.md` — record Approach A, stop-at-write, BYO provider, reuse of `TOOLS`+`withAuth`, and the deferred items.
  - Update `PARITY.md` / backlog `#3`,`#4` status; `.env.example` already done in Phase 1.
- **Cost/ops note**: self-hoster pays their own LLM; document per-turn step cap.

## Related Code Files

- Modify: `README.md`, `PARITY.md`, `plans/260708-1645-remaining-features-backlog.md` (mark #3/#4 progress)
- Create: `docs/adr/0NN-ai-agent-chat.md` (next ADR number)
- Modify (if a hard limit is added): `src/lib/ai/agent.ts` (token/step constants centralized)
- Create/extend (tests): `tests/ai-hardening.test.ts` (provider-error → `error` event, no crash; MAX_STEPS terminal `done`; audit `via:'ai'` present) — may fold into `tests/ai-agent.test.ts`

## Implementation Steps

1. **RED** — provider-error test: `streamChat` rejects/emits malformed data → route emits SSE `error`, persists an assistant error message, does not throw.
2. **GREEN** — add error handling + centralize `MAX_STEPS`/token constants.
3. Full suite: `npm test` (all green, incl. untouched 94) + `npm run build`.
4. Verify AI-disabled path end-to-end: unset key → route 404 + toggle hidden + suite unaffected.
5. Write docs; re-verify every doc claim against code (per repo `CLAIMS.md` discipline).

## Success Criteria

- [ ] `npm test` fully green including new AI tests; `npm run build` green.
- [ ] Provider errors never crash the route; surfaced as SSE `error` + persisted message.
- [ ] Every agent-executed write audited `via: 'ai'` (asserted).
- [ ] README + ADR + PARITY/backlog updated; `.env.example` accurate; claims match code.
- [ ] AI-disabled: `docker compose up` unchanged, existing 94 tests pass, UI hides chat.

## Risk Assessment

- **Over-claiming in docs**: repo culture forbids unmeasured claims. Mitigation: only document what tests prove; list tested provider matrix explicitly; mark Ollama tool-calling as "best-effort".
- **Deferred-item drift**: clearly restate round-1 out-of-scope in README/ADR so later contributors don't assume per-record/async agent exists.

---
title: "E2E / Browser Test — Playwright smoke harness (Round 1)"
description: "Playwright smoke harness cho Fourty: 3 flow critical-path (setup/login/logout, kanban drag, ⌘K palette) chạy trong Chromium thật, một lệnh local + CI non-blocking."
status: done
priority: P2
branch: "main"
tags: [testing, e2e, playwright, ci]
blockedBy: []
blocks: []
created: "2026-07-09T01:48:07.012Z"
createdBy: "ck:plan"
source: skill
---

# E2E / Browser Test — Playwright smoke harness (Round 1)

## Overview

Fourty có 94 vitest (unit + API/RLS/security) nhưng **không có test browser thật** — flow client-side (kanban drag optimistic, ⌘K palette, first-boot setup) không có coverage chạm tới được. Plan này dựng **Playwright smoke harness** phủ 3 flow critical-path trong Chromium thật, chạy bằng **một lệnh** local lẫn CI (job **non-blocking** lúc đầu).

Nguồn: [brainstorm report](../reports/brainstorm-260709-0837-e2e-browser-test-playwright-smoke-report.md).

**Nguyên tắc**: KISS/YAGNI/DRY — không thêm hạ tầng nặng (không Redis, không docker-compose ở CI E2E); vitest giữ nguyên; tách `e2e/` khỏi `tests/`.

## Scope

**IN (Round 1)**
- `auth` flow: first-boot setup (tạo admin + seed demo) → login → logout.
- `kanban` flow: kéo deal giữa stage, assert card đổi cột + tổng/forecast cập nhật.
- `⌘K` flow: mở palette, search, điều hướng bằng bàn phím.
- Harness: `playwright.config.ts`, `e2e/`, `npm run test:e2e`, DB E2E riêng, storageState.
- CI: 1 job mới non-blocking (`continue-on-error`), cache browsers.

**OUT (Round 2+)** — AI chat SSE (mock server), workflow builder, CSV import, 2FA/SSO, custom objects, i18n toggle, mobile/PWA, cross-browser Firefox/WebKit, visual regression, axe a11y.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Harness & Auth](./phase-01-harness-auth.md) | Done |
| 2 | [Smoke Specs](./phase-02-smoke-specs.md) | Done |
| 3 | [CI Integration](./phase-03-ci-integration.md) | Done |

## Acceptance criteria

- [x] `npm run test:e2e` xanh **local** (Chromium thật, tự boot app). — 5/5 pass (~24s).
- [x] 3 flow (auth / kanban / ⌘K) pass. — setup wizard + login/logout + kanban drag + ⌘K navigate/Escape.
- [x] CI có job `e2e` chạy trên PR, **non-blocking** (`continue-on-error: true`), có trace/report artifact khi fail.
- [x] vitest suite **không đổi**, vẫn xanh (36 files / 222 test — suite đã lớn hơn "94" lúc lập plan); E2E dùng DB riêng `fourty_e2e`, không đụng `fourty_test`.
- [x] Sửa source tối thiểu: chỉ thêm 3 `data-testid` (deal-card / stage-column / stage-total) trong `deals-client.tsx`; JSX-only, không đổi behavior (verified bởi code-reviewer).

## Implementation notes (Session 2)

- **Playwright ordering deviation**: plan phase-01 dự tính `e2e/global-setup.ts` (Playwright `globalSetup`) migrate DB trước webServer. Thực tế Playwright chạy `globalSetup` **sau** khi `webServer` đã ready → app boot trên schema rỗng, `/login` crash (`relation "users" does not exist`). **Fix**: migrate/truncate nhúng vào chuỗi `webServer.command` (`build → db:e2e:reset → start`) qua script `e2e/prepare-db.ts` (chạy bằng `tsx`, reuse `resetDb()` + guard tên DB chứa `"e2e"`). Thêm script `db:e2e:reset`. File `global-setup.ts` **không tạo**.
- **Dedicated E2E port 3100** (không dùng 3000 mặc định của `next dev`) → `reuseExistingServer` không thể vô tình attach + seed vào DB dev thật của lập trình viên (xử lý M1 từ code review).
- **Review**: code-reviewer = DONE_WITH_CONCERNS, 0 Critical/High. DB-safety guard, DnD race, storageState isolation, zero-behavior-change đều verify qua code thật.

## Key design decisions (đã chốt ở brainstorm)

| Quyết định | Chọn |
|---|---|
| Tooling | Playwright + Chromium |
| App-under-test | `next build && next start` + Postgres E2E DB (KHÔNG docker-compose ở CI) |
| DB isolation | **Setup-once + `storageState`** (Playwright `setup` project dependency) |
| AI chat SSE | **Defer Round 2** |
| CI gate | **Non-blocking** ban đầu → lật `required` khi ổn định |
| DB E2E | `fourty_e2e` riêng, role `fourty` (owner, migrate) + `fourty_app` (RLS subject, app runtime) |
| Cookie qua HTTP | `FOURTY_INSECURE_COOKIE=1` khi `next start` trên `http://localhost` |

## Risks

| Risk | Mitigation | Phase |
|---|---|---|
| Native HTML5 DnD khó drive (flaky nhất) | Helper dispatch `dragstart/dragover/drop` qua React event system; `retries: 1` ở CI | 2 |
| Session bị invalidate khi test logout ảnh hưởng storageState chung | `auth.spec` opt-out storageState, login fresh (session riêng) — logout không đụng session của setup | 1-2 |
| `next start` trên HTTP không set được session cookie | `FOURTY_INSECURE_COOKIE=1` trong webServer.env | 1 |
| Setup wizard chỉ chạy khi `isFreshInstall()` | `globalSetup` migrate + TRUNCATE toàn bộ app table trước khi webServer boot | 1 |
| CI chậm thêm ~1-2 phút | Cache Playwright browsers; job non-blocking | 3 |

## Dependencies

Không có quan hệ blocking với plan khác. Plan [in-app-ai-agent-chat](../260709-0055-in-app-ai-agent-chat/plan.md) là *triển khai* AI; plan này *test* và đã **defer AI chat sang Round 2** → độc lập.

## Open questions

- Seed demo qua **wizard tick** (mặc định checked) hay `npm run db:seed` trong globalSetup? → **Chọn wizard tick** (đã phải chạy setup, đỡ 1 bước). Quyết ở Phase 1.
- Assert theo record demo cố định hay pattern động? → Assert **pattern động** (đếm card đổi cột) để không giòn theo seed data. Quyết ở Phase 2.

## Validation Log

### Verification Results (Session 1)
- Tier: **Standard** (3 phases → Fact Checker + Contract Verifier).
- Claims checked: 7 · **Verified: 7** · Failed: 0 · Unverified: 0.
- Evidence:
  - `src/app/login/page.tsx` — `LoginForm mode={fresh ? "setup" : "login"}` via `isFreshInstall()`. VERIFIED.
  - `src/components/shell.tsx:91` — logout = `POST /api/auth/logout`, control `[aria-label="Sign out"]`. VERIFIED.
  - `src/app/(app)/deals/deals-client.tsx:21` — `view` default `"kanban"`; per-column total (`totalUsd`) rendered `:178`. VERIFIED.
  - `src/lib/auth.ts:53` — `secure: NODE_ENV==="production" && FOURTY_INSECURE_COOKIE!=="1"` → flag **bắt buộc** cho `next start`. VERIFIED.
  - `src/db/migrate.ts:16` — prefers `MIGRATE_DATABASE_URL ?? DATABASE_URL`. VERIFIED.
  - `tests/pg-setup.ts:19` — exports `resetDb()` (migrate + `TRUNCATE ... RESTART IDENTITY CASCADE`); default URL `fourty_test` → **footgun** nếu env E2E không override. VERIFIED + risk noted.
  - `src/app/api/deals/[id]/route.ts` — `PATCH {stageId}`; `moveDeal` at `deals-client.tsx:55`. VERIFIED.

### Decisions (Session 1)
1. **globalSetup reset** → **tái dùng `resetDb()`** từ `tests/pg-setup.ts`, set cứng `MIGRATE_DATABASE_URL=…/fourty_e2e` + **guard**: assert DB name chứa `e2e` trước khi truncate (chặn truncate nhầm `fourty_test`). → Phase 1.
2. **Kanban DnD fallback** → **retries:1 ở CI + giữ DnD thật**; nếu vẫn flaky thì **quarantine** test (KHÔNG giả lập bằng API-assert). → Phase 2 (bỏ phương án fallback API-assert khỏi risk).
3. **Local DB/role ergonomics** → thêm script **`db:e2e:setup`** (idempotent: tạo DB `fourty_e2e` + role `fourty_app` + grants); README hướng dẫn chạy 1 lần; **CI tái dùng chính script này** thay psql thủ công. → Phase 1 + Phase 3.

### Whole-Plan Consistency Sweep (Session 1)
- Propagated decisions xuống phase-01 (resetDb reuse + guard + `db:e2e:setup`), phase-02 (DnD quarantine, bỏ API-fallback), phase-03 (CI dùng `db:e2e:setup`).
- Không còn thuật ngữ cũ / contract mâu thuẫn. `db:e2e:setup` xuất hiện nhất quán ở plan + phase-01 + phase-03. **0 mâu thuẫn tồn đọng.**

---
phase: 1
title: "Harness & Auth"
status: done
priority: P1
effort: "~0.4 day"
dependencies: []
---

# Phase 1: Harness & Auth

## Overview

Dựng khung Playwright chạy được (config + webServer + DB E2E riêng), và flow **setup-once + storageState**: một `setup` project đi qua first-boot wizard trên DB rỗng để tạo admin + seed demo, lưu session; cộng `auth.spec` phủ Login + Logout. Đây là nền cho mọi spec ở Phase 2.

## Requirements

- Functional: `npm run test:e2e` boot được app thật, chạy setup wizard tạo workspace, lưu `storageState`, và pass 1 spec login/logout.
- Non-functional: dùng DB `fourty_e2e` **tách** `fourty_test`; không đụng vitest; không thêm hạ tầng nặng.

## Architecture

**Thứ tự chạy Playwright**: `globalSetup` (chuẩn bị DB) → `webServer` boot (`next build && next start`) → project `setup` (wizard, lưu storageState) → project `smoke` (Phase 2, `dependencies: ['setup']`, `use.storageState`).

**DB E2E** (mirror convention [`vitest.config.ts`](../../vitest.config.ts) + [`tests/pg-setup.ts`](../../tests/pg-setup.ts)):
- `MIGRATE_DATABASE_URL=postgresql://fourty:fourty@localhost:5432/fourty_e2e` — owner, dùng cho migrate + truncate trong globalSetup.
- `DATABASE_URL=postgresql://fourty_app:fourty_app@localhost:5432/fourty_e2e` — RLS subject, app runtime (`next start`).

**globalSetup** (`e2e/global-setup.ts`) — *(Validation S1: tái dùng `resetDb()` + guard)*: set cứng `process.env.MIGRATE_DATABASE_URL` về `fourty_e2e`, **assert DB name chứa `"e2e"`** (guard chống truncate nhầm `fourty_test`), rồi **import và gọi `resetDb()`** từ [`tests/pg-setup.ts:19`](../../tests/pg-setup.ts) — hàm này migrate + `TRUNCATE ... RESTART IDENTITY CASCADE` toàn bộ public table → `isFreshInstall()` trả true để wizard chạy. Không nhân bản logic truncate (DRY).
<!-- Updated: Validation Session 1 - reuse resetDb() with e2e DB-name guard -->

> ⚠️ Footgun đã verify: `resetDb()` default `MIGRATE_DATABASE_URL` = `fourty_test`. **Bắt buộc** override env + guard trước khi gọi, nếu không sẽ truncate DB của vitest.

**webServer**: command `npm run build && npm run start`, `url: http://localhost:3000`, `reuseExistingServer: !process.env.CI`, `timeout: 120_000`, và **`env`** truyền: `DATABASE_URL` (app role), **`FOURTY_INSECURE_COOKIE: "1"`** (bắt buộc — session cookie mặc định `Secure`, sẽ không set qua `http://localhost` nếu thiếu, xem bảng config [`README.md`](../../README.md)), `NODE_ENV: "production"`.

**setup project** (`e2e/auth.setup.ts`, testMatch `**/*.setup.ts`):
- Vào `/` → redirect `/login`; DB rỗng nên [`login/page.tsx`](../../src/app/login/page.tsx) render **mode `setup`** (form có field `name` + checkbox "Load sample data" checked mặc định — xem [`login-form.tsx`](../../src/app/login/login-form.tsx)).
- Fill `input[name=name]`, `input[name=email]`, `input[name=password]` (≥8 ký tự), giữ checkbox seed demo → click **"Create workspace"**.
- Assert điều hướng `/dashboard` (POST `/api/auth/setup` set session + `router.push("/dashboard")`). **Đây chính là test phủ flow Setup.**
- `page.context().storageState({ path: 'e2e/.auth/user.json' })`.
- Lưu creds admin ra biến/hằng dùng chung cho `auth.spec` (email/password cố định trong spec).

**auth.spec** (`e2e/auth.spec.ts`, phủ Login + Logout):
- `test.use({ storageState: { cookies: [], origins: [] } })` — **opt-out** session chung để logout không invalidate session của setup (session per-token; logout xoá đúng token đang dùng).
- DB giờ đã có admin → `/login` render **mode `login`**. Fill email/password admin → click **"Sign in"** → assert `/dashboard`.
- Click logout (điều hướng/menu trong [`shell.tsx`](../../src/components/shell.tsx) → POST `/api/auth/logout`) → assert quay về `/login`.

## Related Code Files

- Create: `playwright.config.ts` — port **3100** riêng, webServer command `build → db:e2e:reset → start`
- Create: `e2e/prepare-db.ts` — *(thay `global-setup.ts`)* migrate/truncate `fourty_e2e` chạy trong webServer command, **trước** `next start`. Lý do: Playwright `globalSetup` chạy **sau** webServer ready → không dùng được để chuẩn bị schema. Reuse `resetDb()` + guard tên DB chứa `"e2e"`.
- Create: `e2e/auth.setup.ts`
- Create: `e2e/auth.spec.ts`
- Create: `e2e/helpers/auth.ts` — creds admin + đường dẫn storageState dùng chung
- Create: `e2e/.auth/` (gitignored, chứa `user.json`)
- Create: `scripts/e2e-db-setup.sh` — idempotent: tạo DB `fourty_e2e` + role `fourty_app` (grants do migrations 0002 cấp) *(Validation S1)*
- Modify: `package.json` — devDep `@playwright/test`; scripts `test:e2e`, `db:e2e:setup`, `db:e2e:reset` (`tsx e2e/prepare-db.ts`)
- Modify: `.gitignore` — `playwright-report/`, `test-results/`, `e2e/.auth/`
- Reference (không sửa): [`vitest.config.ts`](../../vitest.config.ts), [`tests/pg-setup.ts`](../../tests/pg-setup.ts), [`src/app/login/login-form.tsx`](../../src/app/login/login-form.tsx), [`src/app/api/auth/setup/route.ts`](../../src/app/api/auth/setup/route.ts)

## Implementation Steps

1. `npm i -D @playwright/test` rồi `npx playwright install --with-deps chromium` (chỉ Chromium).
2. Viết `scripts/e2e-db-setup.sh` (idempotent `CREATE DATABASE fourty_e2e` + `DO $$ ... CREATE ROLE fourty_app IF NOT EXISTS` + grants) và script `db:e2e:setup`. *(Validation S1)*
3. Viết `playwright.config.ts`: `testDir: 'e2e'`, `globalSetup`, `webServer` (env như trên), `projects: [{name:'setup', testMatch:/.*\.setup\.ts/}, {name:'smoke', dependencies:['setup'], use:{ storageState:'e2e/.auth/user.json' }, testMatch:/.*\.spec\.ts/}]`, `use.baseURL='http://localhost:3000'`, `retries: process.env.CI ? 1 : 0`, reporter `list` + `html`.
4. Viết `e2e/global-setup.ts`: set `process.env.MIGRATE_DATABASE_URL` = `fourty_e2e` → **assert chứa `"e2e"`** → `await resetDb()` (import từ `tests/pg-setup.ts`). *(Validation S1)*
5. Viết `e2e/auth.setup.ts` (wizard + storageState + assert `/dashboard`).
6. Viết `e2e/auth.spec.ts` (opt-out storageState, login → logout).
7. Thêm scripts + cập nhật `.gitignore`.
8. `npm run db:e2e:setup` (một lần) rồi `npm run test:e2e` local, xác nhận setup + auth pass.

## Success Criteria

- [x] `npm run test:e2e` tự boot app, chạy setup wizard, tạo `e2e/.auth/user.json`.
- [x] `auth.setup.ts` land `/dashboard` (Setup pass).
- [x] `auth.spec.ts`: login → `/dashboard`, logout → `/login` (Login+Logout pass).
- [x] DB `fourty_e2e` tách biệt; chạy E2E không phá state `fourty_test` (222 vitest vẫn xanh).
- [x] `.auth/` không bị commit.

## Risk Assessment

- **Cookie không set qua HTTP** → `FOURTY_INSECURE_COOKIE=1` trong webServer.env (đã tính).
- **Wizard không chạy vì DB không fresh** → globalSetup truncate trước webServer boot.
- **Logout làm hỏng storageState chung** → auth.spec opt-out storageState, dùng session riêng.
- **`next build` chậm ở webServer** → chấp nhận (một lệnh); Phase 3 cache ở CI. Local `reuseExistingServer` cho phép dev tự chạy `npm run dev`/`start` sẵn.

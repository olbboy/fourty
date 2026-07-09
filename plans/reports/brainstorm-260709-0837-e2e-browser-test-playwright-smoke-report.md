# Brainstorm — E2E / Browser Test cho Fourty

- **Ngày:** 2026-07-09 08:37 (Asia/Saigon)
- **Loại:** Brainstorm report (skill: `/brainstorm`)
- **Chủ đề:** Tìm giải pháp E2E / browser test cho Fourty
- **Trạng thái:** Đã chốt thiết kế — chờ `/ck:plan`
- **Flags:** none

---

## 1. Problem statement

Fourty có 94 test (37 file vitest) nhưng **toàn bộ `environment: "node"`** — unit + API/RLS/security trên Postgres thật. Không có test nào render UI trong browser thật.

"UI test" hiện tại ([`tests/a11y.test.ts`](../../tests/a11y.test.ts)) chỉ `renderToStaticMarkup` (SSR ra string) + source-scan regex → **không execute event handler, không DOM thật, không JS client-side**.

Hệ quả: các flow client-side phức tạp không có coverage nào chạm tới được về mặt kiến trúc:
- Kanban drag deal giữa stage (optimistic update + forecast).
- ⌘K command palette (keyboard nav + search).
- AI chat drawer (SSE streaming + confirm-before-write).
- First-boot setup, login/logout.

Regression kiểu "kéo deal xong forecast không cập nhật" hoặc "app trắng màn hình sau build" **lọt qua toàn bộ 94 test**.

## 2. Requirements đã chốt (Discovery)

| Mục | Quyết định |
|---|---|
| **Expected output** | Playwright smoke harness: `playwright.config.ts` + `e2e/` (3 spec) + `npm run test:e2e` + 1 CI job + ~3 `data-testid` + 1 DnD helper. |
| **Mục tiêu** | **Smoke critical-path** (không phải coverage rộng). |
| **Nơi chạy** | **CI + local, cùng 1 lệnh** (`next build && next start` + Postgres service; KHÔNG docker-compose ở CI). |
| **Flow P0 Round 1** | Setup + Login + Logout · Kanban drag · ⌘K palette + search. |
| **DB strategy** | **Setup-once + `storageState`**. |
| **AI chat SSE** | **Tách sang Round 2** (kéo theo mock server, giữ Round 1 gọn). |
| **CI gate** | **Non-blocking** (`continue-on-error`) lúc đầu → lật required khi ổn định. |
| **Constraints** | npm · Node 22 · KISS/YAGNI/DRY · không thêm hạ tầng nặng (Redis/compose) · vitest giữ nguyên · AI không tốn tiền/không phụ thuộc mạng. |

## 3. Approaches đã cân nhắc

### Tooling
| Lựa chọn | Pros | Cons | Kết luận |
|---|---|---|---|
| **Playwright** ✅ | Chromium thật; `webServer` auto-boot; trace/video khi fail; GitHub Actions 1 dòng; hợp Next SSR | Thêm devDep + browser cache CI | **Chọn** |
| Cypress | HĐ lớn | Nặng hơn, kém hợp Next SSR/App Router, runner riêng | Loại |
| vitest + jsdom/happy-dom | Không thêm tool | **Không phải browser thật** → vô nghĩa với mục tiêu | Loại |

### DB isolation
| Lựa chọn | Kết luận |
|---|---|
| **Setup-once + storageState** ✅ | Nhanh, ít flaky, vẫn phủ setup/login/logout. **Chọn** |
| Seed + login mỗi spec | first-boot phải có spec riêng, login lặp tốn thời gian |
| Reset sạch mỗi test | Chậm, over-engineer cho smoke |

### App-under-test env
`next build && next start` + Postgres service (nhẹ, khớp CI hiện tại) — **chọn**; docker-compose full stack để dành khi cần sát prod hơn.

## 4. Giải pháp cuối (recommended)

**Bố cục**
- `e2e/` tách khỏi `tests/`. `playwright.config.ts` riêng. Script `npm run test:e2e`.
- Playwright `webServer` boot `next build && next start` → 1 Postgres test DB đã migrate. Một lệnh chạy local + CI.

**DB — setup-once + storageState**
- Playwright **project dependency** `auth`: chạy trên **DB rỗng** → wizard setup thật (tạo admin + seed demo) → lưu `storageState` (session cookie). Đây là cách phủ *first-boot setup*.
- Spec khác `depends on auth` → tái dùng storageState, không login lại.

**3 spec Round 1**
1. `auth.spec.ts` — sau setup vào được `/dashboard`; test **logout → login lại** (phủ Setup + Login + Logout).
2. `kanban.spec.ts` — `/deals`: kéo deal demo sang stage khác; assert card đổi cột **và** tổng cột/forecast cập nhật. Helper `dragCardToStage` **dispatch native DnD event thủ công** (tránh `dragTo()` flaky). Backing behavior: [`deals-client.tsx`](../../src/app/(app)/deals/deals-client.tsx) `moveDeal` → PATCH `/api/deals`.
3. `command-palette.spec.ts` — `Meta+K` ([`shell.tsx:82`](../../src/components/shell.tsx)) → gõ tên contact demo → assert `role="option"` → `Enter` điều hướng.

**Selector**: role/text trước (login labels; palette đã có `role="dialog/combobox/listbox/option"`). Thêm **~3 `data-testid`** chỗ mơ hồ: deal card, stage column, column-total. Sửa component tối thiểu.

**CI**: 1 job mới trong [`ci.yml`](../../.github/workflows/ci.yml), dùng lại Postgres service, cache Playwright browsers, `continue-on-error: true`.

## 5. Touchpoints (files)

**Tạo mới**
- `playwright.config.ts`
- `e2e/auth.spec.ts`, `e2e/kanban.spec.ts`, `e2e/command-palette.spec.ts`
- `e2e/helpers/drag.ts` (native DnD dispatch)
- `e2e/global-setup.ts` hoặc project `auth` (storageState)

**Sửa**
- `package.json` — devDep `@playwright/test` + script `test:e2e`
- `.github/workflows/ci.yml` — job `e2e` (non-blocking)
- `src/app/(app)/deals/deals-client.tsx` — ~2 `data-testid` (card, column, total)
- (tùy) `.gitignore` — `playwright-report/`, `test-results/`, `e2e/.auth/`

**Tái dùng (không sửa)**
- Env test DB theo convention [`vitest.config.ts`](../../vitest.config.ts) / [`tests/pg-setup.ts`](../../tests/pg-setup.ts).
- Seed demo: `npm run db:seed` (demo@fourty.dev / demo1234) hoặc tick "seed demo" trong wizard.

## 6. Risks & mitigation

| Risk | Mitigation |
|---|---|
| **Native HTML5 DnD khó drive** (flaky nhất) | Helper dispatch `dragstart/dragover/drop` + `dataTransfer`; assert qua UI; bật `retries: 1` riêng CI nếu cần |
| First-boot phải chạy trước | Playwright project dependency `auth` đảm bảo thứ tự + DB rỗng |
| CI chậm thêm ~1-2 phút | Cache browsers; job non-blocking nên không chặn |
| Test DB lẫn với vitest DB | Dùng DB/URL riêng cho E2E, migrate độc lập |

## 7. Success metrics / validation

- `npm run test:e2e` **xanh** local + CI (job hiện trên PR, non-blocking).
- 3 flow chạy trong **Chromium thật**.
- Không thêm hạ tầng nặng (không Redis, không docker-compose ở CI E2E).
- vitest suite **không đổi**, vẫn xanh.
- Ước lượng công: **~1 ngày**.

## 8. Scope OUT — Round 1 (để Round 2+)

AI chat SSE (mock OpenAI server) · workflow visual builder · CSV import · 2FA/SSO · custom objects · i18n toggle · mobile/PWA · cross-browser Firefox/WebKit · visual regression · axe a11y automation.

## 9. Next steps

1. `/ck:plan` — lập plan theo phase từ report này.
2. Round 2: thêm AI chat SSE (mock upstream) + mở rộng flow theo ưu tiên.
3. Khi E2E xanh liên tục → lật CI job thành **required**.

## Unresolved questions

- Chọn seed demo qua **wizard tick** hay `npm run db:seed` trong global-setup? (Cả hai khả thi; quyết ở phase plan — wizard đơn giản hơn vì đã cần chạy setup.)
- Có cần cố định 1 deal/contact demo "mốc" để assert ổn định không, hay assert theo pattern động? (Quyết ở phase viết spec.)

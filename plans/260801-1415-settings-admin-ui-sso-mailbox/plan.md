---
title: "Settings admin UI cho SSO + mailbox"
description: "Backlog #11: SSO connections và sync accounts đã có backend nhưng chỉ dùng được qua API. Bổ sung vòng đời còn thiếu của sync account (DELETE/PATCH) rồi dựng hai section Settings điều khiển chúng."
status: completed
priority: P2
branch: "main"
tags: [ui, settings, sso, sync, backlog-11]
blockedBy: []
blocks: []
created: "2026-08-01T07:15:41.000Z"
createdBy: "ck:cook"
source: skill
---

# Settings admin UI cho SSO + mailbox

## Overview

Backlog mục **#11** — SSO (Gate D4, ADR-014) và mailbox connect (Gate C6,
ADR-009) đã ship backend đầy đủ route, RBAC, audit và test, nhưng **không có
giao diện nào lái chúng**. Người tự host phải gọi `curl` để thêm một OIDC
provider hoặc nối một hộp thư. Plan này biến hai tính năng đã build thành dùng
được.

Trên đường đi lộ ra một lỗ hổng thật: sync accounts **chỉ có** `GET`/`POST` ở
collection và ba action theo id (`connect`, `run`, `ingest`). Không có
`DELETE` hay `PATCH` cho một account — thêm được hộp thư nhưng không gỡ, không
tạm dừng, không sửa nhãn. Phase 1 bổ sung vòng đời đó trước, để UI ở Phase 3 có
cái để điều khiển.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Sync account lifecycle API](./phase-01-sync-account-lifecycle-api.md) | Completed |
| 2 | [SSO settings section](./phase-02-sso-settings-section.md) | Completed |
| 3 | [Mailbox settings section](./phase-03-mailbox-settings-section.md) | Completed |

**Thứ tự bắt buộc:** 1 → 3. Phase 2 độc lập (SSO backend đã đủ), có thể làm
song song với 1, nhưng ship tuần tự cho commit sạch.

**Phase 1 thêm API surface mới; Phase 2-3 chỉ thêm UI.** Mỗi phase một commit.

## Trạng thái thực đo (scout 2026-08-01)

### SSO — backend đủ, UI không có

| Route | Method | RBAC | Có |
|---|---|---|---|
| `/api/sso/connections` | GET, POST | `sso:read` / `sso:create` | ✅ |
| `/api/sso/connections/[id]` | GET, PATCH, DELETE | `sso:*` | ✅ |
| Settings UI | — | — | **❌** |

`sso` nằm trong `ADMIN_OBJECTS` (`src/lib/permissions.ts:37`) → non-admin nhận
403. `redactConnection` (`src/lib/sso/connection-view.ts:11`) không bao giờ trả
`clientSecret`, chỉ trả `hasClientSecret`.

### Mailbox — backend thiếu vòng đời, UI không có

| Route | Method | RBAC | Có |
|---|---|---|---|
| `/api/sync/accounts` | GET | *(chỉ `withAuth`)* | ✅ |
| `/api/sync/accounts` | POST | `sync:create` | ✅ |
| `/api/sync/accounts/[id]` | **PATCH, DELETE** | — | **❌ Phase 1** |
| `/api/sync/accounts/[id]/connect` | GET → 302 | `sync:update` | ✅ |
| `/api/sync/accounts/[id]/run` | POST | `sync:update` | ✅ |
| Settings UI | — | — | **❌** |

`sync` **không** phải admin object — member ghi được, viewer thì không.

## Ràng buộc thiết kế

1. **Không thêm runtime dependency.** `package.json` phải không đổi
   (`git diff --stat package.json` rỗng).
2. **Không đổi contract đã công bố.** Response shape của mọi route hiện có giữ
   nguyên. Phase 1 chỉ *thêm* method mới trên một path chưa tồn tại.
3. **Secret không bao giờ ra khỏi server.** `clientSecret` của SSO và mọi khoá
   trong `syncAccounts.config` (`refreshToken`, `password`) đã bị redact ở tầng
   route — UI **không được** thêm đường đọc mới nào.
4. **Section mới theo đúng pattern có sẵn** trong `settings-client.tsx`:
   `card p-4` + `<h2 class="text-sm font-semibold">` + `useCallback` loader +
   `Spinner` khi `null` + `Modal`/`Field` cho form. Không dựng abstraction mới
   cho hai section.
5. **Text tiếng Anh hardcode.** `MembersSection`/`ApiKeysSection`/
   `CustomFieldsSection` đều vậy; chỉ `LanguageSection` dùng `t()`. Theo số
   đông, **không** mở rộng catalog i18n trong plan này.
6. **OAuth connect phải điều hướng trình duyệt thật.** `GET …/connect` trả 302
   kèm cookie httpOnly PKCE — dùng `<a href>` hoặc `location.assign`, tuyệt đối
   không `fetch` (fetch nuốt redirect, cookie không bao giờ tới trình duyệt).

## Bẫy đã biết (từ ADR-017, không phải giả định)

ADR-017 ghi ba chi phí bất ngờ khi migrate contacts. Một cái áp thẳng vào đây:

> **Static guard nhận diện code bằng hình dạng file sẽ mù.**
> `tests/api-auth.test.ts:124` quét *mọi* file route, phân loại "route ghi" bằng
> pattern văn bản, rồi bắt buộc có `authorize(`. Route mới ở Phase 1 phải được
> guard đó **thật sự nhìn thấy**, không phải im lặng bị bỏ qua.

Phase 1 vì vậy có một bước kiểm chứng bắt buộc: cố ý bỏ `authorize()` → guard
phải **đỏ** → khôi phục. Guard không được kiểm chứng là guard giả.

## Acceptance criteria (toàn plan)

- [x] `DELETE /api/sync/accounts/[id]` gỡ account, trả 404 khi không tồn tại,
      ghi audit, chặn bằng `sync:delete`
- [x] `PATCH /api/sync/accounts/[id]` sửa được `label` và `status`
      (`active`/`paused`), trả 404 khi không tồn tại, ghi audit, chặn bằng
      `sync:update`
- [x] `tests/api-auth.test.ts` **nhìn thấy** route mới — đã kiểm chứng bằng cách
      cố ý làm đỏ
- [x] Settings có section SSO: liệt kê, tạo, sửa, xoay secret, bật/tắt, xoá;
      ẩn hoàn toàn với non-admin (403 → không render, như `MembersSection`)
- [x] Settings có section Mailbox: liệt kê + trạng thái, thêm account, nối OAuth
      qua điều hướng trình duyệt, "Sync now", pause/resume, gỡ
- [x] `clientSecret` và mọi secret của `config` không xuất hiện trong bất kỳ
      response nào UI gọi
- [x] Toàn bộ test hiện có pass **không chỉnh sửa** (test mới thì được thêm)
- [x] `npx tsc --noEmit` + `npm run build` xanh
- [x] `git diff --stat package.json` rỗng
- [x] Backlog #11 chuyển sang shipped kèm dẫn chứng

## Kết quả thực đo

| Kiểm | Kết quả |
|---|---|
| Test suite | 406 pass / 2 skip (từ 401/2) — **+5 test, 0 test cũ bị sửa** |
| e2e Playwright | 5/5 |
| `npx tsc --noEmit` | sạch |
| `npm run build` | xanh — **gián tiếp**: webServer của Playwright chạy `next build` rồi boot thành công. Gọi trực tiếp bị hook `scout-block.cjs` của máy dev chặn (pattern `build`), không phải lỗi repo. |
| `package.json` | không đổi |
| Dependency mới | 0 |

### Số dòng

| File | Trước | Sau |
|---|---|---|
| `settings-client.tsx` | 493 | 57 (chỉ compose) |
| `sections/sso.tsx` (mới) | 0 | 224 |
| `sections/mailbox.tsx` (mới) | 0 | 240 |
| `sections/{members,api-keys,custom-fields,language}.tsx` | 0 | 555 (di chuyển nguyên vẹn) |
| `api/sync/accounts/[id]/route.ts` (mới) | 0 | 83 |
| `lib/sync/account-view.ts` (mới) | 0 | 20 |

Tách file diễn ra ở **commit riêng sau** commit tính năng, theo nguyên tắc
ADR-017 đặt ra: đổi hành vi và đổi cấu trúc không nằm chung một commit. Code
reviewer xác nhận bốn panel di chuyển là **byte-identical** ngoài từ khoá
`export`.

### Ba điều rủi ro cao — đã kiểm chứng, không chỉ khai báo

1. **Guard `api-auth` thấy route mới** — gỡ `authorize()` → đỏ, nêu đúng
   `sync/accounts/[id]` → khôi phục → xanh. (Chi phí #1 của ADR-017.)
2. **Smoke render bắt được crash** — cố ý làm hỏng `MailboxSection` → chỉ đúng
   test đó đỏ → khôi phục. Cần thiết vì **không e2e spec nào ghé `/settings`**,
   nên crash ở đây sẽ ship sau một suite xanh.
3. **Empty secret không xoá secret cũ** — khoá bằng test
   `leaves the secret alone when an update omits it` (`tests/sso.test.ts`).

### Quyết định đã chốt trong lúc làm

- **DELETE cascade `emailMessages` + `calendarEvents`.** Hai bảng không có
  reader nào trong `src/` (chỉ ingest ghi), dedup key gồm `accountId` nên vô
  dụng sau khi account biến mất. `activities` khoá theo contact → **không đụng**,
  timeline người dùng còn nguyên. Reviewer verify độc lập là an toàn.
- **`imap` giữ trong dropdown, ghi nhãn "receive only", ẩn nút Sync now.**
  `runMailSync` chỉ nhận google/microsoft; nhánh còn lại đòi `ics` + `url`. Nó
  vẫn nhận thư đẩy qua `/ingest` nên là lựa chọn thật, chỉ không kéo được.
- **`ROLES` chuyển vào `src/lib/permissions.ts`**, `Role` derive từ nó — file đó
  đã giữ type tương ứng và đã dùng đúng pattern này cho `CRM_OBJECTS`.

### Code review

[Báo cáo](../reports/code-reviewer-260801-1859-settings-sso-mailbox-ui-report.md) —
0 Critical, 0 High. Một Medium đã sửa (`e851e77`): pause/resume, enable/disable
và delete nuốt lỗi im lặng, trái tiêu chí "nút ghi trả 403 thì hiện lỗi" của
Phase 3. Panel SSO còn thiếu chỗ hiển thị lỗi ngoài Modal — đã thêm.

## Dependencies

Không có cross-plan dependency — mọi plan trong `plans/` đã `completed`/`done`.

Liên quan (không blocking):
- [`plans/260708-1645-remaining-features-backlog.md`](../260708-1645-remaining-features-backlog.md) mục **#11** — plan này đóng nó
- [ADR-014](../../docs/adr/014-sso-oidc.md) — SSO backend
- [ADR-009](../../docs/adr/009-email-calendar-sync.md) — mail OAuth transport
- Mục **#15** (mã hoá secret at rest) vẫn mở. Plan này **không** đụng tới —
  secret vẫn plaintext trong DB, chỉ redact khi đọc. UI không làm điều đó tệ
  hơn, cũng không tốt hơn.

## Rollback

Mỗi phase một commit độc lập, không squash.

| Tình huống | Thủ tục |
|---|---|
| Route Phase 1 xoá nhầm dữ liệu | Revert commit Phase 1. UI Phase 3 sẽ 404/405 ở nút gỡ — không hỏng gì khác. |
| Section SSO lỗi | Revert commit Phase 2. Backend không đụng tới. |
| Section mailbox lỗi | Revert commit Phase 3, giữ Phase 1 (API vẫn có giá trị độc lập). |

## Câu hỏi chưa giải quyết

1. `GET /api/sync/accounts` hiện **không** gọi `authorize()` — mọi user đã đăng
   nhập đều liệt kê được hộp thư (email + host, không secret). Đúng ý hay là sót?
   Plan này **giữ nguyên** — siết lại là breaking change của contract đã công
   bố, cần quyết định riêng. Đã ghi vào Phase 1 §Risk.
2. `status` của sync account có ba giá trị (`active`/`paused`/`error`) nhưng
   `error` do hệ thống đặt khi `run` thất bại. PATCH chỉ cho đặt
   `active`/`paused` — không cho client tự đặt `error`. Chốt ở Phase 1.
3. Mailbox section nên hiện với member (vì `sync` không phải admin object) hay
   chỉ admin? Nghiêng về **theo RBAC thật**: hiện cho ai `GET` được, ẩn nút ghi
   khi thao tác trả 403. Chốt ở Phase 3.

---
title: "Settings admin UI cho SSO + mailbox"
description: "Backlog #11: SSO connections và sync accounts đã có backend nhưng chỉ dùng được qua API. Bổ sung vòng đời còn thiếu của sync account (DELETE/PATCH) rồi dựng hai section Settings điều khiển chúng."
status: pending
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
| 1 | [Sync account lifecycle API](./phase-01-sync-account-lifecycle-api.md) | Pending |
| 2 | [SSO settings section](./phase-02-sso-settings-section.md) | Pending |
| 3 | [Mailbox settings section](./phase-03-mailbox-settings-section.md) | Pending |

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

- [ ] `DELETE /api/sync/accounts/[id]` gỡ account, trả 404 khi không tồn tại,
      ghi audit, chặn bằng `sync:delete`
- [ ] `PATCH /api/sync/accounts/[id]` sửa được `label` và `status`
      (`active`/`paused`), trả 404 khi không tồn tại, ghi audit, chặn bằng
      `sync:update`
- [ ] `tests/api-auth.test.ts` **nhìn thấy** route mới — đã kiểm chứng bằng cách
      cố ý làm đỏ
- [ ] Settings có section SSO: liệt kê, tạo, sửa, xoay secret, bật/tắt, xoá;
      ẩn hoàn toàn với non-admin (403 → không render, như `MembersSection`)
- [ ] Settings có section Mailbox: liệt kê + trạng thái, thêm account, nối OAuth
      qua điều hướng trình duyệt, "Sync now", pause/resume, gỡ
- [ ] `clientSecret` và mọi secret của `config` không xuất hiện trong bất kỳ
      response nào UI gọi
- [ ] Toàn bộ test hiện có pass **không chỉnh sửa** (test mới thì được thêm)
- [ ] `npx tsc --noEmit` + `npm run build` xanh
- [ ] `git diff --stat package.json` rỗng
- [ ] Backlog #11 chuyển sang shipped kèm dẫn chứng

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

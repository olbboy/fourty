---
phase: 1
title: "Sync account lifecycle API"
status: pending
priority: P2
effort: "S"
dependencies: []
---

# Phase 1: Sync account lifecycle API

## Overview

Sync accounts thêm được nhưng không gỡ, không tạm dừng, không đổi nhãn được.
Phase này bổ sung `PATCH` + `DELETE` trên `/api/sync/accounts/[id]` — path đó
hiện **chưa tồn tại** như một route file (chỉ có các thư mục con `connect`,
`run`, `ingest`, `oauth`), nên đây là thêm mới thuần, không đổi contract nào.

## Requirements

**Functional**
- `PATCH /api/sync/accounts/[id]` — sửa `label` (string ≤120 hoặc null) và
  `status` (`active` | `paused`). 404 khi không tồn tại. Audit
  `sync_account.updated` kèm `meta.fields`.
- `DELETE /api/sync/accounts/[id]` — xoá account. 404 khi không tồn tại. Audit
  `sync_account.deleted` kèm `meta` nhận dạng được (provider + email).
- Cả hai trả account đã redact / `{ ok: true }`, đúng idiom của các route sync
  hiện có.

**Non-functional**
- RBAC: `authorize(auth, "sync", "update")` cho PATCH,
  `authorize(auth, "sync", "delete")` cho DELETE.
- Không đổi `GET`/`POST` ở collection.
- Không thêm dependency.

## Architecture

**Redact dùng chung.** `redact()` hiện là hàm cục bộ trong
`src/app/api/sync/accounts/route.ts:21`. Route mới cần đúng logic đó. Copy lần
thứ hai chính là căn bệnh ADR-017 vừa chữa cho contacts, nên **trích ra**
`src/lib/sync/account-view.ts`, soi gương `src/lib/sso/connection-view.ts` vốn
đã làm đúng vậy cho SSO.

```ts
// src/lib/sync/account-view.ts
export type SyncAccountRow = typeof tables.syncAccounts.$inferSelect;
export function redactAccount(row: SyncAccountRow) { /* nguyên logic cũ */ }
```

`accounts/route.ts` đổi sang import nó; hành vi phải **giống hệt** — `redacts
secrets from account config on read` (`tests/sync.test.ts:131`) phải pass mà
không sửa.

**`status` client đặt được chỉ có hai giá trị.** Bảng cho phép
`active`/`paused`/`error`, nhưng `error` là do `run` đặt khi thất bại
(`…/run/route.ts`). Cho client tự đặt `error` là để nó nói dối về sức khoẻ hệ
thống. Zod enum vì vậy chỉ nhận `["active", "paused"]`.

## Related Code Files

**Create**
- `src/app/api/sync/accounts/[id]/route.ts` — PATCH + DELETE
- `src/lib/sync/account-view.ts` — `redactAccount` trích từ route

**Modify**
- `src/app/api/sync/accounts/route.ts` — bỏ `redact()` cục bộ, import bản chung
- `tests/sync.test.ts` — thêm test vòng đời

## Implementation Steps

1. **Trích `redactAccount`** vào `src/lib/sync/account-view.ts`, đổi
   `accounts/route.ts` sang import. Chạy `npx vitest run tests/sync.test.ts` —
   phải xanh **không sửa test nào**. Đây là refactor thuần, tách khỏi hành vi
   mới ở bước sau.

2. **Viết test đỏ trước** trong `tests/sync.test.ts`, theo pattern
   `describe("mail OAuth run + connect (real routes + Postgres)")` — gọi thẳng
   route handler với `Request` thật:
   - PATCH đổi `label` → đọc lại thấy đổi
   - PATCH đặt `status: "paused"` → đọc lại thấy paused
   - PATCH `status: "error"` → 400 (client không được tự nhận lỗi)
   - PATCH id không tồn tại → 404
   - DELETE gỡ account → GET danh sách không còn nó
   - DELETE id không tồn tại → 404
   - PATCH/DELETE ghi audit đúng key

3. **Viết route** cho xanh. Bám sát `sso/connections/[id]/route.ts` — cùng hình
   dạng `load()` → 404 → `parseBody` → patch object → audit → trả về.

4. **Kiểm chứng guard RBAC thật sự nhìn thấy route mới** (bẫy ADR-017):
   ```bash
   npx vitest run tests/api-auth.test.ts     # phải xanh
   # tạm bỏ dòng authorize() trong route mới:
   npx vitest run tests/api-auth.test.ts     # PHẢI ĐỎ, nêu đúng tên file
   # khôi phục authorize(), chạy lại → xanh
   ```
   Nếu bước giữa **không đỏ**, guard đang mù với route mới → dừng, sửa guard
   trước khi đi tiếp. Đây là điều đã xảy ra thật ở ADR-017 và không ai phát hiện
   cho tới khi đọc tay.

5. **Kiểm RLS/tenant**: thêm assert rằng PATCH/DELETE không chạm được account
   của workspace khác, theo pattern `confines sync accounts + messages to their
   workspace (RLS)` (`tests/sync.test.ts:198`).

## Tests / Validation

```bash
npx vitest run tests/sync.test.ts tests/api-auth.test.ts tests/rbac-matrix.test.ts
npx vitest run                    # full suite
npx tsc --noEmit
npm run build
git diff --stat package.json      # phải rỗng
```

## Success Criteria

- [ ] `redactAccount` dùng chung, `tests/sync.test.ts:131` pass **không sửa**
- [ ] PATCH sửa được `label` + `status`; từ chối `status: "error"` bằng 400
- [ ] DELETE gỡ được; cả hai trả 404 khi không tồn tại
- [ ] Audit ghi `sync_account.updated` / `sync_account.deleted`
- [ ] RBAC chặn đúng; **đã kiểm chứng** guard `api-auth` bắt được route mới
- [ ] Cross-workspace bị RLS chặn
- [ ] Full suite + tsc + build xanh; `package.json` không đổi

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Trích `redact()` làm lệch shape response của GET collection | Trung bình | Bước 1 tách riêng khỏi hành vi mới; test `redacts secrets…` có sẵn là lưới. |
| `tests/api-auth.test.ts` mù với route mới | **Cao** | Bước 4 bắt buộc kiểm chứng bằng cách cố ý làm đỏ. Đây là chi phí #1 mà ADR-017 ghi lại. |
| Xoá account để lại `email_messages` mồ côi | Trung bình | Kiểm quan hệ trước khi viết DELETE. Nếu có FK/`accountId`, quyết định rõ: cascade hay chặn — **ghi vào phase, không im lặng chọn**. |
| `GET` collection vẫn không có `authorize()` | Thấp | Ngoài phạm vi — siết là breaking change. Ghi ở plan §Câu hỏi chưa giải quyết #1. |

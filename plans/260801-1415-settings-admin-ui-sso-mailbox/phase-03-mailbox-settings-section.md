---
phase: 3
title: "Mailbox settings section"
status: pending
priority: P2
effort: "M"
dependencies: [1]
---

# Phase 3: Mailbox settings section

## Overview

Dựng `MailboxSection` lái sync accounts: liệt kê, thêm, nối OAuth, kéo thư thủ
công, tạm dừng, gỡ. Phụ thuộc Phase 1 cho hai thao tác cuối.

## Requirements

**Functional**
- Liệt kê: `provider`, `email`, `label`, `status`, `connected`, `lastSyncedAt`
  (dùng `timeAgo`), `lastError` khi có.
- Thêm account: `provider` (`google`/`microsoft`/`ics`/`imap`), `email`,
  `label` (optional), và `config` **tuỳ provider**:
  - `ics` → `url` (bắt buộc, feed URL)
  - `google`/`microsoft` → `config` rỗng; nối bằng OAuth ở bước sau
  - `imap` → không có transport fetch (backlog #9). Hoặc bỏ khỏi lựa chọn, hoặc
    ghi rõ "chưa hỗ trợ kéo thư" — **chốt ở bước 1 sau khi đọc lại
    `src/lib/sync/transport.ts`**, không đoán.
- "Connect" cho google/microsoft: **điều hướng trình duyệt** tới
  `/api/sync/accounts/{id}/connect`. Chỉ hiện khi `connected === false`.
- "Sync now": `POST …/run`, hiện số email trả về hoặc lỗi 502.
- Pause/resume: `PATCH { status }` (Phase 1).
- Gỡ: `DELETE` (Phase 1), có `confirm()`.

**Non-functional**
- Không hiển thị secret. `redactAccount` chỉ trả `host`/`url` + `connected`.
- Hiện theo RBAC thật: `GET` không yêu cầu quyền nên section hiện cho mọi user
  đăng nhập; nút ghi trả 403 thì hiện lỗi. **Không** tự ẩn theo vai — backend là
  nguồn sự thật duy nhất về quyền.

## Architecture

`MailboxSection()` trong `settings-client.tsx`, cùng pattern Phase 2.

**Điều hướng OAuth là chi tiết dễ sai nhất.** `GET …/connect` trả `302` kèm
`Set-Cookie` httpOnly chứa `{id}:{state}:{verifier}` (`connect/route.ts:57`).
`fetch()` sẽ tự đi theo redirect trong tiến trình JS và **cookie không bao giờ
tới trình duyệt** → callback thất bại CSRF check. Bắt buộc:

```tsx
<a href={`/api/sync/accounts/${a.id}/connect`} className="btn-primary">Connect</a>
```

Không `onClick={() => fetch(...)}`. Ghi comment tại chỗ nêu lý do — nếu không,
lần refactor sau sẽ "dọn" nó thành fetch và hỏng im lặng.

**Form thêm account đổi field theo provider.** Giống `CustomFieldsSection` đổi
field theo `type === "select"` (`settings-client.tsx:242`) — cùng kỹ thuật, chỉ
`useState` cho provider rồi render có điều kiện. Không dựng schema-driven form.

**Kích thước file.** Sau Phase 2 + 3, `settings-client.tsx` khoảng 900 dòng.
Bước 8 đánh giá tách file — **đo trước rồi quyết**, tiêu chí: nếu hai section
mới không dùng chung gì với bốn section cũ (đúng vậy) và file vượt ~800 dòng,
tách `settings-sections/` là giảm phức tạp thật, không phải chia ô cho đẹp.

## Related Code Files

**Modify**
- `src/app/(app)/settings/settings-client.tsx` — thêm `MailboxSection`
- `tests/sync.test.ts` — test hợp đồng UI↔API

**Đọc, không sửa**
- `src/app/api/sync/accounts/route.ts`, `…/[id]/connect/route.ts`, `…/[id]/run/route.ts`
- `src/lib/sync/account-view.ts` (Phase 1), `src/lib/sync/transport.ts`

## Implementation Steps

1. **Đọc `src/lib/sync/transport.ts`** xác định `imap` thật sự làm được gì hôm
   nay, rồi chốt: đưa vào dropdown kèm nhãn trung thực, hay để ngoài. Ghi quyết
   định vào phase này.

2. **Khoá hợp đồng** trong `tests/sync.test.ts`: `GET /api/sync/accounts` trả
   `connected: boolean` và `config` chỉ chứa `host`/`url`; khẳng định
   `refreshToken`/`password` **không** xuất hiện. UI dựa vào đúng hai khoá đó.

3. **Viết `MailboxSection`**: loader + danh sách + badge trạng thái. `status`
   `error` hiện `lastError` — người vận hành cần thấy lý do, đó là toàn bộ giá
   trị của màn hình này.

4. **Form thêm** trong `Modal`, field theo provider (bước 1).

5. **Nút Connect** là `<a href>` kèm comment lý do (xem §Architecture).

6. **Sync now**: POST `…/run`, disable khi đang chạy, hiện `{ emails }` hoặc
   thông điệp lỗi từ body 502.

7. **Pause/resume + Delete** qua route Phase 1.

8. **Đo rồi quyết tách file**: `wc -l src/app/\(app\)/settings/settings-client.tsx`.
   Vượt ~800 dòng thì tách các section thành `settings-sections/*.tsx`, mỗi
   section một file, `settings-client.tsx` chỉ còn compose. Làm hay không —
   **ghi lý do vào report**, không im lặng bỏ qua.

9. **Cập nhật `PageHeader` subtitle** cho đủ SSO + mailbox.

10. **Cập nhật tài liệu**:
    - `plans/260708-1645-remaining-features-backlog.md` #11 → shipped, dẫn file
    - `docs/self-hosting/configuration.md` — trỏ tới Settings thay vì curl, nếu
      file đó đang hướng dẫn qua API
    - `CHANGELOG.md` — mục cho admin UI + hai route sync mới

## Tests / Validation

```bash
npx vitest run tests/sync.test.ts tests/a11y.test.ts
npx vitest run
npm run test:e2e
npx tsc --noEmit
npm run build
git diff --stat package.json
```

Kiểm tay: thêm một account `ics` trỏ tới feed thật, bấm "Sync now", xác nhận
activity xuất hiện; pause; gỡ.

## Success Criteria

- [ ] Test khoá `connected` + `config` chỉ `host`/`url`; secret vắng mặt
- [ ] Thêm / nối OAuth / sync now / pause / gỡ đều chạy qua UI
- [ ] Nút Connect là điều hướng trình duyệt thật, **có comment nêu lý do**
- [ ] `lastError` hiện được cho account lỗi
- [ ] Quyết định về `imap` được ghi rõ, không để dropdown hứa hão
- [ ] Quyết định tách file được ghi kèm số đo
- [ ] Backlog #11 + CHANGELOG cập nhật
- [ ] Full suite + e2e + tsc + build xanh; `package.json` không đổi

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Nút Connect viết bằng `fetch` → cookie PKCE mất, OAuth chết im lặng | **Cao** | `<a href>` + comment tại chỗ. Không test tự động nào bắt được — chỉ kiểm tay ở §Tests. |
| Dropdown chào `imap` mà không kéo được thư | Trung bình | Bước 1 chốt bằng cách đọc `transport.ts`, không đoán. |
| Section hiện cho viewer rồi mọi nút 403 | Thấp | Chấp nhận có ý thức: backend là nguồn sự thật. Lỗi hiện rõ ràng, không nuốt. |
| `settings-client.tsx` thành file 900 dòng khó đọc | Trung bình | Bước 8 đo rồi quyết, kèm tiêu chí viết sẵn — không để "sau này tính". |
| e2e smoke đỏ vì trang Settings đổi | Thấp | Chạy `npm run test:e2e` trước khi commit; smoke chỉ chạm command palette. |

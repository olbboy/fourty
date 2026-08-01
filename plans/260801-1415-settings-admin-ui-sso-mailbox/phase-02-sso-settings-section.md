---
phase: 2
title: "SSO settings section"
status: pending
priority: P2
effort: "M"
dependencies: []
---

# Phase 2: SSO settings section

## Overview

Dựng `SsoSection` trong `settings-client.tsx` lái bốn route SSO đã có. Không
đụng backend — mọi thứ cần thiết đã ship ở Gate D4 (ADR-014).

## Requirements

**Functional**
- Liệt kê connection: `label`, `issuer`, `defaultRole`, trạng thái bật/tắt,
  `hasClientSecret`, `createdAt` (dùng `timeAgo`).
- Tạo connection: `label`, `issuer`, `clientId`, `clientSecret`, `scopes`
  (optional), `defaultRole`, `defaultWorkspaceId` (optional).
- Sửa: đổi `label`/`issuer`/`clientId`/`scopes`/`defaultRole`, **xoay**
  `clientSecret` (để trống = giữ nguyên), bật/tắt `enabled`.
- Xoá, có `confirm()` cảnh báo người đăng nhập qua provider đó sẽ mất đường vào.
- Non-admin: `GET` trả 403 → **ẩn hoàn toàn section**, đúng như
  `MembersSection` làm (`settings-client.tsx:412`).

**Non-functional**
- Không hiển thị, không gửi lại, không suy đoán `clientSecret`. API chỉ trả
  `hasClientSecret: boolean` — UI chỉ được hiển thị đúng cái boolean đó.
- Field bắt buộc khớp zod của route: `label` ≤80, `issuer` là URL ≤400,
  `clientId` ≤400, `clientSecret` ≤1000, `scopes` ≤400,
  `defaultRole` ∈ `admin|member|viewer`.

## Architecture

Một component `SsoSection()` thêm vào `settings-client.tsx`, cùng file với bốn
section hiện có. **Không tách file** — mỗi section hiện tại là một hàm trong
file này, tách một cái ra là phá đối xứng mà không giảm phức tạp thật (YAGNI).

Type khai ở đầu file cạnh `ApiKey`/`Member`:

```ts
type SsoConnection = {
  id: string; label: string; issuer: string; clientId: string;
  scopes: string; enabled: number; defaultWorkspaceId: string | null;
  defaultRole: string; createdAt: number; hasClientSecret: boolean;
};
```

`enabled` là `integer` trong Postgres (`schema.ts:132`) nên tới client là số
`0`/`1`, **không phải boolean** — nhưng PATCH nhận `z.boolean()`. Đọc số, gửi
boolean. Chỗ này dễ sai im lặng, cần một test khoá lại.

**Sửa dùng Modal, không inline.** Form tạo có 7 field — quá nhiều cho hàng
inline kiểu `ApiKeysSection`. Theo `CustomFieldsSection`: nút mở `Modal`, dùng
`Field` + `input.input`. `Modal` đã có `role="dialog"` + `aria-modal` +
`aria-labelledby` (`tests/a11y.test.ts:30`), `Field` đã bọc `<label>` — dùng
đúng primitive là được a11y miễn phí.

## Related Code Files

**Modify**
- `src/app/(app)/settings/settings-client.tsx` — thêm `SsoSection`, render sau
  `MembersSection`
- `tests/sso.test.ts` — thêm test cho hợp đồng UI↔API (xem dưới)

**Đọc, không sửa**
- `src/app/api/sso/connections/route.ts`, `…/[id]/route.ts`
- `src/lib/sso/connection-view.ts`

## Implementation Steps

1. **Khoá hợp đồng trước** trong `tests/sso.test.ts`: khẳng định response của
   `GET /api/sso/connections` chứa `hasClientSecret` và **không** chứa
   `clientSecret`; khẳng định `enabled` về dạng số. Đây là hợp đồng UI dựa vào —
   nếu ai đó đổi `redactConnection`, test phải đỏ chứ không phải giao diện.

2. **Viết `SsoSection`**: state `connections | null`, `adminOnly`, `editing`,
   `showNew`, `error`. Loader `useCallback` + `useEffect`, `403 → setAdminOnly`.

3. **Form tạo** trong `Modal`, submit `POST`, lỗi hiện `error` từ body
   (`(await res.json()).error ?? "Failed"`, đúng idiom `CustomFieldsSection`).

4. **Form sửa** dùng lại đúng `Modal` với giá trị điền sẵn. `clientSecret` để
   trống → **không gửi khoá đó** trong body PATCH (schema `.partial()` nên
   khoá vắng mặt = không đổi). Placeholder ghi rõ "để trống để giữ secret hiện
   tại".

5. **Toggle `enabled`**: PATCH `{ enabled: !Boolean(c.enabled) }`, reload.

6. **Xoá**: `confirm()` nêu hậu quả cụ thể ("người dùng đăng nhập qua provider
   này sẽ không vào được"), rồi DELETE, reload.

7. **Render** `<SsoSection />` trong `SettingsClient` ngay sau `<MembersSection />`
   — cả hai đều admin-only, đứng cạnh nhau là đúng nhóm.

8. **Cập nhật subtitle** của `PageHeader`: hiện ghi "Team, custom fields, API
   access, and data tools." → thêm SSO. (Mailbox thêm ở Phase 3.)

## Tests / Validation

```bash
npx vitest run tests/sso.test.ts tests/a11y.test.ts
npx vitest run
npx tsc --noEmit
npm run build
```

Kiểm tay trên máy chạy thật: thêm một connection trỏ tới issuer giả, xác nhận
nó hiện ở trang login, tắt đi, xác nhận nó biến mất, rồi xoá.

## Success Criteria

- [ ] Test khoá `hasClientSecret` + vắng `clientSecret` tồn tại và pass
- [ ] Tạo / sửa / xoay secret / bật-tắt / xoá đều chạy qua UI
- [ ] Để trống secret khi sửa **không** ghi đè secret cũ
- [ ] Non-admin không thấy section (không phải "thấy rồi báo lỗi")
- [ ] `clientSecret` không xuất hiện trong DOM hay bất kỳ response nào
- [ ] Dùng `Modal`/`Field` sẵn có nên không phát sinh nợ a11y
- [ ] Full suite + tsc + build xanh

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Gửi `clientSecret: ""` khi sửa → xoá mất secret, SSO chết im lặng | **Cao** | Bước 4: chuỗi rỗng thì **bỏ hẳn khoá** khỏi body. Test khoá lại hành vi này. |
| `enabled` số vs boolean lệch nhau → toggle không ăn | Trung bình | Bước 1 khoá kiểu trong test hợp đồng. |
| Sửa `issuer` của connection đang dùng làm hỏng đăng nhập | Trung bình | Ngoài tầm UI ngăn được — đặt cảnh báo trong form sửa. Backend đã strip trailing slash. |
| `settings-client.tsx` phình quá to | Thấp | 493 → ~700 dòng. Vẫn là một file phẳng gồm các section độc lập. Tách chỉ khi Phase 3 đẩy nó vượt xa hơn — quyết định ở Phase 3, không đoán trước. |

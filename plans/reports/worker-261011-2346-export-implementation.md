# Báo cáo Phase 1 export

Status: DONE

## Summary

Đã triển khai export CSV an toàn và đúng quyền trong phạm vi ownership:

- Giữ `toCsv` raw serializer và thêm `toSpreadsheetCsv` với UTF-8 BOM, RFC quoting và trung hòa prefix công thức ASCII/full-width sau leading whitespace; number âm vẫn giữ dạng số.
- Thêm `canReadField` dùng chung cho field policy; export lọc cột trước khi dựng header/cell, gồm field derived `deals.stage`/`stageId`.
- Thêm `company-query.ts` với normalize allowlist, policy searchable/filter/sort fail-closed, sort tie-breaker `id`, fallback `id_asc` cho default sort hidden và selected IDs tối đa 500.
- Export gọi cả `authorize(auth, "export", "read")` và `authorize(auth, entity, "read")`; Companies hỗ trợ `all|filtered|selected`, Contacts/Deals giữ `all` only; filtered export bỏ pagination params và dùng predicate/order helper chung.
- Selected Companies bị từ chối khi `id` bị ẩn với role hiện tại, tránh dùng known ID để suy ra các field readable; `all` vẫn hoạt động và admin vẫn selected được.
- Bổ sung test raw CSV, spreadsheet safety, helper contract và real-Postgres scope/RLS/field-policy/auth tests.

## Tests

- `npm test -- --run tests/csv.test.ts tests/company-query.test.ts`: 22/22 xanh.
- `DATABASE_URL=postgresql://fourty_app:fourty_app@localhost:55447/fourty_test MIGRATE_DATABASE_URL=postgresql://fourty:fourty@localhost:55447/fourty_test npm test -- --run tests/export.test.ts`: 10/10 xanh.
- `npx tsc --noEmit`: không còn lỗi ở các file Phase 1; workspace lúc kiểm tra còn thiếu `src/app/(app)/companies/companies-client.tsx` do Phase 2 đang được root triển khai.

## Concerns/Blockers

- Chưa sửa docs guide về giới hạn spreadsheet theo yêu cầu ownership; cần owner docs bổ sung ghi chú không hứa bảo vệ mọi thao tác lưu/mở lại và evidence phiên bản spreadsheet đã kiểm chứng.
- Không chạy toàn bộ DB regression suite trong worker để tránh tranh chấp container với controller; export suite đã chạy trên container backup do controller cung cấp.

# Search policy Phase 3

Status: DONE_WITH_CONCERNS

## Summary

Đã cập nhật `src/app/api/search/route.ts` để tải field policy trước khi dựng
predicate. Contacts chỉ tìm trên firstName/lastName/email; phép ghép tên chỉ
được dùng khi cả hai phần readable. Companies chỉ tìm name/domain và deals chỉ
tìm name. Entity không còn target searchable hoặc có id không readable sẽ bị
bỏ qua. Projection giữ `{results}` với `type`, `id`, `title`, `subtitle`, ghép
chỉ các field được phép, có fallback contact `jobTitle`, company `industry`, và
chỉ hiển thị deal amount khi amount/currency cùng readable. Search tiếp tục đi
qua `withAuth`, `authorize` và RLS workspace.

Đã thêm `tests/search.test.ts` dùng handler thật và Postgres/RLS, bao gồm visible
control cho member/viewer, hidden-only query, composite/fallback, no-target,
hidden-id và cross-workspace.

## Tests

- Không chạy Vitest/DB tests theo yêu cầu controller vì `resetDb()` có thể tranh
  chấp với isolated Postgres port 55447.
- `npx tsc --noEmit --pretty false` không báo lỗi trong route hoặc test search;
  toàn repo vẫn có lỗi sẵn từ `src/app/(app)/companies/companies-client.tsx`
  (`CompaniesTable` thiếu prop `onPreview`) do worker khác.
- `git diff --check` qua.

## Concerns/Blockers

- Worktree ban đầu chưa có `tests/search.test.ts`, nên không có red run trung
  thực trước implementation; test được thêm ngay sau khi route đã sửa. Không
  ghi nhận green DB run trong worker này; controller cần chạy suite độc lập.

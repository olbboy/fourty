# Pipeline Settings UI

Status: DONE_WITH_CONCERNS

## Summary

- Đã tạo `src/app/(app)/settings/pipeline-settings.tsx` với load/error/retry/empty state, chọn pipeline, tạo/đổi tên/đặt mặc định/xóa pipeline và CRUD/reorder stage qua API thật.
- Đã nối panel vào Settings, chuyển toàn bộ select trong Settings sang `src/components/select.tsx`, bổ sung catalog en/vi và E2E mock tests tại `e2e/pipeline-settings.spec.ts`.
- Reorder chờ `PATCH` thành công rồi refetch; response `{ stages }` được chấp nhận, lỗi server giữ nguyên thứ tự đang hiển thị.

## Validation

- `npx tsc --noEmit --pretty false` — pass.
- `npx vitest run tests/i18n.test.ts` — 9 tests pass.
- `npx playwright test e2e/pipeline-settings.spec.ts --project=smoke --list` — 5 UI tests được discover.
- `git diff --check` — pass.

## Concerns/Blockers

- Playwright runtime chưa chạy vì port `3100` không có server sẵn; không tự khởi động hoặc reset DB theo phạm vi công việc.
- `npm run lint` của repo gọi `next lint` và dừng ở prompt cấu hình ESLint, nên chưa có kết quả lint tự động.

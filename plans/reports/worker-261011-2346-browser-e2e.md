# Bàn giao browser E2E Companies / restricted session

## Status

DONE_WITH_CONCERNS

## Đã làm

- Tạo `e2e/companies.spec.ts` với journeys browser/API thật cho pagination 50
  dòng, query/filter/sort, saved view, selection theo trang, ba scope export,
  preview giữ URL/selection, full detail + back, stale response/retry,
  mobile filters/nav, focus trap/restore, sidebar keyboard clamp và layout.
- Tạo `e2e/helpers/restricted-session.ts`.
  Helper chỉ chấp nhận `MIGRATE_DATABASE_URL` trỏ đúng database tên
  `fourty_e2e`, không đưa DSN/password vào lỗi hoặc log; seed user viewer,
  membership, field policy và 55 row paging bằng owner connection.
- `e2e/auth.setup.ts` gọi helper sau admin wizard rồi đăng nhập restricted user
  qua form `/login`, ghi `e2e/.auth/restricted.json`; không spoof cookie.
- `e2e/command-palette.spec.ts` kiểm API/browser rằng company `name`/`domain`
  ẩn không trở thành predicate/result và deal `amount` ẩn không xuất subtitle.

## Selector assumptions đã bàn giao cho UI owner

Spec dùng accessible contract của Phase 2/3: `Next page`, `Previous page`,
`Industry`, `Sort`, `+ Save view`, `New view name`, `Selected`, `Filtered
results`, `All companies`, `Preview`, dialog `Company preview`, `Full detail` /
`View full details`, mobile `Filters`, `Retry`, và `role=separator` accessible
name chứa `sidebar`. Report UI owner đã ghi rõ đây là contract đề xuất; nếu
copy được duyệt đổi thì cập nhật spec cùng lúc.

## Validation

- `npx tsc --noEmit --pretty false` đã chạy, không có lỗi trong các file E2E mới
  hoặc file bị sửa. Lệnh còn báo 7 lỗi có sẵn trong
  `tests/company-query.test.ts` về union narrowing (`CompanyQueryValidation`),
  do worker Phase 1/2 đang triển khai; không sửa ngoài ownership.
- Import/runtime smoke thuần cho `hashPassword` đã qua; không mở pool kết nối.
- Chưa chạy Playwright, chưa boot server, chưa reset/ghi DB theo yêu cầu
  controller chờ UI Phase 2/3 ready. Controller đã xác nhận backup E2E.

## Concerns / assumptions

- Paging fixture thêm 55 company tên `E2E Pagination NN`; owner fixture gắn
  `app.workspace_id` trước mọi ghi tenant để tương thích FORCE RLS.
- Restricted policy ẩn `companies.name`, `domain`, `updatedAt`,
  `annualRevenue` và `deals.amount`, giữ `id` readable để kiểm selection/link.
- Bổ sung workspace/viewer riêng `e2e-id-hidden` với policy chỉ ẩn
  `companies.id`; browser kiểm row vẫn hiện dữ liệu readable nhưng không có
  checkbox, Preview hoặc detail link. Storage state là
  `e2e/.auth/restricted-id-hidden.json`, không ảnh hưởng viewer chính.
- `companyRow` lấy id từ `data-company-id` hoặc link `/companies/:id`; UI cần
  giữ một trong hai cách expose id khi field id readable.
- UI agent cần giữ row action là button `Preview`, checkbox không kích hoạt row,
  và export menu phát request `/api/export/companies` với `scope`/params theo
  plan.

## Harness adjustments

- Offset URL thiếu tham số được coi là `0` trong browser assertions; test không
  ép client serialize `offset=0`.
- BOM export kiểm raw response bytes `[0xef, 0xbb, 0xbf]` bằng
  `APIResponse.body()`, sau đó mới decode CSV; không dùng `Response.text()` để
  suy luận BOM.

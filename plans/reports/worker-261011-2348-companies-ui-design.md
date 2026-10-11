# Thiết kế bàn giao Companies UI

Ngày: 2026-10-11 (Asia/Saigon)

Phạm vi ghi chú này là chuẩn bị cho Phase 2 và phần Companies của Phase 3. Sau
khi controller xác nhận contract Phase 1, các điểm bàn giao dưới đây đã được
triển khai trong list client và preview.

## Contract client dự kiến

- List URL là nguồn sự thật cho `q`, `industry`, `sort`, `offset`, `limit`.
- UI luôn gửi `limit=50`; request legacy không có query vẫn do server giữ
  default 200. `offset` reset về 0 khi q/industry/sort hoặc saved view đổi.
- Sort allowlist dùng đúng sáu giá trị server: `updatedAt_desc`,
  `updatedAt_asc`, `name_asc`, `name_desc`, `annualRevenue_desc`,
  `annualRevenue_asc`.
- `preview` là URL state riêng. Nó không nằm trong list query key, không làm
  refetch list và không xóa selection. Query/workspace đổi thì xóa preview.
- Response client phải chấp nhận row partial khi field policy xóa bất kỳ key
  nào, kể cả `id`, `name`, `updatedAt` và `annualRevenue`. Không dựng field
  thiếu từ cache hoặc đổi số thiếu thành 0.

## Selection và export

- Selection là `Set<string>` của ID readable trên trang hiện tại. Header checkbox
  chọn/bỏ chọn đúng các row hiện tại và có trạng thái indeterminate.
- Query/page/workspace đổi thì clear selection. Mở, đổi hoặc đóng preview không
  clear selection.
- Ba action export dùng contract Phase 1:
  - `selected`: `scope=selected` và danh sách ID đang chọn, tối đa 500.
  - `filtered`: `scope=filtered` cùng q/industry/sort, không gửi offset/limit.
  - `all`: `scope=all`, không gửi filter.

## Preview interface với platform

`CompanyPreview` nhận `id: string | null` và `onClose`; `companies-client` sở hữu
URL push/replace để mở hoặc đổi record. Component tự fetch
`GET /api/companies/:id` bằng AbortController + generation guard, phân biệt
loading, ready, 404/forbidden, retryable error và closed. DTO trả về là partial;
full-detail link chỉ render khi response có id readable.

Platform Modal/Drawer primitive cần expose dialog label, focus trap, Escape và
restore trigger. Khi trigger đã biến mất sau query/page đổi, restore về heading
hoặc list container hợp lệ. Companies client giữ URL list nguyên vẹn khi đóng
preview; deep link `preview=<id>` đóng về `/companies` với query hiện tại.

## Selector/accessibility contract đề xuất

Ưu tiên role và accessible name; chỉ thêm test id ở các node không định danh được
bằng role:

- `getByRole('heading', { name: 'Companies' })` cho page heading/list fallback.
- `getByRole('textbox', { name: /search companies/i })` cho search.
- `getByRole('combobox', { name: /industry|sort/i })` cho filter và sort.
- `getByRole('checkbox', { name: /select all companies|select company/i })`
  cho selection.
- `getByRole('button', { name: /preview/i })` trên row khi ID readable;
  row không có ID không render action.
- `getByRole('dialog', { name: /company preview/i })` cho drawer/dialog; close
  bằng Escape và nút có accessible name.
- Pagination dùng `getByRole('button', { name: /previous|next/i })`; trạng thái
  disabled phản ánh `offset`/`hasMore`.
- Error state có `role="alert"` và button tên `Retry`; no-data và no-results
  dùng heading/copy riêng.

Browser spec hiện có đã dùng thêm các contract cụ thể: `Next page`, `Previous
page`, `1 selected`, `+ Save view`, export menu item `Selected`/`Filtered
results`/`All companies`, preview link `Full detail`/`View full details`, và
sidebar resize `role="separator"` với accessible name chứa `sidebar`. Client
phải giữ đúng các accessible names này hoặc cập nhật spec cùng lúc nếu copy đã
được controller duyệt thay đổi.

## Trạng thái cần test thuần

Pure helper/client tests nên khóa serialization query, reset offset, loại
`preview` khỏi query key, export URL của ba scope, selection chỉ nhận ID của
trang hiện tại, và stale generation không commit response cũ. Integration/API
tests tiếp tục thuộc route/backend owner.

## Kết quả triển khai

- `companies-client` dùng URL làm nguồn query, gửi giới hạn 50, có pagination,
  selection theo trang, saved views, ba scope export, mobile draft/apply/reset,
  retry và AbortController/generation guard.
- `companies-table` không dựng affordance khi `id` bị redact; các field partial
  thiếu hiển thị trung tính, revenue bằng 0 vẫn được giữ nguyên.
- `company-preview` giữ query/selection khi mở, dùng `preview=<id>`, đóng bằng
  replace về list và dùng Drawer focus scope dùng chung; link chi tiết chỉ hiện
  khi response có id readable.
- `tests/company-list-query.test.ts` khóa query và export URL. Typecheck, a11y,
  i18n và pure suites đã xanh; real-PG suites không chạy được trong worker vì
  PostgreSQL yêu cầu mật khẩu khác với môi trường hiện tại.

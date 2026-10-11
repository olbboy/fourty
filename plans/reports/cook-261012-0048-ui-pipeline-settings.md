# Thực thi UI controls và Pipeline Settings

Kế hoạch: [UI controls và Pipeline Settings](../261012-0048-ui-pipeline-settings/plan.md).
Branch: `codex/sales-crm-improvements`.

## Kết quả

- Chuẩn hóa Select và Dropdown bằng `@radix-ui/react-select` và
  `@radix-ui/react-dropdown-menu`; toàn bộ native select trong `src` đã chuyển
  sang shared primitive. Keyboard, Escape, focus restore, outside click,
  collision và nhãn dài trên mobile có browser coverage.
- Settings quản lý pipeline và stage thật: tạo, đổi tên, đặt mặc định, xóa,
  thêm/sửa/xóa/reorder stage, lỗi có thể retry và viewer chỉ đọc.
- REST API pipeline/stage áp RBAC, RLS, audit, validation và conflict khi resource
  đang được deal tham chiếu. Mutation đồng thời được serialize; sửa xác suất
  stage tính lại deal score theo batch 200 deal và khóa row để tránh stale score.
- Deal mới tôn trọng pipeline mặc định; đổi pipeline reset stage hợp lệ; duplicate
  submit và lỗi mạng không làm mất dữ liệu form.
- Local review chạy production build tại `http://localhost:3000/settings`, dùng
  database review hiện có; không còn Next Dev Tools phủ giao diện.

## Validation

- `npx tsc --noEmit`: đạt.
- Focused backend/RBAC/RLS: 6 files / 57 tests đạt.
- Full Vitest trên PostgreSQL cách ly: 44 files / 307 tests đạt.
- `npm run build`: đạt. Warning dynamic dependency trong `src/lib/otel.ts` là
  warning baseline, không phải build error.
- Full Playwright trên database E2E cách ly: 41/41 đạt, không retry ở lượt cuối.
- `git diff --check`: đạt.
- Review cuối backend và UI: không còn finding P0-P3 có thể hành động.

## Runtime

Production server được giữ chạy trên cổng 3000 để người dùng review. PostgreSQL
review container chỉ bind local ở cổng 55447; các suite mutation dùng database
`fourty_pipeline_261012`, `fourty_pipeline_e2e_261012` và `fourty_revtest`, không
reset database review.

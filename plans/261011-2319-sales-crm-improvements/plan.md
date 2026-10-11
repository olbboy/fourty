---
title: "Cải tiến CRM theo Companies-first"
description: "Adapt các pattern Companies-first từ sales-crm vào Fourty mà vẫn giữ nguyên Postgres, RLS, field policy và stack hiện tại."
status: completed
priority: P1
effort: "8-12 ngày kỹ sư (ước lượng)"
branch: "detached@24997d2ff6ff72030265788ea966632ea7b0c352"
tags: [feature, frontend, backend, api, auth]
blockedBy: []
blocks: []
created: 2026-10-11
---

# Cải tiến CRM theo Companies-first

## Kết quả cần đạt

Fourty có export CSV an toàn và đúng quyền; Companies list có query server, total/pagination, saved views, selection/export rõ phạm vi; người dùng xem nhanh công ty mà không mất state danh sách; shell/CmdK dễ dùng hơn trên desktop, mobile và bàn phím. Đây là adaptation để productionize pattern từ source demo, không phải tuyên bố source đã có pagination, authorization hay backend production.

## Phạm vi và ranh giới

- Giữ Next 15, React 19, Tailwind 4, Drizzle/Postgres, RLS, auth/RBAC/field policy; không dependency runtime mới và không migration.
- Không bulk delete, metric giả, notification service, profile/owner leak, image upload, mở rộng Tasks/Reports hoặc sao chép asset nhạy giấy phép.
- Raw `toCsv` vẫn round-trip như hiện tại; spreadsheet safety chỉ áp tại export boundary và số âm kiểu number vẫn là số.
- Nếu sao chép phần mã đáng kể từ `sales-crm`, giữ MIT notice của Kargul Studio và provenance SHA `2bb85561794d21d2af67aa7c366f40ec1ef961ee`. Baseline Fourty: `24997d2ff6ff72030265788ea966632ea7b0c352`.

## Dòng dữ liệu mục tiêu

`URL/saved view -> validate query + field policy -> RLS query/count/facets trong một SQL statement -> redact -> {companies,page,facets?} -> table/selection/preview`. Export đi qua cùng query semantics nhưng bỏ pagination: `scope -> authorize export + entity + policy -> RLS rows -> permitted columns -> spreadsheet-safe CSV`. CmdK áp policy cho cả predicate và projection.

## Facts và assumptions xếp hạng

1. **Fact/critical:** `withAuth` chỉ auth/rate-limit/context/RLS; export hiện không gọi object authorization hay field policy.
2. **Fact/critical:** Companies hiện trả `{companies}`, mặc định 200/tối đa 500 và chưa có offset/total; field bị cấm đọc bị xóa, không đổi thành `null`.
3. **Fact/high:** `/api/search` chưa load field policy; richer CmdK phải sửa seam này trước khi render metadata.
4. **Fact/high:** `node_modules` chưa có; phiên lập kế hoạch chỉ có probe Node chứng minh `=1+1` chưa được escape, chưa chạy test/build/E2E.
5. **Assumption/high:** offset pagination với default cũ 200 và metadata bổ sung là cách tương thích nhỏ nhất. Nếu benchmark query/count không đạt, dừng để replan cursor thay vì đổi contract âm thầm.
6. **Assumption/medium:** page size 50 cho UI đủ cho thao tác; xác nhận qua E2E và dữ liệu lớn trước release.

## Phases và dependencies

Thực thi hoàn tất ngày 2026-10-12: `ak plan status` xác nhận **4/4 phase, 19/19 acceptance, 100%** từ checklist trong các phase. Bảng dưới giữ trạng thái lúc lập kế hoạch; kết quả hiện hành và giới hạn lint baseline có trong [báo cáo thực thi](../reports/cook-261011-2346-sales-crm-execution.md).

| # | Phase | Owner | Depends on | Trạng thái lúc lập kế hoạch |
|---|---|---|---|---|
| 1 | [Export an toàn và đúng quyền](./phase-01-export-an-toan-va-dung-quyen.md) | Backend/security | — | Pending |
| 2 | [Companies query và list UX](./phase-02-companies-query-va-list-ux.md) | Full-stack Companies | 1 | Pending |
| 3 | [Preview, shell và CmdK](./phase-03-preview-shell-va-cmdk.md) | Frontend/platform | 2 | Pending |
| 4 | [Hardening, kiểm thử và tài liệu](./phase-04-hardening-kiem-thu-va-tai-lieu.md) | QA/docs | 1-3 | Pending |

## Acceptance toàn kế hoạch

- [x] Hidden field không xuất CSV, không tham gia filter/sort/facet/search predicate hoặc metadata; DTO đọc chấp nhận field vắng, hidden numeric render “—”/omitted, không thành `0`.
- [x] Selected = ID đang chọn trên trang hiện tại; filtered = toàn bộ kết quả query; all = toàn workspace. Query/workspace đổi thì selection và preview cũ bị xóa.
- [x] Response chậm bị abort/ignore; no-data, no-results và retryable error là ba state khác nhau.
- [x] Preview/id cross-workspace trả 404; dialog/drawer trap focus và restore trigger; full detail route vẫn hoạt động.
- [x] Unit + real-Postgres integration + Playwright hẹp qua; sau đó `npm test` và `npm run build` qua. Không có schema/migration mới.

## Rollback chung

Tách commit sửa quyền/CSV ở Phase 1 và search policy ở Phase 3 khỏi commit UX/query. Rollback theo thứ tự UI rồi API additive, luôn giữ security baseline; nếu bản sửa export/search không thể hoạt động an toàn thì vô hiệu endpoint tạm thời thay vì khôi phục route bị lộ field. Không revert mù toàn Phase 1/3. Không đổi schema nên không có data migration để rollback; URL export legacy giữ scope all, nhưng byte CSV và field visibility được sửa có chủ đích.

## Bằng chứng

- [Thực thi, kiểm thử và review hoàn tất](../reports/cook-261011-2346-sales-crm-execution.md)
- [Packet Xia](../reports/xia-261011-2319-sales-crm-improvements.md)
- [Khảo sát source](../reports/researcher-261011-2319-sales-crm-source.md)
- [Khảo sát UI local](../reports/scout-261011-2319-local-crm-ux.md)
- [Khảo sát contracts local](../reports/scout-261011-2319-local-crm-contracts.md)

## Review và validation

Ba reviewer độc lập đã rà security, failure modes và assumptions. Chín findings (có hai góc nhìn liên quan snapshot) được đối chiếu source và xử lý trong phases: hidden-field search predicate; snapshot rows/count; rollback giữ security; E2E chạy app mới; geometry sidebar; DTO thiếu field cấu trúc; export kiểm cả entity; offset không hứa snapshot xuyên request; fixture browser restricted-role. Đây là chỉnh contract kỹ thuật, không đổi stack hoặc scope sản phẩm.

Phần kiểm chứng tài liệu và quyết định lúc lập kế hoạch: [review/validation](../reports/review-261011-2319-sales-crm-plan.md). Khi lập kế hoạch ngày 2026-10-11, các phase còn pending và chưa chạy test/build. Sau triển khai, 43 files / 288 Vitest tests và 28 Playwright tests đều qua trên PostgreSQL thật; build production qua, benchmark 10k và spreadsheet import được ghi trong báo cáo thực thi. Lint vẫn chưa qua vì baseline chưa có cấu hình ESLint; không ghi nhận là pass. Không thêm dependency hoặc migration, không có câu hỏi sản phẩm còn mở.

## Bàn giao

`/ak:cook ~/.codex/worktrees/0747/fourty/plans/261011-2319-sales-crm-improvements/plan.md`

Plan là nguồn trạng thái thực thi. CLI lưu ID UTC `fourty/261011-1629`, trỏ đúng thư mục mang timestamp phiên địa phương `261011-2319`; không có đường dẫn scaffold tạm còn được dùng.

<!-- slug: sales-crm-improvements -->

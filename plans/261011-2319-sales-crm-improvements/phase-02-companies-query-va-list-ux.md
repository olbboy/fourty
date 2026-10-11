---
title: "Phase 2: Companies query và list UX"
status: todo
priority: P1
effort: "3-4 ngày kỹ sư (ước lượng)"
owner: "Full-stack Companies"
depends_on: [1]
---

# Phase 2: Companies query và list UX

## Mục tiêu

Nâng Companies thành surface chính: server filter/sort/count/page, saved views, selection trang hiện tại, export scope rõ, mobile filters và state lỗi có thể phục hồi. Response cũ vẫn đọc được.

## Bối cảnh đã kiểm chứng

- GET hiện nhận `q/industry/limit`, sort cố định và trả `{companies}`: [route.ts](~/.codex/worktrees/0747/fourty/src/app/api/companies/route.ts:11).
- Client chỉ gửi `q`, dùng `array.length` làm tổng và spinner có thể treo khi lỗi: [companies-client.tsx](~/.codex/worktrees/0747/fourty/src/app/(app)/companies/companies-client.tsx:19).
- Saved view đã chứa `filters/sort/columns`: [saved-views.tsx](~/.codex/worktrees/0747/fourty/src/components/saved-views.tsx:5).

## File ownership

| Hành động | Đường dẫn tuyệt đối | Trách nhiệm |
|---|---|---|
| Modify | `~/.codex/worktrees/0747/fourty/src/app/api/companies/route.ts` | Query/count/facets/page response và anti-leak |
| Modify | `~/.codex/worktrees/0747/fourty/src/app/(app)/companies/page.tsx` | Cấp workspace key để reset state khi active workspace đổi |
| Modify | `~/.codex/worktrees/0747/fourty/src/app/(app)/companies/companies-client.tsx` | URL state, controls, table, selection/export, error/retry/race |
| Modify | `~/.codex/worktrees/0747/fourty/src/lib/types.ts` | Thêm DTO đọc Companies cho phép field bị redact; giữ `Company`/mutation types hiện có |
| Create | `~/.codex/worktrees/0747/fourty/tests/companies-list.test.ts` | Real-PG contract, policy, pagination, tenant |

`SavedViewsBar` được reuse qua public props hiện có, không fork persistence và không sửa file của component.

## API và query semantics

- Giữ top-level `companies`; thêm `page: {offset, limit, total, hasMore}` và optional `facets: {industries}`. Request không có params vẫn dùng default 200/max 500 như trước; UI mới gửi `limit=50`.
- Validate `offset >= 0`, limit integer/max 500; sort allowlist: `updatedAt_desc|updatedAt_asc|name_asc|name_desc|annualRevenue_desc|annualRevenue_asc`. Sort ổn định thêm `id` tie-breaker. Nếu client không gửi sort mà `updatedAt` bị ẩn, fallback fail-closed về `id_asc`; nếu client yêu cầu rõ sort trên field hidden thì trả 403.
- Rows, count và facet dùng **một SQL statement** (CTE/subquery) trong workspace transaction để cùng snapshot, kể cả trang rỗng khi offset vượt total. Không suy ra nhiều SELECT trong `withWorkspace` đã cùng snapshot: wrapper không nâng isolation; xem [PostgreSQL 16](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED). Facet industry dùng cùng q/base scope, chỉ xuất khi `industry` readable; không có value workspace khác.
- `q` chỉ OR trên field readable trong name/domain/industry; q không rỗng mà không còn field searchable trả 403 với lỗi chung, không bỏ predicate để trả tất cả. Filter/sort field hidden trả 403; không tính rồi mask kết quả vì count/order cũng là side channel.
- Missing numeric field do redaction render “—”; tuyệt đối không `?? 0` hay biểu đồ/metric suy ra.
- Giữ chính sách cho phép ẩn field bất kỳ. DTO đọc là partial theo redaction: khi `id` vắng, row không có selection/preview/detail link và không dựng ID từ cache; key render chỉ là vị trí cục bộ của response, không là định danh thao tác. Khi `name` vắng dùng nhãn trung tính đã dịch; `updatedAt` vắng không gọi date formatter. Giá trị revenue thật bằng 0 vẫn hiển thị 0. Không đổi field-permissions admin API để ép mở các field này.
- Đây là contract bổ sung của Fourty để productionize pattern. Source demo không có server pagination/authorization và không được ghi như có.

## State machine và UX

- URL là nguồn sự thật cho `q,industry,sort,offset,limit`; list query key chỉ gồm các trường này + workspace key, **không gồm `preview`**. Saved view apply cập nhật cùng query contract, reset offset về 0; không chứa record snapshot/selection/preview.
- Fetch dùng `AbortController` và generation guard. Query mới abort request cũ; response cũ không được commit. Lỗi có retry và giữ query; loading, no-data (workspace chưa có công ty), no-results (filter không khớp), error là state riêng.
- Desktop toolbar và mobile filter dialog dùng cùng draft/apply/reset logic; active filter count và result total lấy server. Page đổi/query đổi/workspace key đổi thì clear selection và đóng preview cũ.
- Checkbox header chọn **trang hiện tại**; indeterminate đúng. Không có trạng thái “select mọi trang”. Toolbar ghi rõ số selected và ba lựa chọn export: Selected, Filtered results, All companies.
- Export Selected truyền ID đang chọn; Filtered truyền query không pagination; All không truyền filters. Không thêm bulk delete/mutation.
- Row có semantic link/button và keyboard activation; checkbox không kích hoạt row. Numeric dùng `tabular-nums`; horizontal overflow vẫn usable trên mobile.

## Trình tự test-first

1. Viết real-PG tests cho compatibility wrapper, default 200, explicit page 50, total/hasMore, deterministic sort và invalid params.
2. Thêm restricted-role tests: hidden id/name/updatedAt/industry/annualRevenue không bị khôi phục; filter/sort bị chặn, q không tìm qua field hidden; workspace B không ảnh hưởng total/facet. Kiểm statement rows/count/facet với concurrent writer/barrier và trường hợp offset vượt total.
3. Tích hợp helper Phase 1 vào route; chỉ sau khi contract qua mới xây client URL/fetch.
4. Viết client/source tests cần thiết cho query serialization, request abort, selection reset và export URL; giữ logic thuần ở helper nhỏ nếu cần.
5. Kiểm tra manual bằng bàn phím/mobile sau khi automated gates qua.

## Acceptance

- [x] Client cũ đọc `companies` không vỡ; rows/total/facet nhất quán trong một response; thứ tự paging xác định khi dataset không đổi. Offset giữa hai request độc lập có thể drift nếu dữ liệu bị sửa; không hứa snapshot xuyên trang.
- [x] Filter/sort/facet không rò field ẩn; hidden numeric không render thành zero.
- [x] Stale response không ghi đè; retry phục hồi; no-data khác no-results.
- [x] Selection luôn rỗng lúc đầu, chỉ chứa row có id readable trên trang hiện tại; clear khi list query/page/workspace đổi, nhưng mở/đóng preview không tự xóa selection.
- [x] Saved view khôi phục filter/sort; export URL biểu diễn Selected/Filtered/All đúng contract Phase 1.

## Lệnh xác minh khi triển khai

```bash
npm test -- tests/companies-list.test.ts tests/saved-views.test.ts
npm test -- tests/field-permissions.test.ts tests/tenant-isolation.test.ts
```

## Rủi ro và rollback

| Rủi ro | Khả năng × tác động | Mitigation |
|---|---|---|
| Offset drift khi dữ liệu đổi giữa page | Medium × Medium | Stable sort + id tie-break; ghi nhận limitation. Nếu workload cần snapshot/cursor, dừng và replan |
| Count/facet chậm trên workspace lớn | Medium × High | EXPLAIN trên fixture lớn; không thêm index/migration trong scope này |
| Saved view cũ có sort lạ | Medium × Medium | Normalize về default, không xóa config |
| Selection sống qua workspace | Low × Critical | Workspace key + reset effect + cross-workspace integration/E2E |

Rollback UI trước, rồi revert route metadata/query additions. Default request và `companies` wrapper được giữ nên không cần data rollback.

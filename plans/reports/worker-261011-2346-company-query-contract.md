# Bàn giao sớm: contract `company-query`

Phase 1 sẽ tạo helper thuần ở `src/lib/company-query.ts` để Phase 2 dùng lại cho list và export:

- `CompanySort`: `updatedAt_desc | updatedAt_asc | name_asc | name_desc | annualRevenue_desc | annualRevenue_asc`.
- `CompanyQuery`: `{ q?: string; industry?: string; sort: CompanySort; sortProvided: boolean; offset: number; limit: number }`.
- `normalizeCompanyQuery(params: URLSearchParams)`: mặc định `offset=0`, `limit=200`, `sort=updatedAt_desc`; validate integer/non-negative offset, integer limit tối thiểu `1` và clamp limit lớn hơn 500 về `500` để giữ tương thích legacy, sort allowlist; trả kết quả phân biệt `ok`/`error` để route trả JSON 400.
- `companyWhere(query, readableFields?)`: tạo predicate Drizzle cho `q` (name/domain/industry còn readable) và industry. Escape `%`/`_`; không có searchable field khi `q` khác rỗng là lỗi policy, không bỏ predicate để trả tất cả.
- `companyOrderBy(query, readableFields?)`: tạo order ổn định theo sort; nếu sort mặc định rơi vào field ẩn thì fallback `id_asc`, còn sort được truyền rõ trên field ẩn trả lỗi policy. `id` là tie-breaker.
- `companyQueryPolicy(query, policy)`: kiểm tra filter/sort/search trước khi query; dùng `canReadField` của field-permissions, trả lỗi policy chung để tránh oracle.
- `companySelectedIds(raw)`: parse ID unique, tối đa 500; route dùng để tạo `id IN (...)` trong selected export.

Field mapping thống nhất cho policy/query: `q` → `name`, `domain`, `industry`; filter `industry` → `industry`; sort → `updatedAt`, `name`, hoặc `annualRevenue`. `id` chỉ là tie-breaker/fallback và luôn được giữ cho selection/pagination; không đưa profile/owner/custom vào export.

Export filtered sẽ gọi normalize + policy + where/order, bỏ `limit/offset`; Phase 2 Companies GET sẽ gọi cùng các hàm để giữ query semantics. Helper chỉ tạo SQL/pure validation, không mở transaction và không thay thế RLS.

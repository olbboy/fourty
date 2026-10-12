# Audit mức độ áp dụng learning từ `kargulstudio/sales-crm`

Ngày audit: 2026-10-12, Asia/Ho_Chi_Minh. Phạm vi: source hiện tại, UI đang chạy và bằng chứng kiểm thử của Fourty; không sửa mã ứng dụng.

## Kết luận

Fourty đã áp dụng phần lớn learning có giá trị theo hướng **adapt vào kiến trúc production**, không bê nguyên demo. Trong 10 learning chính đã chốt trước đây:

- 6 learning đã áp dụng đầy đủ;
- 1 learning đã áp dụng gần đầy đủ nhưng còn một lỗi token sau merge;
- 3 learning mới áp dụng một phần.

Phần mạnh nhất là Companies query/list, export đúng quyền, selection, preview và state handling. Ba khoảng trống rõ nhất là mobile filter chưa đạt contract của source, sidebar không còn resizer chiều rộng accessible, và command palette thiếu phần keyboard hint/footer của pattern tham chiếu.

Ngoài 10 learning trên, có một regression thiết kế sau merge: `ContextToolbar` vẫn được tài liệu hóa và kiểm thử như shared interface nhưng hiện không có consumer nào. Companies, Contacts và Deals đều quay lại toolbar ad-hoc.

## Manifest và cách kiểm chứng

| Mục | Kết quả |
| --- | --- |
| Source | [`kargulstudio/sales-crm`](https://github.com/kargulstudio/sales-crm) |
| Source HEAD | `main` tại `2bb85561794d21d2af67aa7c366f40ec1ef961ee`; giống SHA của lần học trước, `ahead=0`, `behind=0` |
| Fourty HEAD | `82d27e776eca962cf0a8e1220d66a99705d4870f`, branch `codex/sales-crm-improvements` |
| Source evidence | Reuse pack `/tmp/fourty-sales-crm-2bb8556.xml`, SHA-256 `60720308ef24565151e25f9ca7f974024063fc3284aef7402d125fbbe826eb9d`, vì source revision không đổi |
| Local evidence | Đọc source, plans/reports, test assertions, build artifact và review live Companies UI trên `localhost:3000` |
| Kiểm tra chạy trong audit | `npx vitest run tests/design-system.test.ts tests/semantic-tokens.test.ts tests/company-list-query.test.ts tests/csv.test.ts --reporter=dot`: 4 files, 50/50 test pass; `npx tsc --noEmit --pretty false`: pass |
| Full post-merge evidence | Plan đồng bộ hiện tại ghi Vitest 1105 pass/6 skip, production Playwright 107/107, development Playwright 14/14, build pass |

## Ma trận learning → implementation hiện tại

| # | Learning đã chọn | Trạng thái | Bằng chứng và khoảng trống |
| --- | --- | --- | --- |
| 1 | Semantic tokens cho surface, text, border, focus, status và light/dark | **APPLIED_WITH_DEFECT** | `src/app/globals.css` có token bridge Fourty ↔ shadcn, state families, dark theme, coarse pointer và reduced motion. Tuy nhiên Companies error vẫn dùng `border-danger/30 bg-danger/5` tại `companies-client.tsx:502`; không có `--color-danger`, và build artifact không sinh `.border-danger`/`.bg-danger`. Error banner vì vậy mất màu semantic dự kiến. |
| 2 | Companies list có search/filter/sort/count/saved views/pagination và số liệu dễ quét | **APPLIED** | Query nằm trong URL, API xử lý toàn tập ở server, UI có industry/sort, saved views, count, page summary, native table và pagination tại `companies-client.tsx:439-615`. Đây là adaptation đúng cho dữ liệu thật thay vì filter fixture trong browser. |
| 3 | Export selected/current-filter/all và CSV an toàn cho spreadsheet | **APPLIED** | UI phát ba scope tại `companies-client.tsx:401-429`; route export tái dùng query/policy, authorize và redact tại server; `src/lib/csv.ts` quote và trung hòa formula. Unit, integration và browser tests phân biệt ba scope và field bị ẩn. |
| 4 | Right-side company detail sheet giữ ngữ cảnh list | **APPLIED** | `src/components/company-preview.tsx` fetch detail API thật, có loading/not-found/error/retry, section từ field thật, URL preview, full-detail link và focus restoration. Selection/list không bị refetch khi chỉ đổi preview. |
| 5 | Mobile filter bottom sheet có active count, result count, reset và apply | **PARTIAL** | Companies có mobile `Modal`, active count, Reset và Apply tại `companies-client.tsx:480-495,617-650`. Chưa dùng bottom Sheet, không hiển thị result count trong panel, active count bỏ qua sort; Contacts/Deals chưa có cùng filter surface. |
| 6 | Page selection có indeterminate header và reset đúng list context | **APPLIED** | `companies-table.tsx` có select-page/indeterminate, row action tách biệt; `companies-client.tsx` giữ selection khi mở preview nhưng reset khi query list đổi. Browser test khóa cả hai hành vi. |
| 7 | Command palette thống nhất, tìm record theo ngữ cảnh và điều khiển bàn phím | **PARTIAL** | `command-palette.tsx` dùng server search, abort/race guard, contextual title/subtitle, custom object routes, retry state, keyboard navigation và focus restoration. Không còn footer/hint phím cho từng action như pattern nguồn. Core security tốt hơn source vì predicate và projection đi qua policy. |
| 8 | Sidebar responsive, resize accessible bằng pointer/Arrow/Home/End và lưu preference | **PARTIAL / SUPERSEDED** | Responsive navigation và trạng thái expanded/collapsed được áp dụng bằng shadcn Sidebar, lưu cookie `sidebar_state`. `SidebarRail` chỉ toggle, `tabIndex=-1`; không còn width resizer, separator semantics, keyboard resize hay persisted width. Đây là thay đổi contract có chủ đích khi merge shadcn, nhưng learning resizer chưa được giữ. |
| 9 | Field/form primitive thống nhất label, hint/error, required và submitting state | **APPLIED** | App-level `Field` nối stable ID, `aria-describedby`, `aria-invalid`, required và alert semantics; feature forms dùng primitive. Failed-submit preservation chưa được chứng minh đồng đều cho mọi entity, nhưng core learning đã materialize thành shared interface. |
| 10 | State contract loading/empty/error/retry, reduced motion và keyboard semantics | **APPLIED** | `Spinner`, `AsyncError`/`LoadError`, `EmptyState`, retry flows, no-data/no-results/empty-page và reduced-motion CSS đều có. Dashboard/Contacts/Deals/Tasks có E2E retry; Companies có retryable alert riêng. Coverage của AI sheet và restricted preview còn mỏng, nhưng runtime contract chính đã có. |

## Những gì đã học đúng nhưng không sao chép nguyên trạng

Việc không đưa các phần sau vào Fourty là quyết định đúng, không phải thiếu implementation:

- Zustand và toàn bộ fixture nằm trong browser;
- filter/count trên một mảng demo rồi coi là toàn bộ dữ liệu;
- health/activity metrics suy diễn, dữ liệu giả, timestamp ID;
- logo/avatar/media pipeline và notification/profile fixture;
- backend, auth hoặc permission model của source.

Fourty giữ Postgres/Drizzle, `withAuth`/RLS, RBAC, field permissions, audit/action kernel và pipeline invariants. `company-query.ts`, `company-list.ts` và export route là các module sâu: một query policy phục vụ list, facets và Companies export. shadcn v4 trên Base UI là implementation hiện tại của primitive/focus contract; đây là lựa chọn local sau merge, không phải dependency được sao chép từ source.

## Drift sau merge cần ưu tiên

1. **P1 — token lỗi ở Companies error state.** `danger` utility không có token và không xuất hiện trong CSS build. Chuyển sang `feedback-error`/`feedback-error-wash` hoặc `destructive` đúng mục đích.
2. **P1 — `ContextToolbar` là interface không có implementation consumer.** Nó chỉ còn ở `src/components/ui.tsx:78-108` và unit test; Companies/Contacts/Deals đều tự render toolbar. Hoặc dùng shared composition thật ở ba màn hình, hoặc xóa contract/tài liệu dormant nếu không còn muốn chia sẻ layout.
3. **P2 — mobile filters chưa đạt pattern đã học.** Cần chốt Sheet hay Modal, bổ sung result count và tính active filters nhất quán; sau đó quyết định có áp dụng cùng contract cho Contacts/Deals hay không.
4. **P2 — sidebar contract đã đổi.** Responsive/collapse hiện tốt, nhưng resizer accessible đã mất. Đây là quyết định sản phẩm cần chốt, không nên tự khôi phục chỉ vì source có.
5. **P2 — bằng chứng design-system còn thiên về source/SSR assertions.** Các journey còn thiếu bằng chứng mạnh gồm AI focus/Escape/restore, restricted-field preview, đủ ba toolbar ở mobile, Deal activation bằng Enter và failed-submit preservation cho Company/Contact.

## Rủi ro kiến trúc phát hiện khi đối chiếu

Các rủi ro này không phủ nhận learning đã áp dụng, nhưng làm tăng khả năng drift ở lần merge tiếp theo:

- Companies có hai list interface: REST dùng `companyList`, trong khi action `companiesList` vẫn là contract cũ, không có offset/page/facets; GraphQL/MCP/AI và REST có thể lệch sort/limit/policy.
- Client và server có hai query parser/default khác nhau. Client giữ page size 50, server default 200 và cap 500; invalid sort được xử lý khác nhau.
- Pipeline có nested routes và legacy flat routes cùng phục vụ một nghiệp vụ. Service invariants đã được gom tốt, nhưng auth/parse/error mapping vẫn lặp ở hai adapter.
- Search route và search service load policy hai lần; custom-object search có object permission nhưng chưa có field-redaction contract tương đương core CRM.

## Giới hạn và câu hỏi còn mở

- Source reference không thay đổi, nên audit này tập trung vào Fourty sau merge. Không chạy source app hoặc source scripts.
- Focused tests/typecheck được chạy lại trong audit. Full DB/E2E/build lấy từ gate của merge hiện tại; audit không reset database hoặc khởi động thêm server.
- Cần quyết định sản phẩm: giữ shadcn collapse-only sidebar hay khôi phục variable-width resizer.
- Cần quyết định maintainer: `ContextToolbar` là contract bắt buộc cho ba list screen hay nên xóa khỏi design-system docs/API.

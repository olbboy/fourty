# Khảo sát UI/UX CRM local của Fourty

Ngày khảo sát: 2026-10-11 (Asia/Saigon)

Phạm vi: đọc `README.md`, `docs/architecture.md`, `docs/adr/016-ai-native-strategy.md`, các primitive trong `src/components/`, các màn Contacts/Companies/Deals/Tasks/Dashboard/Reports, API list liên quan và toàn bộ `e2e/`. Đây là bản đồ hiện trạng dựa trên code và test; không chạy server, không sửa mã ứng dụng.

## Bối cảnh đã xác nhận

- README mô tả Fourty có Contacts, Companies, Deals, Tasks, Notes, timeline hoạt động; Kanban pipeline; analytics; saved views; i18n, a11y và palette `⌘K` (`README.md:65-75`).
- Architecture chủ ý giữ khoảng 40 Tailwind component nhỏ, không dùng component library, và coi test real Postgres + Playwright là quality gate (`docs/architecture.md:51-61`). Điều này giải thích vì sao UI hiện tại có primitive chung nhưng chưa có data-grid dùng chung.
- ADR-016 đặt AI assistant ở lớp tùy chọn, off-by-default, BYO-key và human-in-the-loop; phần shipped ghi rõ MCP CRUD, deal health score và draft note (`docs/adr/016-ai-native-strategy.md:5-29`). Shell có gắn `AiChat` nhưng đây là một drawer bổ trợ, không phải luồng CRM chính (`src/components/shell.tsx:20-23,219-224`; `src/components/ai-chat.tsx:174-245`).

## Bản đồ UI hiện có

| Khu vực | Đã có | Một phần / giới hạn đã thấy | Bằng chứng |
|---|---|---|---|
| Shell và điều hướng | Sidebar desktop đủ Dashboard/Contacts/Companies/Deals/Tasks/Reports/Workflows/Settings; skip link, landmark nav, `aria-current`; mobile top bar + bottom nav | Bottom nav mobile chỉ giữ Dashboard/Contacts/Deals/Tasks; Companies/Reports/Workflows/Settings không có mục trực tiếp | `src/components/shell.tsx:25-39,100-143,173-219` |
| Primitive dùng chung | `PageHeader`, `Field`, modal có dialog label, Escape, đưa focus vào và phục hồi focus; `EmptyState`, `Spinner`; chip/avatar | Modal không có focus trap; các request list không dùng primitive error state vì chưa có primitive error | `src/components/ui.tsx:7-25,27-87,89-107,163-186` |
| Contacts | Search tên/email/title, status filter, 4 lựa chọn sort, saved views, export/import, create modal, bảng responsive, empty/loading | Saved view chỉ nhận status + sort ở màn này; chưa có selection/bulk/pagination; row là `<tr onClick>` | `src/app/(app)/contacts/contacts-client.tsx:13-44,54-83,85-118,121-183` |
| Companies | Search name/domain/industry, export, create modal, bảng có Name/Industry/Size/Location/Revenue/Updated, detail liên kết contacts/deals | UI không expose industry filter dù API có; không có sort/saved views/selection/bulk/pagination; bảng dùng min-width | `src/app/(app)/companies/companies-client.tsx:12-29,31-58,60-121`; `src/app/api/companies/route.ts:11-36` |
| Deals | Chọn pipeline, Kanban/list toggle, stage count/tổng USD, kéo thả optimistic + rollback, list table, create modal; detail có stage stepper | Không có search/filter trên UI dù API hỗ trợ; drag/drop chưa có thao tác bàn phím; không selection/bulk/pagination | `src/app/(app)/deals/deals-client.tsx:13-66,74-128,130-169,186-225,227-287`; `src/app/(app)/deals/[id]/deal-detail.tsx:109-129` |
| Tasks | Global open/done/all tabs, create, checkbox complete, delete, due date/priority, liên kết về record; record panel thêm và toggle task | Không edit, search, filter theo priority/due/record/owner, selection/bulk/pagination; checkbox ở global list không nằm trong `<label>` | `src/app/(app)/tasks/tasks-client.tsx:16-61,65-140`; `src/components/record-panels.tsx:168-243` |
| Record detail | Contact/company/deal đều có loading, 404, edit/delete; details/custom fields; timeline; notes/tasks; quan hệ contacts/deals tùy record | Lỗi mạng khác 404 không có state; timeline/notes/tasks biến lỗi thành rỗng; touchpoint log chỉ có ở contact | `src/app/(app)/contacts/[id]/contact-detail.tsx:26-69,71-197`; `src/app/(app)/companies/[id]/company-detail.tsx:26-71,97-197`; `src/app/(app)/deals/[id]/deal-detail.tsx:26-78,131-204`; `src/components/record-panels.tsx:51-60,77-113,115-165` |
| Dashboard/Reports | KPI, funnel, revenue/activity chart, hot leads, due tasks, stale deals; reports có win/loss, source, score/status, aging table | Dashboard nói KPI có thể drill-down nhưng `Kpi` chỉ là `<div>`; reports không có bộ lọc thời gian/sort/export; chart không có bảng dữ liệu hay nhãn ARIA riêng | `src/app/(app)/dashboard/dashboard-client.tsx:46-108,111-192`; `src/app/(app)/reports/reports-client.tsx:26-158`; `src/components/charts.tsx:44-75,79-107,110-149,152-210` |
| Saved views | Bar có All, apply, save, delete; API hỗ trợ filters/sort/columns, personal/shared, cả contacts/companies/deals/tasks | UI chỉ render ở Contacts; `columns` có trong type/API nhưng không có column chooser/apply; UI không tạo shared view hay rename | `src/components/saved-views.tsx:5-23,40-129`; `src/app/api/saved-views/route.ts:8-25`; `src/app/(app)/contacts/contacts-client.tsx:78-82`; `tests/saved-views.test.ts:52-120` |
| Mobile | Layout detail chuyển 1 cột ở `lg`; table/board có overflow ngang; shell có safe-area bottom nav | Companies/Contacts/Deals list không có card/mobile row alternative; Kanban là `min-w-max` và hướng dẫn drag bị ẩn trên mobile | `src/app/(app)/contacts/contacts-client.tsx:134-172`; `src/app/(app)/companies/companies-client.tsx:73-111`; `src/app/(app)/deals/deals-client.tsx:142-225,282-285`; `src/app/(app)/contacts/[id]/contact-detail.tsx:105-182` |
| i18n | Locale resolver cookie → Accept-Language → en; settings cho chọn en/vi; shell nav dùng translator; AI labels có en/vi | Catalog chỉ có nav/action/common/settings/greeting; copy của các page CRM, table, form, empty/error gần như hardcode English | `src/lib/i18n/index.ts:4-35,37-55`; `src/lib/i18n/locales/en.ts:1-32`; `src/app/(app)/settings/settings-client.tsx:74-112`; `src/components/shell.tsx:22-34,78,139,213`; `src/app/(app)/contacts/contacts-client.tsx:54-118` |

### Bảng dữ liệu, filter, sort, bulk và pagination

- Contacts là màn hoàn chỉnh nhất về list controls: `q`, `status`, `sort`, saved views và export/import (`contacts-client.tsx:32-44,78-118`). Companies chỉ giữ `q` ở client (`companies-client.tsx:19-29,51-58`), còn Deals chỉ lọc theo `pipelineId` trong state (`deals-client.tsx:47-51,88-99`). Tasks có state tab nhưng không có query control (`tasks-client.tsx:77-91`).
- Backend hiện có hard limit nhưng chưa có cursor/offset/total: Contacts mặc định 200, tối đa 500 (`src/app/api/contacts/route.ts:14-19,44-54`); Companies 200/500 (`src/app/api/companies/route.ts:13-16,31-40`); Deals 300/1000 (`src/app/api/deals/route.ts:15-21,30-37`); Tasks cố định 500 (`src/app/api/tasks/route.ts:10-27`). UI hiển thị `array.length` làm subtitle, nên chưa có phân trang hay chỉ báo còn dữ liệu (`contacts-client.tsx:57-59`; `companies-client.tsx:33-35`; `deals-client.tsx:78-85`).
- Không có checkbox chọn hàng trong Contacts/Companies/Deals; các header chỉ là nhãn cột (`contacts-client.tsx:134-145`; `companies-client.tsx:73-83`; `deals-client.tsx:227-237`). Checkbox hiện có ở Tasks là complete từng dòng (`tasks-client.tsx:99-105`), không phải selection. Delete hiện nằm ở detail hoặc từng task (`contact-detail.tsx:96-101`; `tasks-client.tsx:130-136`).
- Saved views API đã khai báo `columns` và entity đủ bốn loại (`src/app/api/saved-views/route.ts:13-25`), nhưng Contacts truyền vào chỉ `filters.status` và `sort`, không truyền `q` hay columns (`contacts-client.tsx:78-82`); Companies/Deals/Tasks không gắn `SavedViewsBar`.

### Record detail, loading/error/empty

- Có loading/empty cơ bản: `Spinner` và `EmptyState` dùng ở các list (`contacts-client.tsx:121-132`; `companies-client.tsx:60-71`; `deals-client.tsx:130-141`; `tasks-client.tsx:93-97`); detail có 404 message + back link và spinner (`contact-detail.tsx:52-58`, tương tự company/deal).
- Forms có error API hiển thị (`contact-form.tsx:42-51`; `company-form.tsx:33-42`; `deal-form.tsx:52-61`). Tuy nhiên list loader chỉ set state khi `res.ok`, không set error (`contacts-client.tsx:32-39`; `companies-client.tsx:19-24`; `deals-client.tsx:26-29`; `tasks-client.tsx:22-25`), nên lỗi mạng giữ spinner vô hạn. Dashboard/Reports gọi `r.json()` trực tiếp, không kiểm tra `res.ok` hay `catch` (`dashboard-client.tsx:59-65`; `reports-client.tsx:29-35`).
- `Timeline`, `NotesPanel`, `TasksPanel` không có loading/error UI; response không OK bị biến thành danh sách rỗng (`record-panels.tsx:51-60,120-125,172-177`). Notes rỗng không có thông báo; Tasks có “No tasks” (`record-panels.tsx:158-163,240-243`), Timeline có “No activity yet” (`record-panels.tsx:59-60`).

## 8 cơ hội cụ thể để đối chiếu/ưu tiên

1. **Đưa Companies lên cùng mức list control với Contacts.** Giữ bảng hiện tại nhưng expose filter Industry đã có ở API, sort rõ ràng và Saved Views; thêm `q`/filter vào cấu hình view nếu muốn khôi phục chính xác một workspace view. Hiện client chỉ gửi `q`, còn API đã nhận `industry` và luôn order `updatedAt desc` (`companies-client.tsx:19-24,51-58`; `src/app/api/companies/route.ts:13-36`).

2. **Thêm selection và bulk actions có phạm vi an toàn cho các bảng.** Contacts/Companies/Deals chưa có selection hoặc bulk toolbar; chỉ có row navigation và delete ở detail. Một bulk bar có visible count, chọn toàn bộ trang và trạng thái indeterminate sẽ giảm thao tác lặp cho import/triage; cần áp dụng cả mobile state. Bằng chứng hiện trạng: `contacts-client.tsx:134-171`, `companies-client.tsx:73-110`, `deals-client.tsx:227-268`.

3. **Thiết kế pagination/cursor trước khi dữ liệu vượt hard limit.** API đang cắt kết quả ở 200/300/500/1000 mà không trả `total`, `nextCursor` hay `hasMore`; UI đếm số phần đã nhận. Cần thống nhất page/cursor contract rồi mới hiển thị count và điều hướng, nếu không workspace lớn sẽ mất record âm thầm (`src/app/api/contacts/route.ts:18-19,44-54`; `src/app/api/companies/route.ts:16,31-40`; `src/app/api/deals/route.ts:21,30-37`; `src/app/api/tasks/route.ts:21-27`).

4. **Bổ sung đường đi mobile và keyboard cho list/Kanban.** Mobile bottom nav hiện chỉ có bốn mục (`shell.tsx:36-39,196-217`); các bảng ép min-width 680–720 và board ép `min-w-max` (`companies-client.tsx:73-75`; `contacts-client.tsx:134-136`; `deals-client.tsx:143-145`). Deal movement dựa vào HTML5 drag events (`deals-client.tsx:153-163,192-195`) và E2E cũng chỉ mô phỏng native drag (`e2e/helpers/drag.ts:14-35`), nên cần menu Move/keyboard hoặc mobile action sheet bên cạnh drag.

5. **Làm loading/error/empty thành trạng thái có thể phục hồi.** Thêm error state + retry cho list, detail, dashboard/reports; phân biệt “không có dữ liệu” với “request lỗi”; thêm skeleton nếu cần. Hiện list có thể spinner vô hạn khi fetch lỗi, dashboard/reports cũng không có retry, còn record panels hiển thị rỗng khi API lỗi (`contacts-client.tsx:32-39,121-132`; `dashboard-client.tsx:59-65`; `record-panels.tsx:54-60,121-125`).

6. **Hoàn thiện task workflow thành một surface quản trị được.** Tasks đã có open/done/all, due date, priority, link về record và completion (`tasks-client.tsx:77-128`), nhưng chưa có edit, search/filter, owner/record filter, bulk complete/delete hay pagination; record panel chỉ add/toggle (`record-panels.tsx:168-243`). Đây là khoảng trống riêng với list CRM, không cần suy ra từ tên file.

7. **Nối dashboard/report với drill-down và fallback accessible.** Dashboard copy nói “every number is clickable-deep in Reports”, nhưng `Kpi` chỉ trả `<div>` và không nhận href/onClick (`dashboard-client.tsx:46-53,77-95`). Reports có các chart/table tĩnh, không có time-window/filter/export (`reports-client.tsx:37-155`). Recharts wrappers không khai báo bảng dữ liệu, summary hoặc `aria-label` riêng (`charts.tsx:57-75,94-107,120-149,162-210`); nên thêm drilldown thật, range rõ ràng và fallback text/table.

8. **Mở rộng i18n và khóa các tương tác thiếu semantics.** Settings cho đổi en/vi nhưng catalog chỉ khoảng một nhóm key chung (`en.ts:3-32`; `vi.ts:3-33`), trong khi Contacts/Tasks/Reports dùng title, placeholder, chip và error hardcode (`contacts-client.tsx:54-118`; `tasks-client.tsx:65-97`; `reports-client.tsx:38-49`). Ngoài ra row click không phải button/link (`contacts-client.tsx:147-152`), checkbox task global không có label (`tasks-client.tsx:99-105`), và nút trash ở detail chỉ có icon (`contact-detail.tsx:96-101`; `company-detail.tsx:87-93`; `deal-detail.tsx:99-105`). Cần bao phủ page copy và bổ sung accessible name/keyboard activation; primitive/a11y hiện mới được khóa ở mức cơ bản (`tests/a11y.test.ts:20-76`).

## Test đã có và khoảng trống coverage

- E2E hiện có 5 flow thực tế: first-boot setup tạo workspace + dashboard (`e2e/auth.setup.ts:13-24`); login/logout (`e2e/auth.spec.ts:13-24`); command palette filter/navigate và Escape (`e2e/command-palette.spec.ts:12-44`); Kanban drag đổi stage, count và total (`e2e/kanban.spec.ts:11-57`).
- Unit/source-level a11y kiểm tra `Field`, `Modal`, decorative icons, SavedViewsBar, shell skip link/nav/aria-current và command palette semantics (`tests/a11y.test.ts:20-76`). Chưa có browser assertion cho table row keyboard, task checkbox naming, delete icon, modal focus trap, chart fallback hay mobile.
- i18n test kiểm tra catalog khớp key, interpolation và locale precedence (`tests/i18n.test.ts:10-57`), nhưng chưa kiểm tra nội dung page sau khi chuyển vi.
- Saved views test chạy handler thật trên Postgres cho create/list/update/delete, entity filtering, personal/shared visibility và RLS isolation (`tests/saved-views.test.ts:52-120`). API/integration/RBAC/tenant tests bao phủ contract dữ liệu, không thay thế UI flows.
- Không có E2E/RTL coverage cho Companies/Contacts list controls, Companies filter/sort, bulk action, pagination, Tasks CRUD/edit/filter, record detail notes/timeline/error, Dashboard/Reports states, mobile navigation hoặc i18n page rendering. `README.md:113-123` chỉ ghi lệnh chạy test/build; không phải bằng chứng các flow này đã được kiểm thử.

## Câu hỏi còn mở

- Mốc dữ liệu nào cần pagination/cursor: hard limit hiện tại là guard backend hay đã được xem như UX contract?
- Đối chiếu với `kargulstudio/sales-crm` có yêu cầu đưa mobile filter sheet, visible-row selection, detail side sheet hay sidebar width control vào Fourty không, hay chỉ dùng làm tham chiếu?
- Phạm vi i18n mong muốn là dịch toàn bộ CRM page copy sang vi, hay chỉ giữ navigation/settings/assistant như hiện tại?

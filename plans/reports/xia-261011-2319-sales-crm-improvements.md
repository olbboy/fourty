# Học từ sales-crm để cải tiến Fourty

Ngày khảo sát: 2026-10-11, Asia/Saigon. Chế độ Xia: **improve**. Trạng thái: hoàn tất phân tích và challenge; kế hoạch triển khai được liên kết bên dưới. Chưa thay đổi mã ứng dụng.

## Kết luận

Giá trị lớn nhất của `kargulstudio/sales-crm` là trải nghiệm làm việc trên danh sách công ty: bộ lọc gọn, bảng có phân cấp thông tin, xem nhanh bằng panel, tìm kiếm có ngữ cảnh và điều hướng responsive. Fourty đã có backend CRM, phân quyền, pipeline, scoring, analytics và AI; học UX từ nguồn trên nền đó phù hợp hơn việc nhập kiến trúc demo.

Ưu tiên triển khai: (1) xuất CSV an toàn và đúng quyền; (2) Companies list có filter/sort/saved views/phân trang rõ ràng; (3) panel xem nhanh, mobile filters, keyboard và sidebar; (4) hoàn thiện kiểm thử, i18n và trạng thái lỗi. Các số liệu trang trí của nguồn không phải thuật toán nghiệp vụ đáng sao chép.

## Mục tiêu, ràng buộc và tiêu chí hoàn tất

- Mục tiêu: khảo sát toàn bộ bề mặt sản phẩm và cấu trúc nguồn, chọn những ý tưởng có bằng chứng sẽ cải thiện Fourty, lập bản đồ tích hợp và kế hoạch có thể thực thi.
- Giữ Postgres/Drizzle, `withAuth`/RLS, RBAC, field permissions, audit/workflow và API hiện có. Giữ chiến lược ít dependency và không dùng component library trong [kiến trúc](../../docs/architecture.md).
- Không đổi framework, không thay backend bằng Zustand, không nhập demo records/logo/avatar, không thêm dịch vụ lưu trữ hay migration chỉ để giống nguồn. Không biến nghiên cứu này thành dự án clone toàn bộ sản phẩm.
- Hoàn tất nghiên cứu khi có SHA nguồn, attribution, source/local map, dependency/decision matrices, phân tích luồng và failure modes, danh sách ưu tiên, test/rollback cụ thể. Không có `--yagni`; mọi nhóm nguồn đều được phân loại, kể cả nhóm không phù hợp để áp dụng.

## Manifest và phạm vi bằng chứng

| Mục | Giá trị |
| --- | --- |
| Nguồn | [kargulstudio/sales-crm](https://github.com/kargulstudio/sales-crm) |
| Nhánh/ref | `main`, ghim [`2bb85561794d21d2af67aa7c366f40ec1ef961ee`](https://github.com/kargulstudio/sales-crm/tree/2bb85561794d21d2af67aa7c366f40ec1ef961ee) |
| Commit nguồn | 2026-10-06 06:41:53 UTC |
| Fourty HEAD lúc bắt đầu | `24997d2ff6ff72030265788ea966632ea7b0c352`, working tree sạch |
| Pack | Repomix 1.18.1, remote mode, 98 file, 74.273 token; secret scan không báo file đáng ngờ |
| Cache khảo sát | `/tmp/fourty-sales-crm-2bb8556.xml`, tạm thời; báo cáo dùng URL ghim SHA để không phụ thuộc cache |
| Phạm vi pack | README, LICENSE, package/config, `app`, `components`, `data`, `hooks`, `lib`, `stores`; không pack binary, lockfile, env hay skill/instruction của nguồn |
| Phần còn lại | Git tree đầy đủ để kiểm tra scripts, assets, test/CI và backend; metadata/issues/PR chỉ dùng làm bối cảnh |

Đã đọc sâu đường đi Companies, store, filter/sort/export, table/selection, detail, form, CmdK, sidebar/resizer, tokens và media activation; kiểm tra các nhóm profile/notifications/SEO qua cấu trúc và file đại diện. Không khẳng định đã audit từng dòng của 98 file. Không chạy source app, source scripts, install dependencies của nguồn, benchmark hay browser audit. Không xem PR mở là tính năng đã có trên `main`.

## Source anatomy và bản đồ chuyển giao

| Lớp | Nguồn và hành vi quan sát được | Fourty / đề xuất |
| --- | --- | --- |
| Entry | [`app/page.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/app/page.tsx) chỉ ghép Sidebar + Companies | Giữ các route nghiệp vụ Fourty; nâng Companies trước |
| State | [`stores/companies-store.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/stores/companies-store.ts#L42) lấy `COMPANIES`, mutation chỉ đổi memory | React state/URL chỉ giữ view state; dữ liệu thật vẫn qua API |
| Logic thuần | [`lib/companies.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/lib/companies.ts#L36): filter/sort, split tags, export rows | Học helper nhỏ; filter toàn tập phải chạy server, không lọc phần dữ liệu bị API cắt |
| Table | [`table-columns.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/table/table-columns.ts): cấu hình cột tập trung, số canh phải/tabular | Giữ native table; thêm cột có chọn lọc từ schema thật, ưu tiên đọc/quét và keyboard |
| Selection | [`companies-table.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/table/companies-table.tsx#L44): chọn tập visible + indeterminate | Áp dụng cho trang hiện tại và export đã chọn; không suy diễn thành quyền bulk delete |
| Filters | [`mobile-filters.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/toolbar/mobile-filters.tsx): bottom sheet, active count, reset, result count | Một query contract cho desktop/mobile/saved view/export; count từ server |
| Detail | [`company-detail.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/detail/company-detail.tsx): side sheet bên cạnh list | Preview đọc dữ liệu thật; giữ URL detail và form chỉnh sửa hiện có |
| Search | [`command-menu.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/command-menu/command-menu.tsx): kết quả nhiều ngữ cảnh, keyboard hints, bàn giao focus | Cải thiện palette hiện có; không cài thêm cmdk để tạo palette thứ hai |
| Shell | [`sidebar-resizer.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/_common/sidebar/sidebar-resizer.tsx): pointer capture, clamp, keyboard, reset, lưu width | Preference hiển thị có thể ở localStorage; dữ liệu CRM và quyền không ở đó |
| Create | [`new-company-dialog.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/new-company/new-company-dialog.tsx#L81): nhóm field, focus lỗi, submit vào store | Học layout và focus; tiếp tục POST/Zod/permission của Fourty |
| CSV | [`lib/csv.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/lib/csv.ts): quote và trung hòa công thức, BOM, revoke object URL | Học bảo vệ spreadsheet; thực hiện ở server export, giữ số và raw serializer contract |
| Tokens/media | [`globals.css`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/app/globals.css), `components/_ui/asset/*`: token ngữ nghĩa, lazy media, poster/fallback | Dùng token Fourty, trì hoãn UI phụ khi đo thấy cần; không nhập Rive/Lottie/PhotoSwipe/Swiper |
| Profiles/notifications | `components/companies/profile/*`, `header/notifications/*`: đọc fixture và store | Học cách nhóm nội dung; đây không phải notification service hay account authorization |
| SEO/scripts/assets | `lib/seo.ts`, `scripts/*`, `public/*` còn dấu vết starter/media | Không đưa SEO public/crawler hay pipeline xử lý video vào màn CRM riêng tư |

## Local map và dependency matrix

Chi tiết có số dòng nằm trong [khảo sát UI](scout-261011-2319-local-crm-ux.md) và [khảo sát contracts](scout-261011-2319-local-crm-contracts.md).

| Ý tưởng nguồn | Local equivalent / integration seam | Trạng thái | Hành động |
| --- | --- | --- | --- |
| Companies table/filter | `src/app/(app)/companies/companies-client.tsx`, `src/app/api/companies/route.ts` | EXISTS một phần | UI hiện chỉ gửi q; expose industry, thêm sort/phân trang tương thích |
| Saved view | `src/components/saved-views.tsx`, `src/app/api/saved-views/*` | EXISTS | Nối vào Companies; không tạo store persistence thứ hai |
| Selection/export tập nhìn thấy | Companies table, `src/app/api/export/[entity]/route.ts` | NEW | Định nghĩa page selection, filtered/selected export và kiểm tra quyền tại server |
| CSV quoting | `src/lib/csv.ts`, `tests/csv.test.ts` | EXISTS / thiếu spreadsheet-safe mode | Thêm mode tại export boundary, không thay raw round-trip |
| Detail sheet | Company detail route, `src/components/ui.tsx`, `record-panels.tsx` | NEW presentation | Tái dùng dữ liệu/logic detail; không nhân đôi mutation |
| CmdK | `src/components/command-palette.tsx`, `src/app/api/search/route.ts` | EXISTS / thiếu field policy ở search | Áp policy cho cả search predicate và output trước khi hiển thị result phong phú; không coi response hiện tại là đã an toàn về field |
| Sidebar/mobile | `src/components/shell.tsx`, `src/app/globals.css` | EXISTS một phần | Mobile đến được Companies; thêm resize preference và keyboard |
| Tags/meter/chart | UI badges, `charts.tsx`, scoring/currency/format | EXISTS / CONFLICT về nghĩa | Dùng score/stage và dữ liệu thật; không gán score heuristic thành xác suất đã hiệu chỉnh |
| Store/framework/UI dependencies | React19/Tailwind4/Next15; không component library | CONFLICT | Không chuyển Next16 hoặc thêm Zustand/Radix/Motion chỉ để port UX |
| Data/auth/persistence | Postgres/RLS/RBAC/field policy/audit/queue | CONFLICT | Giữ Fourty; nguồn không có lớp tương đương để học |
| Notifications/logo upload | Không có persistence contract tương ứng trong phần đã đọc | NEW, ngoài phạm vi áp dụng trực tiếp | Cần yêu cầu sản phẩm riêng; không mang fixture hoặc data URL làm chức năng thật |

## Trace luồng, bất đồng bộ và ranh giới transaction

**Nguồn:** page → Companies → selectors Zustand → `filterCompanies` → table. Đổi filter cập nhật toàn bộ tập 18 fixture tại client. Chọn row đặt `detailId`/`detailOpen`; mở profile đóng detail. Create → kiểm tra tên → ID client/time → prepend memory → đóng dialog. Export serialize tập đã filter. Không có network commit, rollback, workspace hay giao dịch DB trong luồng CRM này.

**Fourty mục tiêu:** URL/view config → normalize/validate query → fetch list trong `withAuth` → workspace transaction/RLS → filter/sort/page → field redaction → render. Query thay đổi phải hủy hoặc bỏ response cũ; không để kết quả chậm ghi đè query mới. Chuyển workspace hoặc query phải xóa selection/preview cũ. Saved view chỉ chứa cấu hình, không chứa snapshot record.

**Preview:** closed → loading(id) → ready | forbidden/not-found | retryable-error → closed. Đóng panel hoặc đổi id hủy request cũ; restore focus đúng trigger; chuyển sang full detail vẫn dùng route hiện hành. Lỗi fetch không được biến thành “không có dữ liệu”.

**Mutation hiện có:** với company create/update, giữ Zod, `authorize`, `blockedWrites`, DB write, activity, audit và dispatch. `withAuth` bao handler trong workspace transaction, nhưng không suy ra mọi side effect ngoài DB là atomic. Preview đọc-only không tạo mutation hoặc side effect mới; mutation sau này cần tải lại dữ liệu đã được server xác nhận.

**Export:** authenticated request → scope/filter/IDs đã validate → cùng workspace → field policy → serialize spreadsheet-safe. Không export cache trên browser hoặc chỉ fetch trang đầu rồi gọi đó là toàn bộ kết quả. Export lỗi không trả CSV có vẻ thành công. Các aggregate sau này cũng phải tôn trọng quyền đối với input fields.

## Challenge và decision matrix — hoàn tất trước khi lập plan

Ba phương án đã đối chiếu: bê nguyên UI/store/deps; chỉ đổi màu/CSS; hoặc chuyển các pattern tương tác vào các seam Fourty. Chọn phương án thứ ba vì giải quyết khoảng trống sử dụng mà giữ nguồn dữ liệu và chính sách hiện có. Chỉ đổi CSS không giải quyết list truncation, quyền export và mất ngữ cảnh; bê nguyên store làm mất persistence/tenant contracts.

| Quyết định | Nguồn | Fourty | Khuyến nghị / rủi ro nếu chọn sai |
| --- | --- | --- | --- |
| Persistence/auth | Fixture + state memory | Postgres + RLS/RBAC | Giữ Fourty; thay bằng client store mất dữ liệu và biên tenant |
| Trạng thái view | Store global | React/URL + saved views | URL/query có allowlist, ephemeral selection; tránh response cũ/selection sai phạm vi |
| Filter/sort/count | Toàn bộ mảng trong browser | API đang hard-limit, thiếu metadata | Tính toàn tập ở server; không coi `array.length` là tổng |
| Export | Visible rows; có formula guard | Export toàn entity, raw serializer | Thêm scope rõ, field policy và spreadsheet-safe mode; bảo toàn raw contract |
| Drawer | Radix sheet + dữ liệu đã có trong memory | Route detail + modal | Preview riêng có loading/error/focus; giữ full route, tránh hai codepath sửa record |
| Metrics | Health/activity suy ra từ fixture | Scoring/stats/currency thật | Tái dùng local; không thêm chart hoặc KPI có dữ liệu bịa |
| Design | Dark palette và nhiều UI dependencies | Token riêng, dependency-light | Học mật độ/spacing/state hierarchy; giữ nhận diện và primitives Fourty |
| Mobile/a11y | Sheet/resizer có semantics | Mobile nav một phần, modal thiếu trap | Đưa Companies vào mobile navigation, focus trap/restore, semantic link, reduced motion |
| Notifications/assets | Fixture, client-read logo | Chưa có contract tương ứng | Không tự thêm backend dịch vụ; chỉ giữ bài học UX trong report |
| Kiểm thử | Không có test/CI ở SHA khảo sát | Vitest real-PG + Playwright | Giữ và mở rộng test Fourty; không xem demo thao tác được là bằng chứng production |

Rủi ro ban đầu: **Medium, 3 giả định critical** — (1) port state không phá tenant/persistence; (2) export/aggregate không lộ field bị ẩn; (3) contract pagination/sort/CSV không phá consumer hiện tại. Challenge đã chốt hướng xử lý cho cả ba. Việc bảo đảm thực thi vẫn phải được chứng minh bằng integration/regression tests, không được ghi là đã an toàn chỉ vì có plan. Không có quyết định nào yêu cầu thay stack hoặc chính sách sản phẩm hiện hành.

## Ưu tiên và những gì không học nguyên trạng

| Ưu tiên | Cải tiến | Bằng chứng / giá trị | Phạm vi |
| --- | --- | --- | --- |
| P1 | Export spreadsheet-safe + field policy + scope rõ | Probe thực tế cho thấy serializer giữ nguyên `=1+1`; export đọc thẳng rows, khác list redaction | CSV/API/tests; không đổi DB |
| P1 | Companies filter/sort/saved view, count và pagination thật | Local đã có industry API nhưng UI chưa dùng; API mặc định cắt 200 rows | Companies query + UI; shared view reuse |
| P1 | Error/retry, request race, selection và export current view | Local chỉ cập nhật state khi response OK; nguồn có selection/visible export | Scope query/page/tenant rõ, selection phục vụ export |
| P2 | Preview công ty bên cạnh bảng | Source giữ context list; Fourty đang điều hướng sang detail page | Read-only preview; full detail tiếp tục chỉnh sửa |
| P2 | Mobile filter sheet + đầy đủ đường tới Companies | Source gom filter và counter; local mobile nav thiếu mục Companies | Tái dùng query controls, focus/keyboard/i18n |
| P2 | Bảng và CmdK dễ quét | Source numeric alignment, overflow tags, result context; local đã có palette | Dùng trường được API cho phép, giữ hotkey và routes |
| P2 | Sidebar resize + token/state consistency | Source có pointer/keyboard/clamp/persist; local desktop width cố định | Preference UI riêng; không nhập CRM state store |
| P2 | Test và i18n cho surfaces thay đổi | Local có hạ tầng test và catalog nhưng Companies copy còn hardcode | Không mở rộng thành dự án dịch toàn bộ sản phẩm |

Nguồn có các điểm không nên nhân bản: `TODAY` cố định 2026-09-14; `companyActivity` lấy số deal nhân hệ số; `companyHealth` lấy winProbability nhân hệ số; window selector trong detail đổi state nhưng không truyền range vào metric; footer có nhãn Sum/Avg nhưng không tính kết quả; ID tạo bằng timestamp, CRM data mất khi refresh; notification/profile dựa fixture. Các shell navigation label cũng không phải bằng chứng có đủ module phía sau.

Các gaps local ngoài bài học trực tiếp (bulk delete, task management mở rộng, report time ranges, company-level analytics mới, API/SDK mới) được ghi nhận trong scout, không tự ghép vào plan này. Không có hành vi nguồn thực nào đòi các tính năng đó để áp dụng UI đã chọn.

## Kiểm chứng đã thực hiện và giới hạn

- Git status đầu vào sạch; HEAD local và nguồn được ghi ở manifest.
- GitHub tree + code ghim SHA xác minh fixture/state memory, phạm vi route, thiếu test/CI và giấy phép.
- Repomix pack thành công, không tắt secret checks hoặc tin config từ repo nguồn.
- Probe trực tiếp module local bằng Node 24.18.0: `toCsv(['name','revenue'], [['=1+1', -12]])` trả `name,revenue\r\n=1+1,-12\r\n`. Đây là bằng chứng serializer chưa trung hòa công thức; chưa phải khai thác Excel/Sheets hoặc kiểm thử route/Postgres.
- `node_modules` chưa có trong worktree. Không chạy Vitest/build/E2E; không tạo DB/migration/server. Các lệnh kiểm thử trong plan là kiểm chứng phải chạy khi triển khai, không phải kết quả của phiên này.
- Rà soát source-level chỉ ra thiếu mask ở export và search, nhưng chưa chạy live-request với role giới hạn để chứng minh end-to-end. Bổ sung test role/workspace ở các seam đó trước khi sửa. Cả viewer/member hiện có quyền đọc CRM; vấn đề là field policy và gate rõ ràng, không phải mọi viewer đều bị cấm export.
- Không có số đo hiệu năng/contrast/browser rendering; những lợi ích UX là đề xuất từ cấu trúc tương tác, chưa là kết quả usability test.

## License và handoff

Nguồn có [MIT LICENSE, Copyright (c) 2026 Kargul Studio](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/LICENSE). Nếu sao chép phần mã đáng kể khi triển khai, giữ notice bản quyền và permission notice cùng bản phân phối; ghi provenance đúng SHA. Phiên này chỉ tạo tài liệu nghiên cứu, không sao chép code vào app. Không nhập logo/avatar/font của nguồn vào sản phẩm.

Kế hoạch: [sales-crm improvements](../261011-2319-sales-crm-improvements/plan.md). Chi tiết nguồn: [researcher report](researcher-261011-2319-sales-crm-source.md). Kết quả phản biện và xử lý chín findings: [review report](review-261011-2319-sales-crm-plan.md). Đây là record khảo sát, không thay thế docs sản phẩm hoặc đánh dấu tính năng là đã ship.

Theo [ak-xia](~/.agents/skills/ak-xia/SKILL.md), “This skill does not implement code. It produces the analysis and plan, then hands off.” Bàn giao triển khai qua `/ak:cook ~/.codex/worktrees/0747/fourty/plans/261011-2319-sales-crm-improvements/plan.md`.

## Câu hỏi còn mở

Không có câu hỏi bắt buộc để hoàn tất nghiên cứu. Khi triển khai, cần xác nhận bằng test và kiểm tra giao diện thật các semantics phân trang/selection/CSV đã chốt trong plan; nếu cần thay public contract hoặc thêm metric/schema ngoài các seam trên thì đưa thay đổi phạm vi đó ra quyết định riêng.

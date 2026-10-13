---
title: "Fourty còn thiếu những tính năng CRM cơ bản nào? Đối chiếu với 5 CRM ở bậc nhập"
date: 2026-10-13
branch: feat/accept-shows-login-email (HEAD 87d61b7, worktree codebase-review-audit-9b75d4)
status: "Nghiên cứu xong, chỉ mô tả. Không có quyết định sản phẩm và không xếp thứ tự ưu tiên. Mục 'chưa kiểm' ghi rõ ở §8."
---

# Fourty so với tính năng CRM cơ bản

## 1. Bối cảnh

Câu hỏi: trong những thứ một CRM thường được kỳ vọng có, Fourty thiếu cái nào hoặc mới có một phần?

Cách làm: (1) lập danh sách "cơ bản" từ trang tài liệu và bảng tính năng của chính nhà cung cấp, ở gói thấp nhất; (2) mở code, schema, migration, docs và e2e của Fourty để biết nó làm được gì; (3) đối chiếu từng năng lực, mỗi chỗ thiếu kèm một tình huống cụ thể của PilotCo.

Giới hạn của báo cáo:

- **Quản trị thành viên** (nhóm, vai trò, lời mời, vô hiệu hoá): xem báo cáo riêng. Báo cáo này chỉ nhắc quyền xem theo từng bản ghi ở §4 vì nó nằm trong danh sách năng lực cần kiểm.
- **Không lặp lại** những gì `plans/reports/advisor-261013-0151-PilotCo-sales-pipeline-fit.md` đã chốt (một pipeline `Sales`, 8 stage, 9 custom field, 3 workflow, script nhập bằng REST). Báo cáo này chỉ trích dữ liệu PilotCo từ đó, ghi "advisor §n".
- Không truy cập production, không đọc `.env`, không sửa code. Mọi thứ về Fourty đọc từ worktree này.
- Không khuyến nghị làm gì, không xếp thứ tự. Mỗi chỗ thiếu chỉ mô tả tác động.

Kết quả một dòng: trong 22 năng lực đạt ngưỡng "cơ bản", Fourty **có 8, có một phần 8, thiếu 6**. Thêm 17 mục nằm ngoài ngưỡng (ít nguồn có, hoặc nguồn chưa đủ để kết luận): Fourty có 4, một phần 2, thiếu 11.

## 2. Từ ngữ (định nghĩa một lần)

| Từ | Nghĩa trong báo cáo |
|---|---|
| **Bậc nhập** | Gói thấp nhất của một nhà cung cấp, miễn phí hoặc rẻ nhất. Pipedrive: Lite. HubSpot: Free CRM và Starter. Salesforce: Free CRM và Starter Suite. Twenty: gói Pro (gói trả phí rẻ nhất; tự dựng thì miễn phí). Attio: Free và Plus. |
| **Pipeline, stage, deal** | Deal là một cơ hội bán. Pipeline là chuỗi các stage (bước) deal đi qua. Mỗi stage có xác suất thắng và một loại: đang mở, thắng, mất. |
| **Bản ghi (record)** | Một dòng dữ liệu: một liên hệ, một công ty, một deal, một việc. |
| **Custom field** | Trường do người dùng tự thêm vào bản ghi. |
| **Saved view** | Bộ lọc và cách sắp xếp được lưu tên để mở lại. |
| **Gộp (merge)** | Nhập hai bản ghi trùng thành một, giữ dữ liệu của cả hai. |
| **Xoá mềm** | Xoá nhưng còn khôi phục được (thùng rác). Ngược lại là xoá cứng. |
| **Thao tác hàng loạt (bulk)** | Chọn nhiều bản ghi rồi sửa hoặc xoá cùng lúc. |
| **Dòng sản phẩm (line item)** | Từng mặt hàng với số lượng và đơn giá bên trong một deal. Báo giá (quote) là tài liệu gửi khách dựng từ các dòng đó. |
| **API, webhook** | API là cổng để chương trình khác đọc/ghi dữ liệu. Webhook là việc hệ thống tự gọi một địa chỉ ngoài khi có sự kiện. |
| **OAuth** | Cách cấp quyền cho CRM đọc hộp thư mà không đưa mật khẩu. |
| **ICS** | Địa chỉ lịch (đuôi `.ics`) mà CRM chỉ đọc, không tạo sự kiện được. |
| **Nhật ký kiểm toán (audit log)** | Sổ ghi ai làm gì, lúc nào, trên cả hệ thống. |
| **PWA** | Trang web cài lên màn hình điện thoại như một ứng dụng, không phải ứng dụng gốc trên kho ứng dụng. |

## 3. Cách xác định "cơ bản"

### 3.1. Năm nguồn và trang đã mở

Chỉ dùng trang của chính nhà cung cấp. Trang giá của Pipedrive trả 403 nên dùng bảng tính năng theo gói trong trung tâm trợ giúp của họ. Trang giá HubSpot không có bảng tính năng nên dùng trang sản phẩm và knowledge base.

| Ký hiệu | Nguồn | Bậc nhập | Trang đã mở |
|---|---|---|---|
| PD | Pipedrive (gần Fourty nhất: CRM xoay quanh deal cho đội bán nhỏ) | Lite | https://support.pipedrive.com/en/article/what-features-do-the-pipedrive-plans-have (bảng tính năng theo gói, đọc đủ) · …/article/lost-reasons · …/bulk-editing-and-filtering · …/search-finding-what-you-need · …/merge-duplicates · …/participants · …/activities · …/filters-common-uses · …/filtering · https://www.pipedrive.com/en/features |
| HS | HubSpot | Free CRM, Starter | https://www.hubspot.com/products/crm (danh sách tính năng Free) · https://www.hubspot.com/products/crm/starter (Free so với Starter) · https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines · …/forecast/use-the-forecast-tool · …/records/merge-records · …/records/bulk-edit-records · …/records/create-and-manage-saved-views · …/properties/hubspots-default-deal-properties · …/tasks/create-tasks · …/products/create-and-manage-products · …/account-management/search-within-your-hubspot-account |
| SF | Salesforce | Free CRM, Starter Suite | https://www.salesforce.com/small-business/pricing/ và PDF bảng so sánh gói https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/small-business/comparison-chart-starter-prosuite-features-us.pdf (đọc 3 trang dạng ảnh, có dấu tick theo từng gói) · https://www.salesforce.com/in/products/salesforce-starter/ |
| TW | Twenty (mã nguồn mở) | Pro | https://twenty.com/pricing · https://docs.twenty.com/getting-started/key-features.md · …/core-concepts/data-model.md · …/user-guide/data-model/capabilities/fields · https://docs.twenty.com/_llms/en/user-guide.txt (chỉ mục 118 trang) · https://twenty.com/releases · …/can-i-send-emails-from-twenty.md · …/navigate-around-twenty |
| AT | Attio | Free, Plus | https://attio.com/pricing · https://attio.com/help/reference/managing-your-data/records/create-and-view-records · …/records/merge-and-delete-records · https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace · …/productivity-collaborating/tasks |

Những gì chỉ đọc qua tóm tắt của công cụ tìm kiếm mà chưa mở trang (nhập/xuất, chế độ xem của Attio; ghi chú và nhãn của Pipedrive; lưu trữ tệp của HubSpot) đều bị hạ xuống dấu `~` bên dưới, không tính là đã kiểm.

### 3.2. Ký hiệu và ngưỡng

| Dấu | Nghĩa |
|---|---|
| ✓ | Trang của nhà cung cấp cho thấy có ở bậc nhập |
| ~ | Có trong danh sách tính năng nhưng không nói rõ bậc, hoặc chỉ qua một cách vòng (ví dụ qua workflow) |
| ↑ | Chỉ có ở gói cao hơn bậc nhập |
| ✗ | Không thấy trong tài liệu hoặc bảng tính năng đã mở |
| ? | Chưa kiểm |

- **Cơ bản**: ít nhất 3 trong 5 nguồn có dấu ✓. Nếu chỉ 2 dấu ✓ cộng dấu `~` đủ 3 thì gọi là "cơ bản (biên)".
- **Chưa đủ nguồn**: có 1–2 dấu ✓, phần còn lại là `?`. Các mục này vẫn được liệt kê với trạng thái của Fourty, nhưng không gọi là cơ bản.
- **Không cơ bản**: phần lớn nguồn để ở gói cao (↑) hoặc không có (✗).

Ngưỡng 3/5 là lựa chọn của người viết báo cáo, hỏi lại ở §9.

## 4. Bảng đối chiếu

Trạng thái Fourty: **Có**, **Một phần**, **Thiếu**. Bằng chứng ghi `path:line` trong worktree này.

### 4.1. Năng lực đạt ngưỡng cơ bản (22 mục)

| # | Năng lực | PD · HS · SF · TW · AT | Đếm | Fourty | Bằng chứng Fourty |
|---|---|---|---|---|---|
| 1 | Liên hệ và công ty, liên kết với nhau | ✓ ✓ ✓ ✓ ~ | 4✓ +1~ | **Có** | `src/db/schema.ts:171-222`; action `contacts.*`, `companies.*` trong `src/lib/actions/`; trang công ty gọi liên hệ và deal của nó `src/app/(app)/companies/[id]/company-detail.tsx:58-59`; một liên hệ gắn một công ty (`schema.ts:205`) |
| 2 | Nhiều pipeline, stage, xác suất theo stage, thắng/mất | ✓ ✓ ✓ ~ ~ | 3✓ +2~ | **Có** | `src/app/api/pipelines/route.ts:20-43` (tạo pipeline); `schema.ts:232-248` (xác suất `win_probability`, loại open/won/lost); e2e `e2e/settings.spec.ts:265`. Một deal không đổi được pipeline: `src/lib/actions/deals/update.ts:45` |
| 3 | Việc cần làm: hạn, người nhận, gắn vào bản ghi | ✓ ✓ ✓ ✓ ✓ | 5/5 | **Có** | `schema.ts:279-295`; gán người `src/lib/validators.ts:59`; tạo ngay trên deal `deals/[id]/deal-detail.tsx:287`. Hạn chỉ theo ngày (`tasks-client.tsx:192`); Pipedrive và HubSpot cho cả giờ |
| 4 | Khách tiềm năng (lead) | ✓ ✓ ✓ ✗ ✗ | 3/5 | **Có** (dạng khác) | Không có hộp lead riêng; liên hệ có `status` lead/qualified/customer/churned (`schema.ts:207`, `validators.ts:14`), `source`, `score` (`schema.ts:208-209`) |
| 5 | Ghi chú trên bản ghi | ~ ? ? ✓ ✓ | 2✓ +1~ | **Một phần** | Chỉ thêm, không sửa, không xoá: `src/app/api/notes/route.ts:7-8` (chỉ GET, POST), registry chỉ có `notes.create`/`notes.list` (`src/lib/actions/notes/`); `docs/guides/records.md:14` |
| 6 | Tệp đính kèm | ✓ ~ ? ? ✓ | 2✓ +1~ | **Thiếu** | Không có bảng hay cột tệp trong 35 bảng của `src/db/schema.ts` (liệt kê bằng `grep pgTable`); `grep attachment src` chỉ ra phần đọc thư và tiêu đề tải file khi xuất, không có chỗ lưu tệp |
| 7 | Phát hiện và gộp trùng | ✓ ✓ ? ✓ ✓ | 4/5 | **Một phần** | Có phát hiện, không có gộp. Từ chối tạo liên hệ trùng email `src/lib/actions/contacts/create.ts:19-22`; cảnh báo trùng tên và công ty `src/lib/duplicates.ts:37-39`, `contact-form.tsx:80`; liệt kê trùng trên trang liên hệ `contact-detail.tsx:72`; nhập CSV cập nhật theo email `src/app/api/import/contacts/route.ts:79-82,213`. Không có thao tác gộp cho bất kỳ loại bản ghi nào; không có phát hiện trùng cho công ty và deal |
| 8 | Sản phẩm / dòng sản phẩm trên deal | ✓ ✓ ✓ ✗ ✗ | 3/5 | **Thiếu** | Không có bảng sản phẩm; deal chỉ có một số `amount` (`schema.ts:256`) |
| 9 | Nhắc việc và thông báo | ✓ ✓ ~ ~ ✓ | 3✓ +2~ | **Thiếu** | `grep reminder src` không có kết quả. Thư gửi ra chỉ là thư hệ thống (mời, đặt lại mật khẩu): `src/lib/mail.ts:3-18`, `src/lib/mail-templates.ts:3-9`. Dashboard chỉ hiện việc đến hạn khi người dùng mở nó: `dashboard-client.tsx:261-262`. Workflow không có hành động gửi mail: `src/lib/workflows/types.ts:28-37` |
| 10 | Đồng bộ email vào hồ sơ | ↑ ~ ✓ ✓ ✓ | 3✓ | **Một phần** | Gmail/Microsoft chỉ đọc (`src/lib/sync/oauth.ts:24,29`); khớp theo email liên hệ rồi ghi vào dòng thời gian của **liên hệ**, không vào deal hay công ty (`src/lib/sync/ingest.ts:62,94-102`; `grep '"deal"' src/lib/sync` rỗng); không lưu nội dung thư, chỉ đoạn trích và chữ ký (`schema.ts:585`); người vận hành phải đăng ký một OAuth app cho cả instance (`docs/guides/email-calendar.md:36-42`) |
| 11 | Gửi email từ CRM | ↑ ~ ~ ✓ ✓ | 2✓ +2~ | **Thiếu** | Quyền chỉ đọc (`oauth.ts:24,29`); không có màn soạn thư |
| 12 | Đồng bộ lịch | ✓ ~ ✓ ✓ ✓ | 4✓ +1~ | **Một phần** | Chỉ đọc địa chỉ ICS (`schema.ts:559`, `docs/guides/email-calendar.md:44-52`); sự kiện ghi thành hoạt động "meeting" trên liên hệ (`ingest.ts:138-148`). Docs tự ghi lịch qua OAuth "deferred" |
| 13 | Tìm kiếm toàn cục | ✓ ✓ ? ✓ ✓ | 4/5 | **Một phần** | Có: ⌘K và `/api/search`. Phạm vi hẹp: liên hệ theo tên và email, công ty theo tên và domain, deal theo tên, thêm chuỗi của bản ghi đối tượng tuỳ chỉnh (`src/lib/services/search.ts:41-64`). Không tìm theo số điện thoại, ghi chú, việc, custom field của liên hệ/công ty/deal. Pipedrive tìm cả điện thoại, ghi chú, custom field; HubSpot tìm cả ghi chú, điện thoại; Attio tìm cả điện thoại |
| 14 | Lọc, sắp xếp, saved view | ✓ ✓ ? ✓ ~ | 3✓ +1~ | **Một phần** | Có saved view cho liên hệ, công ty, deal, việc và đối tượng tuỳ chỉnh (`src/app/api/saved-views/route.ts:9-25`; `e2e/saved-views.spec.ts:18-33`). Bộ lọc hẹp: liên hệ chỉ theo trạng thái + từ khoá + sắp xếp (`contacts-client.tsx:94-95`); công ty theo ngành + từ khoá (`companies-client.tsx:260`); deal theo pipeline + từ khoá (`deals-client.tsx:117-119`); việc theo mở/xong (`tasks-client.tsx:266`). Không lọc theo người phụ trách, ngày, số tiền, custom field; không có AND/OR. Tham số API: `src/lib/actions/schemas.ts:32-72` |
| 15 | Sửa và xoá hàng loạt | ✓ ✓ ? ✓ ✓ | 4/5 | **Thiếu** | Danh sách công ty có ô chọn nhưng chỉ để xuất file (`companies-client.tsx:565`, `docs/guides/import-export.md:46-50`). Không có sửa/xoá nhiều bản ghi trên giao diện hay REST; chữ "bulk" trong `src/lib/ratelimit.ts:60-65` chỉ là hạng mục giới hạn tốc độ |
| 16 | Nhập và xuất dữ liệu (CSV, Excel) | ✓ ✓ ✓ ✓ ✓ | 5/5 | **Một phần** | Nhập: chỉ liên hệ, chỉ CSV, tối đa 5.000 dòng (`import/contacts/route.ts:13`; `import-client.tsx:67`); không xem trước hay ghép cột. Xuất: liên hệ, công ty, deal, CSV (`export/[entity]/route.ts:15,72`); không xuất việc, ghi chú, hoạt động, đối tượng tuỳ chỉnh. Không nhập Excel; HubSpot nhận `.xlsx`, Attio xuất Excel. Docs ghi đây là chủ ý "CSV import stays contacts-only" (`plans/reports/brainstorm-260901-0228-crm-ai-parity.md:13`) |
| 17 | Trường tuỳ chỉnh | ✓ ✓ ✓ ✓ ~ | 4✓ +1~ | **Có** | Cho liên hệ, công ty, deal (`src/app/api/custom-fields/route.ts:11`), sáu kiểu: chữ, số, ngày, chọn một, ô tick, link (`src/lib/records.ts:9`); có bắt buộc. Việc và ghi chú không có custom field. Twenty liệt kê 18 kiểu, gồm chọn nhiều, tiền tệ, văn bản dài (https://docs.twenty.com/user-guide/data-model/capabilities/fields) |
| 18 | Báo cáo và bảng điều khiển có sẵn | ✓ ✓ ✓ ✓ ✓ | 5/5 | **Có** | `src/app/(app)/dashboard/`, `src/app/(app)/reports/reports-client.tsx:87-170`, `src/lib/services/stats.ts` |
| 19 | Người dùng tự dựng hoặc tuỳ biến báo cáo | ✓ ~ ✓ ✓ ✓ | 4✓ +1~ | **Thiếu** | Danh mục báo cáo cố định (`stats.ts:20,167`). Không báo cáo theo người phụ trách (`grep owner` trong `stats.ts`, `stats-payload.ts`, `reports-client.tsx` rỗng). Chỗ duy nhất tuỳ biến: tách bảng dự báo theo một custom field chọn một (`src/lib/forecast.ts:28`) |
| 20 | Dòng thời gian hoạt động trên hồ sơ | ~ ✓ ✓ ? ✓ | 3✓ +1~ | **Có** | Bảng `activities` (`schema.ts:311-327`), hiển thị `src/components/record-panels.tsx`. Hạn chế ở §5 mục I |
| 21 | Tự động hoá (workflow) | ↑ ~ ✓ ✓ ~ | 2✓ +2~ | **Có** | 8 sự kiện, 6 hành động (`src/lib/workflows/types.ts:1-37`); chạy trên hàng đợi (`engine.ts`) |
| 22 | Dùng trên điện thoại | ✓ ✓ ~ ✗ ~ | 2✓ +2~ | **Một phần** | Web thích ứng + PWA: `src/app/manifest.ts:3-19`, thanh điều hướng dưới `src/components/shell.tsx:150-153`; e2e `e2e/design-system.spec.ts:68,88,177`. Không có ứng dụng gốc, không làm việc ngoại tuyến. Pipedrive có app iOS/Android kèm lên lịch việc ngoại tuyến |

Cách đọc các dấu cho từng hàng nằm ở §3.2. Nguồn cụ thể của từng dấu:

- Mục 1: PD bảng gói ("People and organization management", cả 4 gói); HS trang Free ("Contact management"); SF PDF trang 2 ("Account, contact, lead, and opportunity management", Free trở lên); TW `data-model.md` (Companies, People).
- Mục 2: PD ("Customizable pipelines"); HS (Free có pipeline mặc định, Starter có 15 pipeline tuỳ chỉnh; stage có xác suất) ở trang knowledge base pipeline; SF trang `salesforce-starter` ("pipeline health, deal stages"); TW, AT qua tên bài hướng dẫn kanban (chưa mở nội dung).
- Mục 4: PD bảng gói ("Leads inbox"); HS trang Free ("Lead management"); SF PDF trang 2.
- Mục 5: TW `data-model.md` (đối tượng Notes); AT trang bản ghi (tab Notes); PD chỉ thấy "notes" là nội dung tìm kiếm được (`search-finding-what-you-need`).
- Mục 6: PD bảng gói ("File attachments"); AT trang bản ghi (tab Files); HS có trang knowledge base "Add and manage attachments on records" (chỉ thấy qua kết quả tìm kiếm); Twenty có hai trang mâu thuẫn (`data-model.md` nêu kiểu "File Attachment", trang `fields` thì không), nên để `?`.
- Mục 7: PD bảng gói ("Merge duplicate data" từ Lite) và bài `merge-duplicates`; HS `merge-records` ("All products and plans"; công cụ quản lý trùng tự động cần Professional); TW `releases` bản 1.3.0 ("merge two records into one"); AT `merge-and-delete-records` ("Available on all plans", chỉ công ty và người, mỗi lần một cặp).
- Mục 8: PD bảng gói ("Products catalog" từ Lite); HS `create-and-manage-products` ("All products and plans"); SF PDF trang 2 ("Products and price books": Starter có, Free chỉ 1 bảng giá).
- Mục 9: PD bảng gói ("Notifications"); HS `tasks/create-tasks` (nhắc qua email cho chủ việc); AT trang `tasks` (nhắc hằng ngày các việc đến hạn); TW chỉ có mẫu workflow "Send Email Alerts with Tasks Due"; SF có trang "Activity Reminders and Notifications" nhưng nội dung không đọc được.
- Mục 10–12: SF PDF trang 2 ("Email and calendar sync": Starter có, Free chỉ Google); AT trang giá ("Email & calendar sync: 1 account per user" ở Free); TW trang giá ("Internet accounts per user") và `key-features` ("Google Workspace or Microsoft 365"); PD: "Smart Bcc" và "Calendar sync" từ Lite, "Email sync" từ Growth; HS trang Free ("Email tracking", "Email templates", bộ đặt lịch họp đồng bộ lịch); TW `can-i-send-emails-from-twenty.md` ("Compose email"); AT trang bản ghi ("Compose email").
- Mục 13: PD `search-finding-what-you-need`; HS `search-within-your-hubspot-account`; TW `navigate-around-twenty`; AT `navigating-your-workspace`.
- Mục 14: PD `filtering` (bộ lọc dùng chung hoặc riêng, yêu thích); HS `create-and-manage-saved-views` ("All products and plans"); TW `key-features` (lọc AND/OR, lưu view).
- Mục 15: PD `bulk-editing-and-filtering`; HS `bulk-edit-records` ("All products and plans"); TW `releases` bản 0.22.0 (xoá đến 10.000 bản ghi một lần); AT `merge-and-delete-records` (xoá hàng loạt bằng ô chọn).
- Mục 16: PD bảng gói ("Data import and export"); HS trang Free ("CRM import"); SF PDF trang 1 (Free: "data import"); TW `key-features` (nhập CSV, xuất bất cứ lúc nào); AT trang giá (nhập CSV).
- Mục 17: PD bảng gói; HS trang Starter (10 custom property ở Free, 1.000 ở Starter); SF PDF trang 3 ("Custom fields", Free trở lên); TW trang giá; AT trang giá liệt kê nhưng không nói gói nào.
- Mục 18, 19: PD ("Insights reporting", "Insights dashboard", "AI-powered report creation", từ Lite); HS Free ("Reporting dashboard"); SF PDF ("Customizable reports and dashboards", Free trở lên); TW `key-features` ("Build custom dashboards") và trang giá ("Number of dashboards: Unlimited"); AT trang giá (Free tối đa 3 báo cáo).
- Mục 20: HS trang Free ("view communication history"); SF PDF ("Task management and activity feed"); AT trang bản ghi (tab Activity); PD "Contacts timeline" chỉ từ Growth.
- Mục 21: SF PDF ("Process automation with flows": 5 flow ở cả ba gói); TW trang giá ("Workflows"); HS Starter ("Deal Pipeline Automation"); PD "Automations" từ Growth.
- Mục 22: PD bảng gói ("Mobile Android and iOS apps"); HS trang Free ("HubSpot mobile app"); SF trang giá có liệt "Salesforce Mobile App" nhưng không rõ gói; AT chỉ có liên kết app ở chân trang; TW không thấy app gốc (bản 2.38.1 chỉ nói giao diện thích ứng).

### 4.2. Ngoài ngưỡng "cơ bản" (17 mục)

| # | Năng lực | PD · HS · SF · TW · AT | Kết luận về nguồn | Fourty | Bằng chứng Fourty |
|---|---|---|---|---|---|
| a | Lý do thua | ✓ ✓ ? ? ? | Chưa đủ nguồn, nhưng có ở cả hai nguồn gần Fourty nhất. PD hỏi lý do ngay khi đánh dấu mất, danh sách soạn sẵn tối đa 100; HS có thuộc tính mặc định "Closed lost reason" ở mọi gói | **Thiếu** | Deal không có cột lý do (`schema.ts:250-277`); kéo sang stage mất không hỏi gì (`update.ts:58-83`); `grep reason` trong `src/lib/actions` và UI deal rỗng. Cách vòng đã định: custom field `loss_reason` (advisor §12) |
| b | Nhiều người liên hệ trên một deal | ✓ ? ? ? ? | Chưa đủ nguồn (PD có "participants") | **Thiếu** | Deal chỉ một `contactId` (`schema.ts:261`, `validators.ts:46`) |
| c | Nhãn, chọn nhiều giá trị | ✓ ? ? ~ ? | Chưa đủ nguồn (PD có nhãn cho deal, lead, liên hệ; TW có kiểu Multi-Select) | **Thiếu** | Custom field "chọn một" nhận đúng một giá trị (`records.ts:57-62`) |
| d | Xoá mềm, khôi phục | ? ? ? ✓ ✗ | Trái chiều: TW "soft and hard deletes"; AT nói bản ghi xoá thì "cannot be recovered" | **Thiếu** | Xoá cứng, kèm xoá ghi chú và hoạt động của bản ghi (`src/lib/actions/contacts/delete.ts:38-40`, `companies/delete.ts:36-41`). Nhật ký kiểm toán chỉ ghi việc đã xoá |
| e | Quyền xem hoặc sửa theo từng bản ghi | ✓ ✓ ? ↑ ? | Chưa đủ nguồn. PD "Visibility options" từ Lite; HS Free "control permissions for records"; TW chỉ cho quyền theo hàng ở gói Organization (Pro: "No"); AT có dòng "Access permissions" (Free: None, Plus: Basic) nhưng không nói cấp độ bản ghi | **Thiếu** | Thành viên đọc và sửa mọi bản ghi CRM (`src/lib/permissions.ts:54-60`). Có quyền theo trường (ADR-011). Chủ của liên hệ và công ty chỉ là người tạo, không đổi được (`contacts/create.ts:33`; `contactInput` ở `validators.ts:7-22` không có `ownerId`). Deal và việc thì đổi được |
| f | Mẫu email | ↑ ✓ ~ ? ? | Chưa đủ nguồn | **Thiếu** | `mail-templates.ts` chỉ là thư hệ thống |
| g | Đặt lịch họp bằng đường link | ↑ ✓ ~ ? ? | Chưa đủ nguồn | **Thiếu** | Không có |
| h | Xem công việc theo lịch | ✓ ? ? ✓ ? | Chưa đủ nguồn | **Thiếu** | Trang việc là danh sách (`tasks-client.tsx:266`) |
| i | Lịch sử giá trị cũ sang mới của từng trường | ? ? ? ? ? | Nguồn chưa kiểm (chỉ thấy tên trang HubSpot "Undo property value changes") | **Thiếu** | Chỉ stage và owner có "từ A sang B" (`update.ts:104-131`); sửa trường khác chỉ ghi tên trường (`record-panels.tsx:61-63`); `auditMeta` không mang giá trị (`src/lib/actions/deals/shared.ts:38-40`) |
| j | Báo giá | ↑ ? ↑ ✗ ✗ | Không cơ bản. PD cần Smart Docs (add-on ở Lite và Growth); SF chỉ ở Pro Suite | **Thiếu** | Không có |
| k | Mục tiêu, chỉ tiêu theo người hoặc quý | ↑ ↑ ↑ ✗ ✗ | Không cơ bản (PD từ Premium; HS và SF từ gói Pro) | **Thiếu** | Không có bảng hay cột mục tiêu (`grep goal src` rỗng; `quota` chỉ là hạn mức AI ở `src/lib/ai/quota.ts`) |
| l | Dự báo doanh thu theo kỳ | ↑ ↑ ↑ ? ? | Không cơ bản (PD từ Growth, HS và SF từ Pro) | **Có** | `src/lib/forecast.ts:45`; `reports-client.tsx:149-162`; `docs/guides/analytics.md:35-51` |
| m | Nhật ký kiểm toán toàn hệ thống | ✓ ? ? ↑ ? | Không cơ bản. PD có ở mọi gói; TW từ gói Organization | **Có** | Bảng không sửa, không xoá được: `schema.ts:77-93`, `drizzle/0004_audit_rls.sql:23-25` |
| n | API và webhook | ✓ ? ? ✓ ~ | Biên | **Có** (webhook hẹp) | REST, GraphQL, MCP (`src/app/api/graphql/route.ts`, `src/app/api/mcp/route.ts`). Webhook chỉ qua hành động của workflow (`engine.ts:147`), 8 sự kiện, không có sự kiện "deal đổi giá trị" hay "xoá" (`types.ts:1-9`); `docs/api/webhooks.md:6-10` |
| o | Sao lưu và khôi phục dành cho khách | không nguồn nào liệt kê | Ngoài danh sách (bản đám mây tự lo) | **Một phần** | Cấp vận hành: `pg_dump` và `npm run backup-drill` (`docs/self-hosting/operations.md:6-14`, `package.json:27`). Không có khôi phục trong ứng dụng; xuất dữ liệu chỉ 3 loại bản ghi |
| p | Giao diện tiếng Việt, tiền VND | ? ? ? ~ ? | Chưa kiểm. TW ghi "Languages 30+"; không nguồn nào xác nhận tiếng Việt | **Có** | Hai danh mục `en`, `vi` (`src/lib/i18n/index.ts:9-17`), 1.053 và 1.052 khoá (thiếu `page.workflows.subtitle`); VND có sẵn (`src/lib/currency.ts:8-21`); số tiền hiện dạng "tỷ" (`currency.ts:79-84`) |
| q | Ghi cuộc gọi hoặc cuộc họp thủ công kèm ngày giờ | ✓ ? ? ? ? | Chưa đủ nguồn (PD: loại gọi, họp, việc, hạn chót, email, bữa trưa, có ngày giờ) | **Một phần** | Nút ghi một chạm, không gửi ghi chú, không ngày giờ, không thời lượng (`record-panels.tsx:151-154`; `activityLogInput` ở `validators.ts:74-79` có `note` nhưng giao diện không dùng) |

Quản trị thành viên (nhóm, vai trò, lời mời, vô hiệu hoá): xem báo cáo riêng.

## 5. Chỗ thiếu và chỗ có một phần, kèm tình huống PilotCo

Dữ liệu PilotCo lấy từ advisor: 11 cơ hội, 8 stage, pipeline duy nhất `Sales`, DVHai đứng tên 9/11 dòng (advisor §2). Tình huống ghi "minh hoạ" là tôi dựng để nhìn tác động, không phải dữ liệu thật.

### Thiếu (6 mục cơ bản + 11 mục ngoài ngưỡng)

**A. Tệp đính kèm** (#6). Chỗ để cất hợp đồng, PO, bảng tải, ảnh khảo sát. Advisor §5 ghi khảo sát thực địa là mốc chốt uy tín của PilotCo và stage 3 là "Khảo sát & thiết kế giải pháp". Minh hoạ: LTHoa khảo sát Fiesta, có ảnh và bản vẽ. Trong Fourty không có chỗ gắn tệp vào deal; chỉ dán được một đường link vào một custom field kiểu link (`records.ts:9`) hoặc vào ghi chú.

**B. Gửi email và mẫu email** (#11, f). Advisor §12 có workflow "vào Đã gửi đề xuất / Báo giá thì tạo task follow-up hạn 7 ngày". Thư báo giá vẫn soạn và gửi ngoài Fourty. Nếu hộp thư đã kết nối, thư đến chỉ hiện trên liên hệ, không hiện trên deal, nên mở deal Điện lực sẽ không thấy thư qua lại.

**C. Nhắc việc, thông báo** (#9). Advisor §6 dòng 1 có task "hỏi DVHai tình trạng thật của Điện lực Vùng 1". Task chỉ hiện trong danh sách việc và trên dashboard; quá hạn thì chữ chuyển đỏ khi có người mở dashboard. Không có thư hay tin báo đẩy tới DVHai.

**D. Sửa, xoá hàng loạt** (#15). Khi cần giao lại 9 deal đang đứng tên DVHai, Fourty đổi được owner từng deal (có ghi "changed owner: A → B"), nhưng phải mở từng deal một. Cũng không có cách chọn nhiều deal để chuyển stage cùng lúc.

**E. Lý do thua** (a). Advisor §5 đặt stage 8 "Không tiếp tục" với điều kiện vào là "có lý do mất". Fourty không kiểm điều kiện đó: kéo deal sang stage mất là xong, không hỏi gì. Cách vòng advisor đã chọn: custom field `loss_reason` và một workflow tạo task bổ sung lý do hạn 1 ngày. Vậy lý do được điền sau, bằng việc nhắc, thay vì lúc đóng deal.

**F. Dòng sản phẩm** (#8). Advisor §4 kịch bản C: Fiesta 20 tỷ có thể là giá trị cả dự án điện mặt trời, trong khi PilotCo là nhà phân phối pin Pytes. Deal chỉ có một con số `amount`; không có chỗ tách pin, thiết bị, dịch vụ. Phân biệt "phần PilotCo xuất hoá đơn" với "tổng dự án" hiện nhờ custom field `value_basis` (advisor §12).

**G. Báo cáo tự dựng, báo cáo theo người phụ trách, mục tiêu** (#19, k). Ban điều hành xem báo cáo trong Fourty (advisor §9, Q7 = A). Muốn xem "pipeline theo từng người phụ trách" thì không có, vì thống kê không có chiều owner. Bảng dự báo theo quý tách được theo `sales_motion` nhưng không theo owner. Cũng không có chỗ nhập chỉ tiêu quý của từng người để so với dự báo.

**H. Xoá mềm** (d). Minh hoạ: xoá nhầm Company "Vạn Cát" thì mất luôn ghi chú và lịch sử của nó. Chỉ nhật ký kiểm toán còn dòng "đã xoá", không có nội dung để khôi phục.

**I. Nhiều liên hệ trên một deal** (b). Minh hoạ: gói Điện lực thường có người phụ trách kỹ thuật, mua sắm, lãnh đạo. Deal giữ một liên hệ; những người còn lại chỉ ghi được trong ghi chú.

**J. Nhãn, chọn nhiều giá trị** (c). Minh hoạ: gắn đồng thời "đã khảo sát" và "chờ hồ sơ pháp lý" cho một deal. Custom field chọn một chỉ giữ một giá trị. Advisor §12 phải dùng custom field chọn một có tên thành viên làm `co_owner` vì Fourty không có kiểu trường "người dùng".

**K. Quyền theo bản ghi** (e). Thành viên nào cũng đọc, sửa mọi deal (advisor §3: `co_owner` không phải vấn đề quyền). Với đội 5 người điều này có thể là chủ ý; báo cáo chỉ ghi nhận sự thật.

**L. Lịch sử giá trị cũ sang mới** (i). Dòng thời gian của deal ghi "Cập nhật: amount, expectedCloseDate" chứ không ghi 80 tỷ thành 60 tỷ, hay ngày 15/12 thành 31/12 (`record-panels.tsx:61-63`). Chỉ đổi stage và đổi owner có "từ A sang B". Minh hoạ: Ban điều hành hỏi vì sao giá trị Điện lực Vùng 2 đổi trong tháng; dòng thời gian cho biết có đổi, không cho biết đổi từ bao nhiêu.

**M. Báo giá, đặt lịch họp, xem việc theo lịch** (j, g, h). Đều ngoài ngưỡng cơ bản hoặc chưa đủ nguồn (§4.2). Báo giá hiện là tệp ngoài, không gắn vào deal vì không có chỗ đính kèm (xem A).

### Có một phần (8 mục cơ bản + 2 mục ngoài ngưỡng)

**Nhập, xuất** (#16). Advisor §11 Q17 đã chọn nhập 11 deal bằng script gọi REST, vì Fourty không có nhập CSV cho deal. Xuất ghi chú hoặc việc thì không có. Đây không phải điều bất ngờ: brainstorm 01/09 ghi "CSV import stays contacts-only".

**Bộ lọc** (#14). Các câu hỏi "deal của DVHai", "deal dự kiến ký quý 4", "deal đấu thầu" không trả lời được bằng bộ lọc danh sách. Danh sách deal chỉ lọc theo pipeline và từ khoá (`deals-client.tsx:117-119`). Riêng "theo loại hình" thì bảng dự báo trong Reports làm được nếu admin chọn `sales_motion` làm trường tách cột.

**Tìm kiếm** (#13). Gõ số điện thoại của ông Đỗ Văn Khải (advisor §6 dòng 10, bán lẻ 4 nhà hàng) không ra liên hệ vì chỉ tìm theo tên và email (`search.ts:41-64`). Nội dung ghi chú không được tìm.

**Ghi chú không sửa, không xoá** (#5). Minh hoạ: ghi nhầm "800 tỷ" thay vì "80 tỷ" vào một ghi chú; dòng đó ở trên dòng thời gian đến khi cả bản ghi bị xoá.

**Đồng bộ email** (#10). Thư chỉ gắn vào liên hệ khớp theo địa chỉ email. Một liên hệ Điện lực có nhiều deal thì thư không biết thuộc deal nào, và bản thân deal không hiện thư. Tài liệu `docs/guides/email-calendar.md:14-15` ghi thư xếp lên dòng thời gian "của liên hệ và deal"; code chỉ ghi vào liên hệ (§7). Việc hộp thư của PilotCo đã được kết nối chưa: chưa kiểm (§8).

**Đồng bộ lịch** (#12). Lịch Google hay Outlook của DVHai chỉ vào được bằng đường link ICS của lịch; cuộc họp tạo trong CRM không đẩy ngược ra lịch.

**Dùng trên điện thoại** (#22). Có thể cài như PWA và dùng thanh điều hướng dưới. Không có ứng dụng gốc, không ngoại tuyến. Khi đi khảo sát thực địa mất sóng, không ghi được gì cho tới khi có mạng.

**Gộp trùng** (#7). Phát hiện có cho liên hệ, gộp không có cho loại nào. Advisor §8 cảnh báo: tạo Company giả cho đối tác Thái Lan chưa có tên, sau này có tên thật thì thành hai bản ghi trùng. Trong Fourty cách xử lý duy nhất là chép tay dữ liệu sang một bản ghi rồi xoá bản ghi kia, và việc xoá kéo theo ghi chú và hoạt động của nó (`src/lib/actions/companies/delete.ts:36-41`).

**Ghi cuộc gọi, họp** (q). Bấm "Gọi" ghi một dòng "call" lúc bấm; không ghi nội dung hay thời lượng.

**Sao lưu** (o). Sao lưu là việc người vận hành làm bằng `pg_dump` trên máy chủ. Người dùng cuối không tự tải toàn bộ dữ liệu của mình ra được; xuất CSV chỉ có 3 loại bản ghi.

## 6. Fourty có, mà không phải nguồn nào ở bậc nhập cũng có

Ngắn, chỉ những điểm đã kiểm cả hai phía. Điểm nào một vài nguồn cũng có thì ghi rõ:

- **Dự báo có trọng số theo quý và năm**, tách cột theo một custom field, tính theo ngày ký hoặc ngày giao (`src/lib/forecast.ts`). Pipedrive từ Growth, HubSpot và Salesforce từ gói Pro.
- **Tiền tệ báo cáo theo workspace, tỷ giá admin tự nhập, số tiền hiện "tỷ"** (`docs/guides/pipeline.md:57-60`, `currency.ts:79-84`). Cả năm nguồn: chưa kiểm điểm này.
- **Đối tượng tuỳ chỉnh** (custom objects). Salesforce chỉ có ở Pro Suite; Twenty và Attio có.
- **Quyền theo trường** (ADR-011). Twenty Pro có ("Field-level permissions"); bốn nguồn còn lại chưa kiểm.
- **Điểm số tự động cho liên hệ và deal, gợi ý bước kế tiếp** (`src/lib/scoring.ts`, `src/lib/deal-scoring.ts`, `src/lib/next-action.ts`). Salesforce Starter có "automated lead scoring"; Pipedrive chấm điểm tuỳ chỉnh từ Premium.
- **Máy chủ MCP và trợ lý AI tự mang khoá** (`src/mcp/`, `src/app/api/ai/chat`). Twenty và Attio cũng liệt kê MCP.
- **Tự điền chức danh và liên kết công ty từ hộp thư, mỗi thay đổi kèm bằng chứng và hoàn tác được** (`src/lib/research/`, ADR-018). Không nguồn nào trong năm có điều tương đương trên trang đã mở; chưa kiểm sâu.
- **Tự dựng bằng một tiến trình và một Postgres, cô lập từng workspace bằng RLS** (`drizzle/0002_rls.sql`). Đây là cách vận hành, không so trực tiếp được với bản đám mây của các nguồn.

## 7. Chỗ tài liệu của Fourty nói khác code

- `docs/guides/email-calendar.md:14-15` ghi thư "xếp lên dòng thời gian của liên hệ và deal". Code `src/lib/sync/ingest.ts:94-102` chỉ ghi hoạt động với `entityType: "contact"`, và `grep -w deal src/lib/sync` không có kết quả.

Phần còn lại của docs đã đối chiếu (ghi chú chỉ thêm, nhập CSV chỉ cho liên hệ, xuất ba loại, thanh điều hướng dưới trên di động, đổi owner của deal, dự báo theo quý) khớp với code.

## 8. Điều chưa kiểm

**Về nguồn đối chiếu**

- Salesforce: bảng so sánh gói (PDF) không có dòng cho ghi chú, tệp, gộp trùng, tìm kiếm, bộ lọc, thao tác hàng loạt, ứng dụng di động, API ở bậc Starter. Các ô đó để `?`. Trang trợ giúp "Activity Reminders and Notifications" mở được nhưng thân bài không đọc được.
- HubSpot: ghi chú, lý do thua ở các tuỳ chọn tuỳ chỉnh, nhiều liên hệ trên deal, nhãn, xoá mềm, lưu trữ tệp ở bậc Free (chỉ thấy tên trang). Trang giá HubSpot không có bảng tính năng.
- Pipedrive: trang ghi chú, giao diện tiếng Việt (trang đổi ngôn ngữ không liệt kê ngôn ngữ), xoá mềm có khôi phục (bài về bộ lọc "deleted deals" không nói khôi phục).
- Twenty: tệp đính kèm (hai trang mâu thuẫn), mẫu email, ứng dụng di động.
- Attio: bậc của custom attribute, API, ứng dụng di động; chế độ xem, bộ lọc, nhập/xuất đọc qua tóm tắt kết quả tìm kiếm, chưa mở trang.
- Giá, giới hạn số bản ghi, giới hạn số người dùng của từng gói: không thuộc phạm vi.

**Về Fourty**

- Hộp thư Gmail/Microsoft của PilotCo đã được kết nối trên `crm.example.com` chưa: không đọc `.env`, không vào production.
- Production đang chạy đúng commit nào: chưa kiểm.
- Chất lượng bản dịch: chỉ so khoá giữa `en.ts` và `vi.ts` (1.053 và 1.052; 9 chuỗi trùng chữ Anh đều là chuỗi kỹ thuật). Chưa đọc từng câu tiếng Việt.
- Số công cụ MCP: docs ghi 39; `src/mcp/tools.ts` tự khai báo 25 tên, phần còn lại đến từ action registry. Chưa đếm đủ.
- Chạy thử trên giao diện: chưa. Toàn bộ trạng thái dựa vào đọc code, schema, docs và tên test e2e. Chưa chạy lại test.

## 9. Câu hỏi còn mở (chỗ trống cần điền)

Báo cáo này không khuyến nghị phương án nào.

**Q1. Ngưỡng "cơ bản".** (A) Giữ 3/5 nguồn ở bậc nhập · (B) Siết 4/5 nguồn · (C) Chỉ tính Pipedrive và HubSpot, vì cùng loại CRM xoay quanh deal. Hệ quả: (B) bảng 4.1 chỉ còn các mục có ít nhất 4 dấu ✓ (mục 1, 3, 7, 12, 13, 15, 16, 17, 18, 19), 12 mục còn lại chuyển sang 4.2; (C) thêm lý do thua (a) và quyền theo bản ghi (e) vào bảng 4.1, vì cả Pipedrive lẫn HubSpot đều ✓.

**Q2. Mốc so sánh.** (A) Bậc nhập của nhà cung cấp, như báo cáo này · (B) Gói trả phí tầm trung của từng nhà cung cấp (Growth, Professional, Pro Suite) · (C) Chỉ theo nhu cầu PilotCo (11 deal, 5 người), không theo nhà cung cấp.

**Q3. Các mục "chưa đủ nguồn"** (lý do thua, nhiều liên hệ, nhãn, xoá mềm, quyền theo bản ghi, mẫu email, đặt lịch họp, xem việc theo lịch, lịch sử giá trị). (A) Kiểm thêm bằng tài khoản dùng thử của từng nguồn · (B) Giữ nguyên trạng thái "chưa đủ nguồn".

**Q4. Hộp thư của PilotCo.** Gmail/Microsoft đã kết nối trên `crm.example.com` chưa? (A) Đã kết nối · (B) Chưa · (C) Không rõ, cần người có quyền xem Settings → Mailboxes kiểm.

**Q5. Chỗ tài liệu và code lệch (§7).** (A) Ghi nhận như một việc riêng, chưa quyết sửa bên nào · (B) Bỏ qua ở báo cáo này.

## 10. Quyết định (13/10/2026, Leo)

| Câu | Chọn | Nghĩa |
|---|---|---|
| Q66 (Q1, Q2) | A | Giữ 22 mục (ít nhất 3/5 nguồn ở bậc nhập) làm danh sách kiểm; chọn việc làm trước theo nhu cầu bán hàng của PilotCo (hỏi ở vòng sau) |
| Q67 (Q4) | A | Đã kiểm 13/10/2026 bằng `GET /api/sync/accounts` trên `crm.example.com` (chỉ đọc): **0** hộp thư hoặc lịch đã nối. Chỗ thiếu "thư chỉ gắn vào liên hệ" (#10) chưa ảnh hưởng PilotCo lúc này |
| Q68 (Q5) | A | Sửa `docs/guides/email-calendar.md` cho khớp code: thư chỉ gắn vào liên hệ, không gắn vào deal |
| Q3 | chưa hỏi | Các mục "chưa đủ nguồn" giữ nguyên trạng thái |

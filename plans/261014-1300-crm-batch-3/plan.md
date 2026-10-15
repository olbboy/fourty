---
title: "Đợt 3: các tính năng CRM còn lại"
date: 2026-10-14
status: "Xong"
nguon:
  - "plans/reports/research-261013-1649-crm-baseline-feature-gaps.md (mục 4.1, 4.2, 5)"
  - "plans/reports/research-261013-1649-user-administration.md (T9–T14)"
  - "plans/261013-1808-team-and-crm-basics/plan.md và plans/261014-0401-crm-batch-2/plan.md, mục ngoài phạm vi"
  - "Rà code ngày 14/10/2026 trên 5b6bb14: 16 mục, 12 chưa có, 4 có một phần"
  - "Leo giao toàn quyền (14/10/2026): tự chốt, tự test, deploy, chỉ báo khi đã deploy xong"
---

# Đợt 3

Mọi việc còn lại của hai báo cáo nghiên cứu và hai đợt trước, trừ những việc ghi ở "Để ngoài" kèm lý do.

Cách làm như đợt 2: mỗi phase viết test trước ở seam của nó, toàn bộ unit và e2e phải đạt. Làm theo ba lượt; mỗi lượt có một vòng review hai chiều (chuẩn code, đúng quyết định), một PR, merge, backup rồi deploy.

## Quyết định do Claude chốt (Leo giao toàn quyền)

| # | Việc | Quyết định | Vì sao |
|---|---|---|---|
| D7 | Owner của liên hệ và công ty | Sửa được owner của liên hệ và công ty sau khi tạo (form, REST, GraphQL, MCP), lọc danh sách theo owner, đổi owner hàng loạt như deal. Đổi owner ghi "changed owner: A → B" lên dòng thời gian | Bàn giao khi có người nghỉ (T7) mới làm xong cho deal và việc |
| D8 | Thao tác hàng loạt | Tick chọn nhiều trên danh sách deal, liên hệ và công ty. Deal: chuyển stage, đổi owner, xoá. Liên hệ và công ty: đổi owner, xoá. Việc: mỗi dòng đã có ô tick "xong", thêm ô chọn thứ hai dễ nhầm, nên giữ cách đợt 1: lọc theo owner rồi đổi owner, đánh dấu xong hoặc xoá mọi việc đang hiện. Xoá đưa vào Thùng rác. Tất cả hoặc không: một bản ghi không hợp lệ (vào stage thua mà thiếu lý do, khác pipeline) thì không bản ghi nào đổi | Mục 15 của báo cáo (4/5 nguồn); tất cả hoặc không như đổi owner hàng loạt đã có |
| D9 | Tìm kiếm | Tìm liên hệ theo số điện thoại (bỏ dấu cách, chấm, gạch, ngoặc, dấu cộng khi so; số Việt Nam viết 0903… hay +84 903… là một) và tìm trong nội dung ghi chú (trả về bản ghi có ghi chú đó) ở ⌘K và `/api/search`. `search` của MCP giữ nguyên quy tắc khớp chính xác hoặc tiền tố, cũng áp cho số điện thoại | Mục 13; MCP cố ý không khớp mờ (docs/api/mcp.md) |
| D10 | Ghi cuộc gọi, cuộc họp | Ghi một cuộc gọi, cuộc họp hay email kèm nội dung, thời điểm diễn ra (mặc định bây giờ, không quá 1 ngày tới tương lai) và thời lượng phút (cho cuộc gọi và cuộc họp; email không có thời lượng). Dòng thời gian xếp theo thời điểm diễn ra | Mục q; trường `note` đã có trong API, chỉ giao diện chưa dùng |
| D11 | Trường chọn nhiều | Kiểu custom field mới "chọn nhiều" (nhãn) cho liên hệ, công ty, deal. Lọc theo một lựa chọn thì khớp bản ghi có lựa chọn đó. Trường tách cột của dự báo vẫn chỉ nhận trường chọn một | Mục c; trường tách cột cần mỗi deal đúng một cột |
| D12 | Việc theo lịch | Trang Việc có thêm dạng lịch tháng: việc nằm ở ngày đến hạn, quá hạn tô đỏ, bấm mở việc; lọc theo owner và trạng thái như dạng danh sách | Mục h |
| D13 | Gộp trùng | Gộp hai liên hệ, hoặc hai công ty: chọn bản giữ lại; deal, người liên hệ trên deal, việc, ghi chú, dòng thời gian và thư của bản kia chuyển sang; ô trống của bản giữ lại lấy giá trị bản kia; bản kia vào Thùng rác. Ghi một dòng "đã gộp" trên dòng thời gian | Mục 7 (4/5 nguồn); vào Thùng rác để gộp nhầm còn đường lui |
| D14 | Nhập, xuất | Nhập deal từ CSV (tên, giá trị, tiền tệ, pipeline, stage theo tên, ngày dự kiến ký, owner theo email hoặc tên, công ty theo tên, liên hệ theo email, custom field theo nhãn). Công ty chưa có thì tạo mới; ô owner trống thì deal thuộc người nhập. Xem trước rồi mới ghi, tất cả hoặc không. Xuất CSV thêm việc và ghi chú | Mục 16; advisor phải nhập 11 deal bằng script |
| D15 | Mẫu email | Mẫu email của workspace (tên, tiêu đề, nội dung) với chỗ điền `{{contact.firstName}}`, `{{contact.lastName}}`, `{{company.name}}`, `{{deal.name}}`, `{{sender.name}}`. Chọn mẫu khi soạn thì điền sẵn tiêu đề và nội dung, vẫn sửa được trước khi gửi. Thành viên tạo và sửa mẫu | Mục f; gửi email đã có từ đợt 2 |
| D16 | Báo giá | Từ deal có dòng sản phẩm, tạo báo giá: số báo giá tăng dần theo workspace (BG-2026-0001), ngày lập, hạn hiệu lực (mặc định 30 ngày), bên mua (công ty, liên hệ chính), các dòng, tổng, ghi chú điều khoản. Báo giá là bản chụp: đổi deal sau đó không đổi báo giá đã lập. Trang in được (lưu PDF bằng trình duyệt). Danh sách báo giá trên deal; dòng thời gian ghi "đã lập báo giá" | Mục j và danh sách "đợt sau"; bản chụp vì báo giá đã gửi khách không được tự đổi |
| D17 | Chỉ tiêu theo người | Admin đặt chỉ tiêu theo quý cho từng thành viên, tính bằng tiền báo cáo. Báo cáo có bảng theo người cho một quý: chỉ tiêu, đã thắng (deal thắng có ngày đóng trong quý), dự báo có trọng số (deal mở có ngày dự kiến ký trong quý), % đạt; thêm thắng/thua theo người | Mục k, mục 19 (báo cáo theo người phụ trách) |
| D18 | Nhật ký kiểm toán | Lọc theo người, theo loại hành động, theo khoảng ngày, trên giao diện và API; CSV có thêm tên và email người làm | T13 |
| D19 | Thành viên | Admin kích hoạt lại thành viên đã gỡ ngay trong danh sách (vai trò cũ, ghi nhật ký). Mỗi người tự ghi chức danh và số điện thoại trong "Tài khoản của tôi"; danh sách thành viên hiện hai thông tin này | T10, T12 |
| D20 | Sự kiện cho workflow và webhook | Thêm sự kiện "giá trị deal đổi" (Amount, ngày dự kiến ký, ngày giao) và "bản ghi bị xoá" (liên hệ, công ty, deal) | Mục n; workflow là đường webhook duy nhất |
| D21 | Thư đồng bộ trên deal | Thư đồng bộ từ hộp thư, ngoài dòng thời gian của liên hệ, còn ghi lên các deal đang mở mà liên hệ đó là liên hệ chính hoặc người liên hệ trên deal | Mục 10; hôm nay production chưa nối hộp thư nào (Q67), nên chưa ảnh hưởng ai |

## Để ngoài, kèm lý do

- **Tệp đính kèm**: Leo đã chọn dùng ô link (Q71 = A).
- **Gửi thư bằng chính hộp Gmail/Microsoft, đẩy lịch ngược ra Google/Outlook, đặt lịch họp bằng đường link**: cần đổi quyền OAuth và Google/Microsoft duyệt lại ứng dụng; production chưa nối hộp thư nào (Q67) nên không test được đầu cuối.
- **Ứng dụng điện thoại gốc, dùng khi mất mạng**: là một sản phẩm riêng; web và PWA đang dùng được trên điện thoại.
- **Người dùng tự dựng báo cáo**: lớn; nhu cầu đã nêu (theo người phụ trách, chỉ tiêu) có ở D17.
- **Quyền xem theo từng bản ghi**: báo cáo nghiên cứu ghi với đội 5 người có thể là chủ ý; đổi mô hình quyền là quyết định của Leo, không tự chốt.
- **Thông báo trong ứng dụng (chuông)**: nhắc việc đã đi bằng email mỗi sáng (đợt 1).
- **Quản trị tài khoản ở mức cả instance, quản trị qua GraphQL/MCP** (T9, T11, T14): vượt phạm vi một đội bán hàng một workspace; T14 báo cáo ghi có thể là chủ ý.

## Lượt 1 — việc hằng ngày

- **Phase 16 (D7)**: seam `contacts.update`, `companies.update` (ownerId), `contacts.list`/`companies.list` (ownerId), `POST /api/contacts/reassign`, `POST /api/companies/reassign`. E2E: đổi owner một liên hệ trên form.
- **Phase 17 (D8)**: seam `POST /api/deals/bulk-move`, `POST /api/{deals,contacts,companies,tasks}/bulk-delete`, `POST /api/tasks/bulk-complete` (mỗi route một action, như `reassign`). E2E: chọn hai deal, chuyển stage rồi xoá.
- **Phase 18 (D9)**: seam `searchCrm` qua `/api/search` và MCP `search`. E2E: ⌘K tìm theo số điện thoại.
- **Phase 19 (D10)**: seam `POST /api/activities` (occurredAt, durationMinutes, note). E2E: ghi một cuộc gọi có nội dung.
- **Phase 20 (D11)**: seam `POST /api/custom-fields` (multiselect), ghi và đọc trên bản ghi, lọc `fieldKey`/`fieldValue`. E2E: tạo trường nhãn, gắn hai nhãn.
- **Phase 21 (D12)**: giao diện; E2E: chuyển sang dạng lịch, thấy việc ở đúng ngày.

## Lượt 2 — bán hàng

- **Phase 22 (D13)**: seam `POST /api/contacts/{id}/merge`, `POST /api/companies/{id}/merge`. E2E: gộp hai liên hệ trùng.
- **Phase 23 (D14)**: seam `POST /api/import/deals` (`dryRun`), `/api/export/tasks`, `/api/export/notes`. E2E: nhập một CSV hai deal.
- **Phase 24 (D15)**: seam `/api/email-templates`, hàm điền mẫu. E2E: chọn mẫu khi soạn thư.
- **Phase 25 (D16)**: seam `POST /api/deals/{id}/quotes`, `GET /api/quotes/{id}`. E2E: lập báo giá từ deal có dòng, mở trang in.
- **Phase 26 (D17)**: seam `PUT /api/targets`, `GET /api/stats/owners`. E2E: đặt chỉ tiêu, thấy % đạt.

## Lượt 3 — quản trị và tích hợp

- **Phase 27 (D18)**: seam `GET /api/audit` (actorId, action, from, to, CSV). E2E: lọc nhật ký theo người.
- **Phase 28 (D19)**: seam `PATCH /api/members/{id}` (`reactivate`), `PATCH /api/me` (title, phone). E2E: kích hoạt lại một thành viên.
- **Phase 29 (D20)**: seam các action cập nhật và xoá phát sự kiện; danh sách sự kiện của workflow.
- **Phase 30 (D21)**: seam `ingestEmails`.

## Review lượt 1 (14/10/2026)

Hai chiều review chạy song song trên `5b6bb14...HEAD`. Đã sửa:
- **Tất cả hoặc không, đúng nhờ giao dịch.** Mỗi lần chạy một action là một savepoint (`withSavepoint` trong `execute`). Một lời từ chối ở bất cứ đâu bên trong, kể cả trong action lồng nhau, sẽ huỷ mọi thứ action đã ghi, dù giao dịch của request vẫn commit để trả lời. Có test riêng. Vì vậy bỏ bước kiểm quyền ghi Amount trước khi ghi trong `deals.setLines`.
- Chuyển hàng loạt vào stage thua: chỉ deal thật sự đổi stage mới cần lý do.
- Đánh dấu xong hàng loạt bỏ qua việc đã xong, giữ nguyên ngày xong cũ.
- Tìm "0000" từng khớp mọi số điện thoại. Giờ không còn; có test.
- Quyền theo trường cho owner:
  - Lọc theo owner bị từ chối khi trường owner bị ẩn.
  - Owner bị ẩn hiện "—" chứ không hiện "Chưa giao".
  - Ô owner trong form liên hệ và công ty theo quyền trường như form deal.
- Viewer không còn thấy ô chọn và thanh thao tác hàng loạt: `/api/field-permissions/me` trả thêm quyền sửa và xoá theo vai trò.
- Thanh thao tác của danh sách việc chỉ hiện ở dạng danh sách. "Đánh dấu xong" đi qua thanh nên báo lỗi như các nút khác.
- Trường đang làm cột dự báo hoặc lý do thua không đổi được sang kiểu khác "chọn một" (409); có test.
- Thời điểm diễn ra phải từ năm 2000 trở đi. Ô nhập có giới hạn; lỗi từ server hiện đúng chữ.
- E2E: ⌘K tìm theo số điện thoại. Tài liệu cho ghi cuộc gọi; công cụ `search` của MCP nhắc số điện thoại.
- Gọn code:
  - `reassign` dùng chung bước kiểm tồn tại của thao tác hàng loạt.
  - Resolver owner của GraphQL dùng chung.
  - `DATE_TAGS` dùng chung.
  - `today` đổi tên thành `startOfToday`.
  - Kiểu `BulkObject` dùng chung.

Giữ nguyên, có lý do:
- **Khớp 0903… với +84 903… ở MCP.** Đó là cùng một số, viết theo hai cách; số vẫn khớp từ đầu. Đã ghi vào D9.
- **Email không có thời lượng.** Không có nghĩa; đã ghi vào D10.
- **Lọc theo lựa chọn chỉ có ở danh sách deal.** Liên hệ và công ty chưa bao giờ có bộ lọc theo custom field; D11 nói về bộ lọc đang có.
- **`ActionDef<any, any>` trong `bulk.ts` và `reassign.ts`.** Một factory nhận action của nhiều đối tượng; tiền lệ có sẵn ở `reassign.ts`.
- **N+1 khi chạy hàng loạt** (`loadFieldPolicy` mỗi bản ghi). Tối đa 500 bản ghi một lần, đội 5 người; đo trước khi tối ưu.

## Review lượt 2 (14/10/2026)

Hai chiều review chạy song song trên lượt 2 (Phase 22–26). Đã sửa:
- **Gộp bản ghi (D13):**
  - Khoá cả hai bản ghi theo thứ tự id, nên hai lần gộp cùng lúc phải chờ nhau.
  - Tag của hai bên được nhập chung, không mất tag nào.
  - Owner của bản ghi bị gộp chỉ được lấy khi người đó còn là thành viên.
  - Hội thoại AI cũng chuyển sang bản ghi giữ lại.
  - Liên hệ giữ lại vừa thành liên hệ chính của deal thì không còn nằm trong "người khác trên deal".
  - Có test cho liên hệ chính và cho tag.
- **Nhập deal (D14):**
  - Bước xem trước kiểm từng dòng bằng đúng luật của `deals.create`, nên tệp xem trước sạch sẽ không dừng giữa chừng. Ví dụ: tên dài quá 240 ký tự bị báo ngay.
  - Tìm pipeline, công ty, liên hệ, thành viên bằng bảng tra một lần.
  - Công ty mới so tên theo cùng luật với bước xem trước ("Công ty A" và "Cong ty A" là một).
  - Ô owner trống: bước xem trước hiện tên người nhập.
  - Test: dòng sau bị từ chối (thành viên không được ghi giá trị) thì dòng trước và công ty mới cũng không còn.
- **Xuất việc và ghi chú:** chỉ đọc những người các dòng nhắc tới; ngày theo múi giờ của workspace, như nhắc việc.
- **Mẫu email (D15):** điền mẫu tôn trọng quyền theo trường (trường bị ẩn thì để trống). Đổi người nhận thì mẫu được điền lại.
- **Báo giá (D16):**
  - Số báo giá tính theo giá trị: BG-2026-10000 đứng sau BG-2026-9999.
  - Deal vào thùng rác thì báo giá vẫn còn, nên số không bị dùng lại; báo giá chỉ mất khi deal bị xoá hẳn.
  - Công ty, liên hệ, email người mua bị ẩn theo quyền trường thì báo giá cũng ẩn.
- **Chỉ tiêu (D17):**
  - Deal tạo thẳng ở stage thắng có ngày chốt.
  - Deal thắng chưa có ngày chốt thì tính theo ngày dự kiến ký.
  - Ô chỉ tiêu đọc "1.500.000.000" và "1500,5" như người gõ muốn.
  - E2E thấy ô % đạt có số.

Giữ nguyên, có lý do:
- **Quý tính theo giờ UTC.** Giống cột dự báo đang có; hai bảng phải cùng cách chia quý.
- **Khôi phục bản ghi đã gộp không tách lại các liên kết.** Việc, ghi chú, deal đã chuyển sang bản ghi giữ lại; tách lại phải đoán, nên để người dùng tự làm.
- **Không có e2e gửi thư bằng mẫu.** Máy test không có hộp thư gửi đi; có test cho hàm điền mẫu và cho route.
- **`dispatchEvent` chạy ngoài giao dịch.** Theo ADR-017: sự kiện chỉ đi khi dữ liệu đã ghi xong.

## Review lượt 3 (14/10/2026)

Hai chiều review chạy song song trên `8009952...f337f64` (Phase 27–30). Đã sửa:
- **Nhật ký (D18):**
  - Lọc theo tiền tố có dấu `_` (`api_key.`, `custom_field.`, `email_template.`) từng không bao giờ ra dòng nào. Giờ ký tự đặc biệt được giữ nguyên nghĩa chữ; có test.
  - CSV dùng cách ghi an toàn cho bảng tính: một người tự đặt tên `=HYPERLINK(…)` không thành công thức trên máy admin; có test.
  - Lọc theo loại hành động: ô mới "Làm gì" (tạo, sửa, xoá, khôi phục, xoá hẳn), API nhận `.deleted`. Ô "Trên cái gì" liệt kê mọi loại bản ghi nhật ký biết, thay vì 12 mục gõ tay.
  - `contact.` và `deal.` gồm cả `contacts.imported`, `deals.imported`.
  - `limit` quá lớn lấy 1.000 như trước; nút CSV lấy tối đa 1.000 dòng.
  - Câu trả lời cũ không ghi đè kết quả lọc mới.
  - E2E lọc theo người, rồi theo "deal được tạo".
- **Thành viên (D19):**
  - Comment sai ("phiên đăng nhập bắt đầu lại") đã sửa cho đúng việc code làm.
  - Kích hoạt lại thất bại thì báo lỗi.
  - Dùng chữ của từ điển: "account details", không "profile".
  - Từ điển ghi admin kích hoạt lại được Member.
- **Sự kiện (D20):**
  - Gộp bản ghi phát `contact.deleted` / `company.deleted` cho bản bị gộp, kèm `mergedInto`; có test.
  - Xoá hàng loạt phát một sự kiện cho mỗi bản ghi; có test.
  - Danh sách việc còn chạy sau khi xoá đổi thành danh sách cho phép (webhook, log): loại việc mới thêm sau này mặc định không chạy trên bản ghi đã xoá.
  - Ba action xoá dùng chung một chỗ tạo sự kiện xoá.
- **Thư đồng bộ (D21):**
  - Thư nằm trên dòng thời gian của liên hệ và deal theo giờ gửi, không theo giờ kéo về; có test.
  - Deal đang mở của một liên hệ chỉ tra một lần cho cả lô thư.
  - ADR-009 ghi thêm chuyện thư lên deal.
- **Tài liệu:** nhật ký trong `records.md` và `rest.md`; nhập deal, xuất việc và ghi chú trong `import-export.md`; gộp bản ghi trong `workflows.md`.
- Một e2e cũ (account-rescue) tìm nút "Save" không chính xác sau khi hộp thoại tài khoản có thêm nút "Save title and phone"; đã sửa locator.

Giữ nguyên, có lý do:
- **Sự kiện đi trước khi giao dịch commit (ADR-017).** Khi xoá hàng loạt hay nhập deal bị huỷ giữa chừng, webhook "đã xoá" hoặc "đã tạo" của những dòng trước vẫn có thể đã gửi. Sửa tận gốc phải đổi lõi action: gom sự kiện, chỉ gửi sau khi commit. Đã tách thành việc riêng; trường hợp này hiếm vì các thao tác hàng loạt kiểm tồn tại trước khi ghi.
- **Việc, ghi chú, trường, nháp AI không chạy trên bản ghi đã xoá.** Chúng sẽ treo vào bản ghi trong Thùng rác. Nhắc owner thì dùng webhook.
- **Phiên đăng nhập khi kích hoạt lại để nguyên.** Phiên là của người, dùng chung mọi workspace; ngắt nó sẽ đăng xuất họ ở workspace khác. Admin muốn họ đăng nhập lại thì bấm "đăng xuất mọi nơi".
- **`/api/audit` trả 400 khi bộ lọc sai.** Bỏ qua bộ lọc sai sẽ cho ra cả nhật ký mà người xem tưởng đã lọc.
- **Một thư chỉ gắn một liên hệ.** Có từ trước (ADR-009); D21 không đổi điều đó.
- **Tên migration `0029_user_profile`.** Tên tệp, không phải chữ người dùng thấy; đổi journal rủi ro hơn lợi.

## Đã deploy (14/10/2026)

- Lượt 1: PR #39 (7106b7f). Lượt 2 và 3: PR #40 (7d0c485), deploy lúc 16:23.
- Trước deploy: backup `fourty-2026-10-14-0923.dump` (296K).
- Sau deploy:
  - 30 migration.
  - `email_templates`, `quotes`, `targets` bật RLS bắt buộc, mỗi bảng một policy.
  - `users` có `title`, `phone`.
  - `/api/health` trả 200; app healthy; log app và worker không có lỗi.
  - Các route mới trả 401 khi chưa đăng nhập (đã có), route giả trả 404.
- Test trước khi merge: unit 1.303 đạt, 6 bỏ qua; e2e 133 đạt.
- Việc tách riêng: gửi sự kiện workflow sau khi giao dịch commit (ADR-017).

## Quyết định của Leo sau deploy (14/10/2026)

| # | Chọn | Việc đã làm |
|---|---|---|
| Q94 | A, làm ngay | Job sinh ra trong giao dịch (workflow, webhook, email) chờ giao dịch commit mới gửi; savepoint bị huỷ thì bỏ job của nó. Có test đầu-cuối: nhập deal hỏng ở dòng 2 không gửi webhook cho dòng 1. ADR-017 cập nhật. |
| Q95 | A | Gộp bản ghi tiếp tục phát `contact.deleted` / `company.deleted` kèm `mergedInto`. |
| Q96 | A | Kích hoạt lại thành viên không đụng phiên đăng nhập; admin dùng "đăng xuất mọi nơi" nếu cần. |
| Q97 | A | Leo tự nhập 2 deal và 1 việc của LTHoa bằng màn hình nhập deal. |
| Q98 | B | Claude đặt trên production, sau backup `fourty-2026-10-14-0944.dump`, ghi nhật ký với `via: claude`: bật nhắc việc (tiếng Việt, giờ Việt Nam, link `https://crm.example.com`); trường ngày giao `planned_ship_date`, trường chia cột `sales_motion`, trường lý do thua `loss_reason`; tắt workflow "Bổ sung lý do không tiếp tục". |
| Q99 | A | Sau 8 giờ sáng 15/10 Leo nhắn "kiểm nhắc việc"; Claude đọc log worker và báo thư đã gửi cho ai. |
| Q100 | A | Leo mời lại trước khi hết hạn: btduc@example.com (hết hạn 20/10 11:51), lthoa@example.com (21/10 16:03). |
| Q101 | A | Dừng sau đợt 3; dùng thật một thời gian rồi mới chọn đợt tiếp theo. |
| Q102 | A | Trang nhập ở chế độ Liên hệ nhận ra file deal (không có cột tên liên hệ, có cột tên deal hoặc giá trị), không nhập mà hỏi "Chuyển sang Cơ hội" hay "Vẫn nhập thành liên hệ"; chuyển thì file được xem trước ngay bên nhập deal. Lý do: 18:05 ngày 14/10 file 2 deal của LTHoa vào nhầm chế độ Liên hệ, bị bỏ qua cả 2 dòng mà trông như đã xong. |
| Q103 | A | Leo tạo khoá API vai trò member tên "Lead intake" (Cài đặt → API keys), dán thẳng vào hệ thống gửi lead. |
| Q104 | A | `POST /api/contacts?ifExists=fill`: email mới thì tạo (201); email đã có thì chỉ điền ô trống, giữ tên, email, trạng thái, ghi "lead quay lại từ {nguồn}" (200, `existed: true`); không phát `contact.created` lần nữa. |
| Q105 | A | Workflow "Gọi lại lead mới": khi `contact.created`, nếu trạng thái là lead, tạo việc "Gọi lại lead {{firstName}}" hạn 1 ngày cho người phụ trách liên hệ. |
| Q106 | C | Hệ thống riêng của PilotCo gọi thẳng API; hướng dẫn ở `docs/guides/lead-intake.md`. |
| Q107 | B | Cài đặt → "Người nhận lead mặc định": liên hệ do khoá API tạo mà không ghi người phụ trách thì về người này, kèm việc gọi lại; ghi `ownerId` (hoặc `null`) thì theo yêu cầu; người đó rời workspace thì lead để chưa giao chứ không bị từ chối. |
| Q108 | A | Khi có khoá, bên phát triển gửi lead "Test Lead" nguồn "test"; Claude kiểm liên hệ, việc gọi lại, dòng thời gian trên production; Leo xoá lead thử. |
| Q109 | A | Người nhận lead mặc định trên production là Anh Lâm (đặt 15/10, backup `fourty-2026-10-15-0414.dump`, nhật ký `via: claude`). |

**Kết quả Q108 (15/10 11:16):** gửi "Test Lead" (test-lead@example.com, nguồn test) hai lần qua `https://crm.example.com/api/contacts?ifExists=fill` bằng khoá member "Lead intake". Lần 1 trả 201 (`existed: false`), lần 2 trả 200 (`existed: true`), cùng một liên hệ. Liên hệ ở trạng thái lead, người phụ trách Anh Lâm (người nhận mặc định). Workflow "Gọi lại lead mới" tạo đúng một việc "Gọi lại lead Test", ưu tiên cao, hạn 16/10. Dòng thời gian có "created" rồi "returned" (nguồn test). Nhật ký có `contact.created` và `contact.returned`.

**Kết quả Q99 (15/10):** nhắc việc bật, worker kiểm đều mỗi phút. Sáng 15/10 không có email nhắc vì không có việc nào đang mở có hạn (chỉ 1 việc đang mở, không có hạn). Việc "Gọi lại lead Test" hạn 16/10 sẽ là email nhắc đầu tiên, cho Anh Lâm, sáng 16/10.
| Q110 | B | Xoá lead thử ngay (Leo xoá liên hệ "Test Lead" và việc "Gọi lại lead Test"). |
| Q111 | A | Leo thu hồi khoá "Lead intake" đã lộ trong chat, tạo khoá member mới dán thẳng vào hệ thống gửi lead. |
| Q112 | A | Lead qua API chỉ là liên hệ; cơ hội do sales tạo khi đã xác nhận nhu cầu. Claude soạn bộ lệnh curl cho mọi đối tượng (lead, liên hệ, công ty, cơ hội, việc, ghi chú, cuộc gọi), chạy thử từng lệnh trước khi giao. |
| Q113 | A | Xoá liên hệ, công ty hay cơ hội thì việc chưa xong của nó vào Thùng rác cùng, khôi phục thì về lại; việc đã xong ở lại. |


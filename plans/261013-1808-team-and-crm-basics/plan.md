---
title: "Trang Thành viên và các tính năng CRM cơ bản còn thiếu"
date: 2026-10-13
status: "Phase 3 xong và đã deploy (PR #30); Phase 4 chờ merge (PR #31); Phase 5 xong trên máy (nhánh feat/value-history-lost-reason); Phase 6–9 chưa bắt đầu"
nguon:
  - "plans/reports/research-261013-1649-user-administration.md (quyết định Q63–Q65)"
  - "plans/reports/research-261013-1649-crm-baseline-feature-gaps.md (quyết định Q66–Q68)"
  - "Q70 = A, Q71 = A, Q72 = A (13/10/2026)"
---

# Trang Thành viên và các tính năng CRM cơ bản còn thiếu

Mục tiêu: admin của PilotCo tự quản lý được thành viên mà không cần ai vào máy chủ, và đội bán hàng có đủ những tính năng cơ bản mà công việc hằng ngày đang thiếu. File này chỉ chia việc và đặt tiêu chí xong; lý do nằm ở hai báo cáo nguồn.

Từ ngữ theo `CONTEXT.md`: **Thành viên** (Member), **Tài khoản** (Account), **Lời mời** (Invite), **Owner**.

## Cách làm chung cho mọi phase

- Mỗi phase một nhánh, một PR. Trước khi viết test, chốt với Leo chỗ đặt test (seam); viết test trước, đỏ rồi mới xanh.
- Xong khi: `npx tsc --noEmit`, toàn bộ `npm test` và toàn bộ e2e đạt trên Postgres riêng của phiên; CI xanh; Leo nói "merge"; deploy theo runbook §6 (lệnh deploy luôn backup trước, phase nào có migration càng cần bước này); kiểm sau deploy như runbook.
- Chữ trên giao diện có đủ tiếng Anh và tiếng Việt. Mọi thao tác quản trị ghi nhật ký kiểm toán.
- Ranh giới giữ nguyên: hỏi Leo trước khi chạy lệnh trên máy chủ thật ngoài các bước đã duyệt, trước khi mở PR, trước khi commit trong kho tri thức PilotCo.

## Phase 0 — Cấu hình, không viết code (Q71 = A)

- Thêm custom field kiểu link cho deal, tên "Thư mục tài liệu", trỏ tới thư mục Drive của từng deal. Ai làm: Q79.
- Việc Leo còn treo từ trước: Settings → Báo cáo chọn VND, trường ngày giao "Ngày xuất dự kiến", trường chia cột "Loại hình bán".

## Phase 3 — Lời mời (nhóm 2 của Q65) · ưu tiên 1

Lý do đi đầu: hôm nay có hai lời mời đang chờ mà không ai nhìn thấy.

- Cột mới `invites.revoked_at` (migration).
- Danh sách lời mời đang chờ trong thẻ Thành viên: email, vai trò, người mời, hạn. Chỉ admin xem.
- Thu hồi: link đã thu hồi bị từ chối như link hết hạn; trang nhận lời mời không hiện email.
- Gửi lại: tạo link mới cùng email và vai trò, hạn mới 7 ngày, gửi mail nếu mail bật, hiện link cho admin.
- Hành vi khi mời trùng: Q73, Q74.
- Seam dự kiến: REST `/api/members/invite`, route danh sách và thu hồi lời mời mới, `/api/members/accept`; e2e `invite-accept`.

## Phase 4 — Owner hiện rõ, lọc và bàn giao (nhóm 1 của Q65, việc 3 của Q70) · ưu tiên 2

- Danh sách deal (cả kanban và bảng) và danh sách việc hiện tên owner. Owner đã bị gỡ hiện "Thành viên đã nghỉ" thay cho "Unassigned".
- Lọc deal theo owner (kể cả "chưa giao"), theo quý của Expected close date, theo giá trị của một custom field chọn một (ví dụ "Loại hình bán"). Lọc việc theo owner. View đã lưu giữ được các bộ lọc này.
- Đổi owner hàng loạt: chọn nhiều deal hoặc nhiều việc rồi chọn owner mới. Mỗi deal vẫn ghi một dòng `owner_changed` trên dòng thời gian.
- Thao tác đổi owner hàng loạt đi qua action registry, nên REST, GraphQL và MCP cùng có.
- Seam dự kiến: action `deals.list` và `tasks.list` (tham số lọc), action đổi owner hàng loạt mới; e2e `kanban`, `deal-form` và một e2e mới cho danh sách việc.

Kết quả Phase 4 (13/10/2026):

- Q82 = A (seam như trên), Q83 = A (chọn nhiều chỉ ở chế độ Bảng của Deals).
- Hai chỗ tự quyết, khác chữ của Q65: người đã nghỉ hiện "Tên (đã nghỉ)" thay vì chỉ "Thành viên đã nghỉ", để còn biết việc của ai; trang Việc không có ô chọn từng dòng (mỗi dòng đã có ô tick hoàn thành), mà lọc theo người rồi "Giao cho" mọi việc đang hiện.
- Test mới: `tests/owner-handover.test.ts` (10), `tests/owner-display.test.ts` (2), một test `pattern` trong `tests/action-json-schema.test.ts`, e2e `owner-handover`. Toàn bộ 1.159 unit và 108 e2e đạt.

## Phase 5 — Lịch sử giá trị cũ và mới, lý do thua (việc 1 và 2 của Q70)

- Sửa deal ghi "từ A sang B" cho số tiền (kèm mã tiền tệ), Expected close date và trường ngày giao đã chọn ở Settings → Báo cáo. Ví dụ: "Số tiền: 80 tỷ ₫ → 60 tỷ ₫".
- Một lần ghi vừa đổi stage vừa đổi số tiền thì dòng đổi stage cũng mang các thay đổi số tiền, không mất đi như giới hạn đã biết của P1.
- Lý do thua theo Q75.
- Seam dự kiến: action `deals.update`; hàm hiển thị dòng thời gian (`tests/activity-display.test.ts`); e2e kéo deal trên kanban.

Kết quả Phase 5 (13/10/2026):

- Q84 = A (seam như trên), Q85 = A (ô "Trường lý do thua" ở Cài đặt → Pipeline; giá trị lưu cùng các cài đặt chọn trường khác trong `settings.reporting`).
- Dòng thời gian ghi `meta.changes` cho Amount (kèm mã tiền), Expected close date và Delivery date; hiển thị "Giá trị: 80 tỷ ₫ → 60 tỷ ₫". Đổi stage hay đổi owner cùng lần sửa vẫn giữ các thay đổi đó.
- Chuyển sang stage thua khi đã chọn trường lý do mà thiếu giá trị: API trả 400; Kanban hỏi lý do trước khi lưu. Chưa chọn trường thì như cũ.
- Việc Leo làm sau deploy: Cài đặt → Pipeline chọn "Lý do không tiếp tục"; tắt workflow "Bổ sung lý do không tiếp tục" vì đã thừa.
- Test mới: `tests/deal-history-lost-reason.test.ts` (6), 2 test trong `tests/activity-display.test.ts`, e2e `lost-reason`. Toàn bộ 1.172 unit và 110 e2e đạt.

## Phase 6 — Dự báo chia cột theo owner (việc 4 của Q70)

- Trang Báo cáo có công tắc "Chia cột theo: trường chia cột | Owner" cho hai bảng dự báo theo quý. Cột owner gồm "Chưa giao" và người đã nghỉ (giữ tên).
- Seam dự kiến: hàm thuần `forecastByPeriod` (`tests/forecast.test.ts`).

## Phase 7 — Sửa và xoá ghi chú (việc 6 của Q70)

- Sửa, xoá ghi chú; ghi chú đã sửa có dấu "đã sửa". Ai được làm: Q76.
- Seam dự kiến: action `notes.update`, `notes.delete` (REST, GraphQL, MCP cùng có).

## Phase 8 — Hồ sơ và cứu tài khoản (nhóm 3 và 4 của Q65)

- Mỗi người: mục "Tài khoản của tôi" trong menu tài khoản để sửa tên và đổi mật khẩu (cần mật khẩu hiện tại; đổi xong thì các phiên khác bị đăng xuất).
- Admin, trên dòng của một thành viên: sửa email; tạo link đặt lại mật khẩu dùng một lần (hạn 24 giờ) để tự gửi; tắt 2FA cho người mất điện thoại. Mọi thao tác ghi nhật ký.
- Các thao tác này đụng tới **Tài khoản**, thứ dùng chung cho cả hệ thống, nên cần ranh giới quyền: Q77.
- Seam dự kiến: REST `/api/me`, các route mới dưới `/api/members/:userId`; e2e `settings`, `two-factor`.

## Phase 9 — Email nhắc việc mỗi sáng (việc 5 của Q70)

- Mỗi sáng, mỗi owner có việc mở đến hạn hôm nay hoặc đã quá hạn nhận một email liệt kê các việc đó, kèm link. Không có việc thì không gửi. Mail tắt thì không làm gì.
- Gửi đúng một lần mỗi người mỗi ngày, kể cả khi worker khởi động lại (dùng biên nhận việc sẵn có của hàng đợi).
- Giờ gửi và múi giờ theo Q78. Fourty hiện chưa có cài đặt múi giờ.
- Seam dự kiến: hàm thuần chọn việc cần nhắc theo ngày và múi giờ; handler của worker.

## Ngoài phạm vi (đợt sau)

- Nhóm 5 và 6 của Q65: lần đăng nhập cuối, xem và huỷ phiên; gắn API key và hộp thư với người tạo.
- Tệp đính kèm (thay bằng ô link, Q71), xoá có thùng rác, nhiều liên hệ trên một deal, dòng sản phẩm, gửi email từ CRM, báo giá, mục tiêu theo người.

## Quyết định (13/10/2026, Leo)

| Câu | Chọn | Nghĩa |
|---|---|---|
| Q73 | A | Mời lại một email đang có lời mời chờ thì link cũ tự bị thu hồi; "Gửi lại" đi đúng đường này |
| Q74 | A | Mời một email đã là thành viên đang hoạt động thì bị từ chối ngay lúc mời |
| Q75 | A | Admin chọn một custom field chọn một làm trường lý do thua (PilotCo: "Lý do không tiếp tục"); vào stage mất mà thiếu lý do thì bị từ chối; giao diện hỏi lý do khi kéo |
| Q76 | A | Người viết và admin được sửa, xoá ghi chú |
| Q77 | A | Sửa email, tạo link đặt lại mật khẩu, tắt 2FA của người khác: chỉ admin của workspace tạo đầu tiên, như SSO |
| Q78 | A | Admin bật email nhắc trong Settings; gửi 8 giờ sáng theo múi giờ workspace (cài đặt mới, mặc định Asia/Ho_Chi_Minh) |
| Q79 | A | Leo tự tạo ô link "Thư mục tài liệu" trong Settings |
| Q80 | A | Seam Phase 3: `POST /api/members/invite`, route danh sách và thu hồi lời mời, `POST /api/members/accept`, e2e `invite-accept` |
| Q81 | A | Lời mời hết hạn mà chưa ai dùng vẫn nằm trong danh sách, ghi "đã hết hạn", có Gửi lại và Thu hồi; chỉ rời danh sách khi được dùng, bị thu hồi hoặc bị thay |

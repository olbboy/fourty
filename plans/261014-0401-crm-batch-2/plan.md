---
title: "Đợt 2: phiên đăng nhập, key theo người, thùng rác, nhiều liên hệ, dòng sản phẩm, gửi email"
date: 2026-10-14
status: "Xong, đã deploy 14/10/2026 (PR #37, 67ced2a)"
nguon:
  - "plans/261013-1808-team-and-crm-basics/plan.md, mục 'Ngoài phạm vi (đợt sau)'"
  - "plans/reports/research-261013-1649-user-administration.md (T5, T6, T8; U5, U8)"
  - "plans/reports/research-261013-1649-crm-baseline-feature-gaps.md (mục d, b, 8, 11)"
  - "Leo giao toàn quyền (14/10/2026): tự chốt, tự test, deploy, chỉ báo khi đã deploy xong"
---

# Đợt 2

Sáu việc Leo thấy trong danh sách "đợt sau". Ba việc còn lại của danh sách ngoài phạm vi vẫn để ngoài: tệp đính kèm (Q71 = A, dùng ô link), báo giá và mục tiêu theo người (báo cáo nghiên cứu xếp là không cơ bản ở bậc nhập).

Cách làm như đợt 1: viết test trước ở seam của từng việc, toàn bộ unit và e2e phải đạt; thêm một vòng review code (Standards và Spec) trước khi merge; deploy một lần ở cuối, backup trước.

## Quyết định do Claude chốt (Leo giao toàn quyền)

| # | Việc | Quyết định | Vì sao |
|---|---|---|---|
| D1 | Lần đăng nhập cuối, phiên (nhóm 5 của Q65; U5) | Cột `users.last_login_at`; mỗi phiên lưu thiết bị (user agent), IP và "thấy lần cuối" (ghi tối đa 5 phút một lần). Mỗi người xem và đăng xuất các phiên của mình trong "Tài khoản của tôi". Admin của workspace tạo đầu tiên (như Q77, phải là người) đăng xuất mọi thiết bị của một thành viên. Danh sách thành viên hiện "đăng nhập lần cuối". Phiên hết hạn của người đó bị dọn khi họ đăng nhập. | Gộp A và B của U5; ghi sự kiện đăng nhập vào nhật ký (C) bỏ, vì nhật ký là theo workspace còn đăng nhập xảy ra trước khi chọn workspace |
| D2 | API key và hộp thư theo người (nhóm 6; U8) | Cột `created_by` trên `api_keys` và `sync_accounts`; danh sách hiện người tạo. Gỡ thành viên có ô (mặc định tick) "thu hồi N key và ngắt M hộp thư của người này". Mặc định vai trò của key tạo từ giao diện giữ nguyên | U8 = A; đổi mặc định vai trò là việc riêng, không ai yêu cầu |
| D3 | Thùng rác | Xoá liên hệ, công ty, deal, việc thì bản ghi cùng ghi chú, dòng thời gian và các liên kết của nó được chép vào bảng `trash` rồi mới xoá khỏi bảng chính. Khôi phục chép ngược lại và nối lại các liên kết còn trống. Giữ 30 ngày; admin xoá hẳn được. Trang Thùng rác trong Settings | Không phải sửa mọi truy vấn để lọc bản ghi đã xoá (dự báo, tìm kiếm, xuất file, GraphQL, MCP): chỗ nào quên lọc là rò; bảng riêng thì không có chỗ nào để quên |
| D4 | Nhiều liên hệ trên một deal | Bảng `deal_contacts` (deal, liên hệ, vai trò tự do như "Kỹ thuật", "Mua sắm"); `contactId` hiện có vẫn là liên hệ chính. Trang deal có khung "Người liên hệ"; trang liên hệ liệt kê cả deal mà họ tham gia | Giữ tương thích với mọi chỗ đang đọc `contactId` |
| D5 | Dòng sản phẩm | Danh mục `products` (tên, mã, đơn giá, tiền tệ, đang bán). Deal có `deal_lines` (sản phẩm hoặc dòng tự gõ, số lượng, đơn giá theo tiền của deal). Có dòng thì Amount của deal là tổng các dòng, tính lại mỗi lần sửa và đi qua `deals.update` (giữ lịch sử giá trị cũ và mới, điểm sức khoẻ). Chọn sản phẩm khác tiền tệ thì đơn giá được quy đổi theo tỷ giá của workspace. Một thao tác "đặt toàn bộ dòng" thay vì thêm/sửa/xoá từng dòng | Amount theo CONTEXT.md là số dự kiến xuất hoá đơn; tổng dòng đúng nghĩa đó. Một thao tác thay cả bộ dòng thì không có trạng thái nửa vời |
| D6 | Gửi email từ CRM | Soạn và gửi từ trang liên hệ và trang deal qua đường gửi mail của hệ thống (Resend): người nhận thấy tên người gửi, trả lời đi thẳng về email của người gửi (Reply-To). Mỗi thư ghi một dòng "email" trên dòng thời gian của liên hệ (và của deal nếu gửi từ deal) và ghi nhật ký. Gửi qua chính hộp Gmail/Microsoft của người gửi để sau: cần đổi quyền OAuth và hôm nay production chưa nối hộp thư nào | Dùng được ngay với cấu hình mail khách hàng thử nghiệm đang có |

## Phase 10 — Phiên đăng nhập (D1)

Seam: `POST /api/auth/login` (ghi lần đăng nhập, dọn phiên hết hạn), `GET/DELETE /api/me/sessions`, `DELETE /api/members/:id/sessions`, `GET /api/members` (lastLoginAt). E2E: xem và đăng xuất một phiên khác.

## Phase 11 — Key và hộp thư theo người (D2)

Seam: `POST /api/api-keys`, `POST /api/sync/accounts` (ghi người tạo), `DELETE /api/members/:id` với `revokeAccess`. E2E: gỡ thành viên kèm thu hồi key.

## Phase 12 — Thùng rác (D3)

Seam: các action `*.delete` (chép vào thùng rác), `GET /api/trash`, `POST /api/trash/:id/restore`, `DELETE /api/trash/:id`; dọn sau 30 ngày. E2E: xoá một công ty rồi khôi phục, ghi chú quay lại.

## Phase 13 — Nhiều liên hệ trên deal (D4)

Seam: action `deals.contacts.set` hoặc thêm/bớt; `deals.list` với `contactId` gồm cả người tham gia; GraphQL `Deal.contacts`. E2E: thêm một người liên hệ có vai trò trên trang deal.

## Phase 14 — Dòng sản phẩm (D5)

Seam: action `products.*`, `deals.setLines` (tổng thành Amount, ghi lịch sử, quy đổi tiền). E2E: thêm sản phẩm vào danh mục, gắn vào deal, Amount đổi theo.

## Phase 15 — Gửi email (D6)

Seam: action gửi email (người nhận phải là email của liên hệ thuộc bản ghi; Reply-To; dòng thời gian; nhật ký; giới hạn tần suất). E2E: soạn thư trên trang liên hệ; môi trường e2e không có mail nên kiểm thông báo "mail chưa cấu hình".

## Review trước khi merge (14/10/2026)

Hai chiều review chạy song song trên `1420479...HEAD`: chuẩn code (CONTRIBUTING, quy ước action kernel) và đúng quyết định D1–D6.

Đã sửa:
- Hai lần lưu dòng sản phẩm cùng lúc làm deal có cả hai danh sách mà Amount chỉ bằng tổng một bên. Giờ khoá dòng deal trong lúc thay. Đã có test; bỏ khoá thì test hỏng.
- Bảng dòng trên trang deal lưu lần lượt từng thao tác. Server giữ id của dòng qua các lần lưu, chỉ với id vốn thuộc deal đó, nên sửa và xoá theo id không trúng nhầm dòng.
- Đổi dòng làm đổi Amount từng ghi hai mục nhật ký. Giờ chỉ ghi một.
- Dòng thời gian của email ghi tên người nhận thay vì địa chỉ, vì người bị ẩn trường email vẫn đọc được dòng thời gian.
- Email đi qua hàng đợi `mail.send` như mọi thư khác (ADR-015: không gọi mạng trong giao dịch), và tiêu đề không được có xuống dòng.
- Worker dọn Thùng rác quá 30 ngày mỗi phút, không phải chờ có người mở trang.
- Nhật ký có nhãn cho sản phẩm, email đã gửi, khôi phục và xoá hẳn.
- `products.list` lọc bằng `state=active|all` (giống `state` của việc), vì chuỗi `"false"` bị ép thành true.
- Thêm test: sửa và xoá sản phẩm không đổi deal, role không được ghi Amount không đổi được dòng và không ghi gì.

Giữ nguyên, có lý do:
- Lời từ chối giữa chừng: REST trả lời bên trong cùng giao dịch, và giao dịch vẫn commit. Vì vậy `setLines` kiểm quyền ghi Amount trước khi ghi dòng, không trông vào `deals.update` lồng bên trong.
- Khôi phục deal hay liên hệ vẫn giữ id công ty hoặc liên hệ đã bị xoá. Xoá liên hệ xưa nay cũng để nguyên `contactId` trên deal, nên khi bên kia được khôi phục thì liên kết tự nối lại.
- Đưa `setDealLines`, `setDealContacts` và `list_products` lên GraphQL, MCP và AI: repo đưa mọi thao tác CRM lên mọi cổng. Mọi lệnh ghi của AI đều phải người dùng xác nhận.
- Khoá đổi tiền tệ khi deal có dòng: đơn giá các dòng tính theo tiền của deal, đổi tiền tệ mà không đổi giá thì sai.
- Xoá hết dòng thì Amount giữ số cuối, rồi lại nhập tay (Leo xác nhận, Q90).
- Giới hạn 30 email/giờ đếm trong bộ nhớ: đúng kiến trúc một tiến trình đã ghi trong `ratelimit.ts`.

## Leo xác nhận sau deploy (14/10/2026)

| # | Câu hỏi | Trả lời |
|---|---|---|
| Q90 | Xoá hết dòng sản phẩm thì Amount ra sao | A: giữ số cuối, rồi lại nhập tay |
| Q91 | Ai sửa và xoá danh mục sản phẩm | A: thành viên và admin; dòng trên deal giữ giá lúc thêm, nhật ký ghi mọi lần sửa |
| Q92 | AI có được đặt dòng sản phẩm và người liên hệ trên deal | A: được, mỗi lệnh ghi vẫn cần người dùng xác nhận |
| Q93 | Thử gửi email thật trên production | A: Leo tự thử từ tài khoản của mình |

Cả bốn khớp cách đã làm, không đổi code.


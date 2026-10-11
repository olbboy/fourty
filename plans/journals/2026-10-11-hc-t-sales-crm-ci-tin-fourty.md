---
title: Học từ sales-crm để cải tiến Fourty
date: 2026-10-11
summary: "Hoàn tất khảo sát source, đối chiếu Fourty và review kế hoạch bốn phase; chưa thay đổi mã ứng dụng."
---

# Học từ sales-crm để cải tiến Fourty

## Công việc đã hoàn tất

Khảo sát sales-crm tại SHA 2bb85561794d21d2af67aa7c366f40ec1ef961ee bằng GitHub tree và Repomix remote (98 file). Đọc sâu đường đi Companies và các pattern table/filter/selection/preview/CmdK/sidebar/CSV. Đối chiếu với backend và UX Fourty tại HEAD 24997d2ff6ff72030265788ea966632ea7b0c352. Nguồn là UI prototype dùng fixture và memory store; giá trị chuyển giao chính nằm ở tương tác danh sách, không ở backend.

Tạo packet Xia, ba báo cáo nghiên cứu/scout, báo cáo review và kế hoạch tại plans/261011-2319-sales-crm-improvements/plan.md. Ba reviewer độc lập nêu chín findings; đã sửa điều kiện trong plan và reviewer security kiểm tra lại đạt. Plan được pin riêng cho worktree này.

## Quyết định

Giữ stack Next/React/Tailwind/Drizzle/Postgres, RLS/RBAC/field policy và chiến lược ít dependency. Triển khai theo thứ tự: export an toàn/đúng quyền; Companies query/list; preview/mobile/sidebar/CmdK; browser/integration hardening và docs. Không sao chép fixture, metric giả hoặc asset của nguồn. Rollback phải giữ bản sửa quyền export/search. Code triển khai vẫn pending theo phạm vi ak-xia.

## Kiểm chứng và giới hạn

Plan CLI validate thành công; parse nhận 4 phase, 19 acceptance tasks, 0 hoàn tất. Kiểm 29 local links và 29 ownership paths trong 10 Markdown artifacts trước journal: không có đường dẫn lỗi hoặc trailing whitespace. git diff --check sạch; thay đổi chỉ là tài liệu trong plans. Probe Node xác nhận raw toCsv giữ nguyên chuỗi =1+1 và số âm -12, chưa phải kiểm thử khai thác spreadsheet.

Không chạy Vitest/build/E2E: worktree chưa có node_modules và phiên này chỉ nghiên cứu/plan. Không chạy source scripts, không tạo server, không ghi/reset DB. Chưa có số đo hiệu năng hoặc browser usability.

## Bước tiếp theo

Bàn giao ak-cook thực thi plan, bắt đầu từ Phase 1 và giữ đầy đủ gate trong từng phase. Bắt buộc xác minh DB test chuyên dụng, backup trước reset, test role/workspace thật, browser focus/race và giới hạn spreadsheet trước khi tuyên bố đạt.

AgentWiki publish skipped. Journal lưu nội bộ, không đăng ra dịch vụ ngoài.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

---
title: Hoàn tất cải tiến Companies và export theo sales-crm
date: 2026-10-12
summary: "Triển khai bốn phase, 288 tests và 28 E2E qua; giữ nguyên schema/dependencies, ghi rõ lint baseline."
---

# Hoàn tất cải tiến Companies và export theo sales-crm

## Kết quả

Đã triển khai đầy đủ kế hoạch `plans/261011-2319-sales-crm-improvements/plan.md`: export CSV qua quyền và field policy; Companies query/snapshot/pagination, saved views và ba scope export; preview, sidebar/mobile và CmdK. Không migration, dependency mới hoặc sao chép asset/source đáng kể.

## Các phát hiện quan trọng

Review tìm selected-ID permission bypass, offset vượt total render trắng và các lỗi focus nested dialogs. Browser bắt thêm focus sau full detail/Back và CSS mobile visibility/padding. Đã sửa nguyên nhân và thêm regression tests. Những lỗi harness được phân biệt với lỗi sản phẩm: login selector, download event, selector trùng và browser shortcut trong headless.

Search implementation đi trước test nên không ghi là TDD. Negative control với baseline route thất bại đúng hidden-field predicate; implementation cuối qua. PostgreSQL cổng mặc định thuộc dự án khác nên tạo cluster riêng cổng 55447, backup trước mutations. Test migration hard-code cổng được bổ sung DSN riêng có guard `fourty_revtest`.

## Kiểm chứng và giới hạn

Full Vitest 43 files / 288 tests qua; toàn bộ Chromium 28/28 qua; production build, TypeScript, diff check và docs links qua. Probe spreadsheet thực và benchmark 10k có bằng chứng trong báo cáo thực thi. Lint chưa qua vì baseline chưa có ESLint config; không che bằng skip hoặc dependency ngoài scope.

Plan được đánh dấu hoàn thành bằng CLI, 4/4 phase và 19/19 acceptance. Đã dừng server và xóa container test do phiên tạo sau backup cuối; artifacts ở `/tmp/fourty-0747-validation-261011/`. Chưa commit, push hoặc deploy. Khi ship cần giữ security fixes nếu rollback UX. AgentWiki publish skipped.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

---
title: "Chuẩn hóa UI controls và khôi phục Pipeline Settings"
status: completed
priority: P1
created: 2026-10-12
completed: 2026-10-12
branch: codex/sales-crm-improvements
---

# Chuẩn hóa UI controls và khôi phục Pipeline Settings

## Kết quả cần đạt

Fourty có Select và Dropdown dùng chung với keyboard/focus/dismiss đúng; local review không bị Next Dev Tools che điều hướng; Settings cho phép quản lý nhiều pipeline và các stage bằng API thật, đúng workspace và RBAC.

## Ràng buộc và ngoài phạm vi

- Giữ Next 15, React 19, Tailwind 4, Drizzle/Postgres, RLS và permission matrix hiện có.
- Dùng Radix primitives theo cùng hướng với source tham khảo; không nhập theme, Zustand, fixture hoặc asset của source.
- Không đổi schema: bảng `pipelines` và `stages` đã đủ dữ liệu cần thiết.
- Không xóa hoặc di chuyển deal ngầm khi xóa pipeline/stage; resource đang được deal tham chiếu phải trả conflict rõ ràng.
- Không chạy build production đồng thời với dev server đang phục vụ review.

## Facts và assumptions

1. **Fact/critical:** Settings chưa từng có pipeline editor; `/api/pipelines` chỉ có GET.
2. **Fact/high:** 28 native select và export menu tự viết không chia sẻ keyboard/dismiss/collision behavior.
3. **Fact/high:** Next Dev Tools ở bottom-left chồng mobile navigation khi chạy `next dev`.
4. **Fact/high:** schema đã có pipeline name/default và stage name/order/probability/type/color; không cần migration.
5. **Assumption/medium:** member được phép quản lý pipeline vì `pipelines` và `stages` nằm trong CRM permission matrix; viewer chỉ đọc.
6. **Assumption/medium:** pipeline mới nhận bộ stage mặc định hiện hành để luôn dùng được ngay và tránh trạng thái pipeline rỗng.

## Public seams và acceptance

- `GET/POST /api/pipelines`, `PATCH/DELETE /api/pipelines/:id`.
- `POST/PATCH /api/pipelines/:id/stages`, `PATCH/DELETE /api/pipelines/:id/stages/:stageId`.
- Mutation kiểm authorization, ownership theo workspace, input validation, resource-in-use conflict và reorder nguyên tử.
- Settings hiển thị pipeline/stage thật; tạo, đổi tên, đặt mặc định, xóa, thêm/sửa/xóa/reorder stage và báo lỗi có thể phục hồi.
- Select dùng form submission và controlled state; Dropdown hỗ trợ focus, Arrow keys, Escape, outside click và collision positioning.
- Next dev indicator không phủ UI review.

## Thực thi và kiểm thử

1. Thêm Radix UI và primitives dùng chung; chuyển các select/menu hiện có.
2. Viết API tests đỏ, triển khai pipeline service/routes, chạy test hẹp.
3. Viết browser test đỏ, triển khai Settings UI, chạy test hẹp desktop/mobile/keyboard.
4. Chạy typecheck, test liên quan, toàn bộ Vitest và Playwright; review Standards + Spec so với plan này.

Hoàn tất ngày 2026-10-12. Shared controls dùng hai package Radix có phạm vi hẹp;
Settings có CRUD pipeline/stage, viewer read-only, recovery state và hành vi bàn
phím/mobile; backend giữ invariant bằng workspace advisory lock và deal row lock,
đồng thời tính lại score theo batch. Validation cuối: typecheck và production
build đạt, 44 files / 307 Vitest tests đạt, 41/41 Playwright tests đạt trên
PostgreSQL/RLS cách ly. Hai reviewer cuối không còn finding có thể hành động.

## Rollback

Revert Settings UI và mutation routes trước; GET pipeline và schema hiện hữu vẫn giữ. Radix dependency chỉ bị gỡ sau khi mọi call site đã quay lại native controls. Không thay đổi dữ liệu hay migration.

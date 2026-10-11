# Chuẩn hóa Select và Dropdown bằng Radix UI

## Phạm vi

- Tạo `src/components/select.tsx` với API `options`, `placeholder`, `name`, `defaultValue`, `value`, `required`, `disabled` và callback controlled; Radix portal/collision, keyboard navigation, Escape/focus restore và hidden form value đều được giữ.
- Tạo `src/components/dropdown-menu.tsx` với portal, collision positioning, outside click/Escape, focus management, disabled item, label/separator wrappers.
- Thêm token styling Fourty vào `src/app/globals.css`.
- Di trú toàn bộ native select trong `custom-fields`, contacts, companies, deals, tasks và workflows; menu Export Companies dùng shared DropdownMenu.

## TDD/browser contract

`tests/a11y.test.ts` và `e2e/companies.spec.ts` đang có thay đổi của agent khác nên không sửa để tránh conflict. Vitest hiện dùng `node` environment và chỉ include `tests/**/*.test.ts`, không hỗ trợ component DOM cho test mới. Browser contract (FormData, controlled/uncontrolled changes, Arrow navigation, first enabled export item, Escape/outside focus restore) cần controller chạy qua E2E sau tích hợp.

## Validation

- `npx tsc --noEmit --pretty false`: pass.
- `git diff --check`: pass.
- `rg '<select'` trong ownership paths: không còn kết quả; native select còn lại trong settings ngoài ownership, còn Radix tự render hidden internals.
- `npm test`: pure tests pass; các suite Postgres fail trước khi chạy do password auth `fourty`, kèm cleanup errors từ test suites hiện có.
- Không chạy build/browser vì đã có `next dev` PID 27289 trong cùng worktree; không start/stop server theo ràng buộc.

Status: DONE_WITH_CONCERNS
Summary: Radix Select/Dropdown wrappers và toàn bộ call site được giao đã được triển khai, typecheck sạch, menu Export đã chuyển sang wrapper và không còn native select trong ownership paths.
Concerns/Blockers: Browser E2E chưa chạy; controller cần xác nhận keyboard/focus và FormData trên browser sau khi tích hợp. Full Vitest bị chặn bởi Postgres credentials ngoài phạm vi UI.

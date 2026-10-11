# Sửa findings cho UI primitives

- `useT` trả về callback ổn định theo `locale`, tránh làm lặp các effect/useCallback phụ thuộc translator.
- Dialog focus trap bỏ qua keydown đã `preventDefault`, để Escape của Radix Select không đóng modal cha.
- Select trigger/content/item có giới hạn chiều rộng, ellipsis và viewport mobile để nhãn dài không tràn.
- Đổi imports sang `@radix-ui/react-select` và `@radix-ui/react-dropdown-menu`; package và lockfile không còn aggregate `radix-ui`.

Validation:

- `npx tsc --noEmit --pretty false`: pass.
- `npx vitest run tests/a11y.test.ts`: 8 tests pass.
- `npm ls --depth=0 @radix-ui/react-select @radix-ui/react-dropdown-menu radix-ui`: chỉ còn hai package scoped, không còn aggregate.
- `git diff --check`: pass.
- Không chạy build/browser vì worktree đang có `next dev` PID 27289; không start/stop server theo constraint.

Status: DONE
Summary: Đã xử lý toàn bộ review findings trong ownership, giữ nguyên API/behavior của wrappers và hoàn tất dependency migration.
Concerns/Blockers: Build/browser chưa chạy vì dev server đang hoạt động trong cùng worktree; typecheck và focused a11y test đã pass.

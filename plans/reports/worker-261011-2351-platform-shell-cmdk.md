# Platform shell, focus primitives và CmdK

Status: DONE_WITH_CONCERNS

## Summary

- `src/components/ui.tsx` có focus scope dùng chung với stack cho nested modal/drawer: chỉ top surface xử lý Escape/Tab, restore trigger ổn định theo vòng đời `open`, và fallback về `[data-dialog-focus-fallback]`, `main#main`, landmark main hoặc list container khi trigger đã mất. Giữ nguyên API `Modal`; thêm `Drawer({ title, open, onClose, children, side? })` với dialog label, close control và focus trap.
- `src/components/shell.tsx` thêm Companies vào mobile primary nav; desktop sidebar dùng một `--sidebar-width` chung cho aside và main, clamp 224–360px, pointer capture, ArrowLeft/Right bước 8px, Home/End, `R`/double-click reset và chỉ persist `fourty-sidebar-width`. Main có `tabIndex=-1`/`data-dialog-focus-fallback`.
- `src/components/command-palette.tsx` parse response an toàn theo `{type,id,title,subtitle}`, bỏ payload không hợp lệ, có Records/Navigation groups, badge theo entity type, keyboard Home/End/Arrow/Enter chỉ từ combobox input, combobox focus scope, stale request id + AbortController, loading/error/Retry/no-results states. Copy mới dùng `useT()` theo các key được liệt kê dưới đây; metadata tùy chọn không được render ngoài allowlist UI hiện tại.
- `src/app/globals.css` thêm semantic focus/error/selected/panel tokens, shell geometry, drawer/CmdK state classes và reduced-motion override; không đổi palette Fourty.
- `tests/a11y.test.ts` khóa Modal/Drawer markup, focus scope/source contracts, sidebar separator và CmdK groups/badge/race/error semantics.

## I18n keys gửi owner `companies_frontend`

`command-palette.tsx` và `shell.tsx` đã consume các key sau; catalog owner đã bổ sung đủ bản dịch EN/VI:

- `cmdk.group.records` / `cmdk.group.navigation`
- `cmdk.type.contact` / `cmdk.type.company` / `cmdk.type.deal`
- `cmdk.search.loading` / `cmdk.search.error` / `action.retry`
- `a11y.sidebarResize`

`common.noResults` và `action.search` đã có sẵn.

## Tests

- `npm test -- tests/a11y.test.ts tests/i18n.test.ts` — pass, 17 tests.
- `npx tsc --noEmit` — pass sau khi catalog owner bổ sung key EN/VI.
- `npm run build` — pass; warning baseline ở `src/lib/otel.ts` (`Critical dependency: the request of a dependency is an expression`) vẫn xuất hiện.
- `git diff --check -- src/components/ui.tsx src/components/shell.tsx src/components/command-palette.tsx src/app/globals.css tests/a11y.test.ts` — pass.

## Concerns

- Chưa chạy browser E2E vì Phase 4 owner chịu trách nhiệm; focus loop/restore và pointer resize cần được xác nhận trên Chromium với Companies preview tích hợp.
- API/search và Companies client/preview không bị sửa; Drawer contract cần owner preview dùng title `Company preview` (hoặc title tương đương để tạo accessible name).

## Review follow-up 2026-10-12

- Nested modal restore now permits a visible programmatically focusable target, including the live outer dialog with `tabIndex={-1}`, while the Tab loop still collects only `tabIndex >= 0` descendants.
- Sidebar reset handles plain `R` only; Ctrl/Cmd/Alt+R remains available to the browser or operating system shortcut.
- `npm test -- --run tests/a11y.test.ts`, `npx tsc --noEmit`, and `git diff --check -- src/components/ui.tsx src/components/shell.tsx` pass. Browser regression coverage remains with the browser agent.
- Focus-scope cleanup now restores only when the closing dialog was the stack top; if another dialog remains, focus stays inside that top dialog, preventing an underlying preview close from moving CmdK focus to `main`.

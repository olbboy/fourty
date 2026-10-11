# Code review — Sales CRM Companies/UI

## Phạm vi

Rà soát chỉ đọc Phase 2/3 và các file Companies list/preview, shared dialog, shell/sidebar, CmdK cùng Playwright liên quan. Re-review source sau vòng sửa của owners. Không chạy DB, test hay server theo ràng buộc của task.

## Kết luận

Không còn finding mở trong phạm vi Companies/UI được giao. Không thấy hidden-ID cache, stale-workspace restore hoặc focus ra sau modal trong cơ chế hiện tại.

## Findings đã được xử lý

### Resolved — Trang offset vượt tổng từng render trắng và mất nút Previous

- `src/app/(app)/companies/companies-client.tsx:222-223` nay nhận diện `emptyPage` và tính offset của trang hợp lệ cuối cùng.
- `companies-client.tsx:432-450` render empty-page state riêng khi `companies=[]` nhưng `total>0`; `companies-client.tsx:482-495` vẫn render pagination và đưa Previous về `lastPageOffset`.
- EN/VI đã có copy tương ứng tại `src/lib/i18n/locales/en.ts:79-80` và `src/lib/i18n/locales/vi.ts:80-81`.
- Finding cũ được đóng theo bằng chứng source.

### Resolved — Đóng CmdK lồng trong preview từng có thể đưa focus ra ngoài drawer

- `src/components/ui.tsx:23-41` tách kiểm tra visible khỏi tabbable.
- `ui.tsx:48-59` nay cho phép restore programmatic focus đến element visible, connected có `tabindex`, gồm drawer `tabIndex={-1}` tại `ui.tsx:268-273`. Khi inner CmdK cleanup, outer drawer vẫn nằm trong `dialogStack`, nên trigger được focus lại thay vì rơi về `<main>`.
- Focus trap cho phím Tab vẫn dùng danh sách thực sự tabbable tại `ui.tsx:44-45`, nên sửa restore không đưa phần tử `tabIndex=-1` vào tab order.
- Finding cũ được đóng theo bằng chứng source.

### Resolved — Reset sidebar từng chặn Ctrl/Cmd+R

- `src/components/shell.tsx:149-156` chỉ reset bằng `R` khi không có Ctrl, Meta hoặc Alt. Shortcut reload của trình duyệt không còn bị `preventDefault` bởi separator.
- Finding cũ được đóng theo bằng chứng source.

### Resolved — Đóng preview trong lúc CmdK còn mở từng có thể focus trigger phía sau modal

- Shared trap tại `src/components/ui.tsx:128-147` nay chỉ restore khi dialog cleanup là surface trên cùng (`wasTop`). Nếu còn `remainingTop`, focus được giữ trong trigger thuộc surface đó hoặc trên chính dialog còn lại. Outer preview cleanup trong lúc CmdK còn mở không còn tự restore ra list.
- Companies fallback tại `src/app/(app)/companies/companies-client.tsx:140-150` kiểm mọi dialog `role=dialog` + `aria-modal=true` đang visible trước khi tìm trigger; nếu CmdK còn mở qua Browser Back, callback dừng trước `trigger.focus()`.
- Hai guard bổ sung nhau cho cả close outer-first và close inner-first. Close bình thường khi không còn modal vẫn restore đến trigger readable hiện render.
- Finding cũ được đóng theo bằng chứng source.

## Concern đã đối chiếu và bác bỏ

### Close preview dùng `router.replace`

- `src/app/(app)/companies/companies-client.tsx:111-128` dùng `push` khi mở preview từ list, `replace` khi đổi preview và khi explicit close.
- Contract bắt buộc mở preview tạo history entry, browser Back/Forward khôi phục state tương ứng, và explicit close/deep-link close phải về list URL mà không rời Companies. Source đáp ứng đường browser history: từ entry preview, Back về list và Forward trở lại chính entry preview miễn người dùng chưa explicit close.
- Explicit close dùng `replace` chủ đích kết thúc state preview hiện tại, đồng thời xử lý deep link an toàn. Plan không yêu cầu Forward phục hồi một preview đã bị người dùng đóng rõ ràng. Không có repro cho `open -> Back -> Forward` vi phạm contract, nên finding trước là diễn giải rộng hơn acceptance và được rút lại theo quy tắc quyết định đã kiểm chứng.

## Các vùng đã kiểm không thấy lỗi

- List fetch có AbortController và generation guard; preview/CmdK cũng hủy request cũ trước khi commit.
- Selection được lọc theo ID đọc được trên trang hiện tại và reset theo list key gồm query/page/workspace nhưng loại preview.
- Các field có thể bị redact trong table/preview đều kiểm kiểu trước khi format; numeric vắng không bị biến thành `0`; row thiếu `id` không có selection, preview hay detail affordance.
- Mobile Companies nav và CSS variable sidebar/main cùng dùng một width, mobile margin về 0.
- `data-preview-trigger-id` chỉ được render trong nhánh có `id` readable tại `src/app/(app)/companies/companies-table.tsx:69-70,109-119`; row bị redact ID không nhận marker hoặc affordance.
- Restore lookup chỉ dùng trigger hiện đang render và connected. Khi workspace/list key đổi, list state bị xóa và preview đóng; không thấy đường source dùng trigger node hoặc list cache của workspace cũ.

## Validation

- Source re-review và `git diff --check` cho các file liên quan: sạch.
- Không chạy test/browser/DB/server trong review này theo yêu cầu. Browser validation do controller/agent khác phụ trách.

## Unresolved questions

- Không có.

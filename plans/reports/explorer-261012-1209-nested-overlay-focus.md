# Scout Report

## Phạm vi

Đã đọc `src/components/command-palette.tsx`, `src/components/company-preview.tsx`,
`src/components/shell.tsx`, `src/components/app-sidebar.tsx`, các primitive
`src/components/ui/{command,dialog,sheet}.tsx`, và các test focus liên quan trong
`e2e/companies.spec.ts`.

## Nguyên nhân đã xác minh

- Khi mở preview rồi mở command palette, `CompanyPreview` lưu `finalFocus` là
  `false` nếu dialog palette đang mở. Điều này đúng: khi Browser Back đóng Sheet
  bên dưới, không được đưa focus vào Sheet đang đóng; focus phải ở input của
  palette.
- Khi palette đóng sau Browser Back, `CommandPalette` không được trả `true` khi
  preview đã biến mất. Theo Base UI, `finalFocus={() => true}` dùng target mặc
  định đã ghi nhận trước khi palette mở. Target đó là nút/Popup của preview và
  có thể còn connected nhưng đang `hidden`, `inert`, hoặc `data-closed`, nên
  focus rơi vào inactive layer hoặc body.
- Base UI có thể gọi callback `finalFocus` trong layout-effect cleanup, trong
  khi passive cleanup `markOthers` vẫn chưa gỡ `aria-hidden`/`inert` (đặc biệt
  khi popup không có animation đang chạy). Nó lấy element trả về ngay lúc đó
  rồi queue focus vào microtask. Vì vậy không nên loại một trigger chỉ vì nó
  tạm thời có ancestor `inert`: nếu trigger connected và có layout box, đến lúc
  focus được queue thì marker đã có thể được gỡ.

## Patch tối thiểu đề xuất

1. Giữ target fallback ổn định trong shell: `main#main` luôn mounted và có
   `tabIndex={-1}`. Skip link hiện có (`href="#main"`) vẫn cung cấp đường vào
   bằng bàn phím. Các search button có `data-command-palette-trigger` là target
   ưu tiên khi visible.
2. Trong `src/components/command-palette.tsx`, giữ nhánh Sheet đang mở để trả
   focus vào control đầu tiên trong Sheet. Ở nhánh không còn Sheet, chọn search
   trigger đầu tiên có `isConnected` và `getClientRects().length > 0`; không lọc
   `inert` hoặc `aria-hidden` ở đây vì chúng còn tồn tại trong layout cleanup
   nói trên. Có thể lọc `getComputedStyle(candidate).visibility === "hidden"`
   nếu cần. Sau đó fallback về `document.getElementById("main")`, rồi mới
   `false` (không dùng `true`).

   ```tsx
   const trigger = [...document.querySelectorAll<HTMLElement>(
     "[data-command-palette-trigger]",
   )].find(
     (candidate) =>
       candidate.isConnected &&
       candidate.getClientRects().length > 0 &&
       getComputedStyle(candidate).visibility !== "hidden",
   );
   return trigger ?? document.getElementById("main") ?? false;
   ```

   Base UI's `finalFocus` function accepts and focuses the returned HTMLElement;
   `false` suppresses focus restoration, while `true` uses the stale default.
   Do not return `null` here: Base UI treats `null` as default-focus fallback.
3. Preserve `CompanyPreview`'s existing branches: return `false` while the
   palette is open, and return the matching `data-preview-trigger-id` when the
   preview closes directly. This keeps the already passing Sheet and nested
   palette focus cases intact.

## Exact test expectation

Keep the nested Browser Back test in `e2e/companies.spec.ts` and assert that
after Escape the visible command-palette trigger is focused (the existing test
at lines 607–611 already expresses this). If a test instead asserts the generic
fallback, assert `document.activeElement?.closest("main#main")` rather than
`main#main` itself: Base UI's `getFirstTabbableElement` may choose a tabbable
descendant of the returned main element. Add `await page.keyboard.press("Tab")`
and assert the active element remains inside `main#main` only if keyboard
traversal coverage is desired.

## Relevant files

- `src/components/command-palette.tsx` — nested final-focus resolver and stale
  default-focus bug.
- `src/components/company-preview.tsx` — correct `false` handoff while palette
  remains open and direct preview trigger restoration.
- `src/components/shell.tsx` — always-mounted `main#main` fallback and mobile
  palette trigger.
- `src/components/app-sidebar.tsx` — desktop palette trigger.
- `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx` — Base UI Dialog
  primitive wiring; no primitive change needed.
- `e2e/companies.spec.ts` — nested overlay focus journeys.

## Controller resolution

The controller kept the inactive-layer predicate because the focused browser
journey exercised the real Base UI cleanup order and focused the visible search
trigger successfully. The final resolver falls back to the programmatically
focusable `main#main`, then returns `false` instead of asking Base UI to reuse a
stale default. Production Playwright passed the Back → Escape regression after
this change, and final review reported no remaining actionable finding.

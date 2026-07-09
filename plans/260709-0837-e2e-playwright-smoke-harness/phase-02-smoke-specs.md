---
phase: 2
title: "Smoke Specs"
status: done
priority: P1
effort: "~0.4 day"
dependencies: [1]
---

# Phase 2: Smoke Specs

## Overview

Hai spec còn lại của Round 1, chạy dưới project `smoke` (tái dùng `storageState` từ Phase 1): **Kanban drag** (flow client-side khó nhất, dùng native DnD helper) và **⌘K command palette**. Thêm `data-testid` tối thiểu để assert ổn định.

## Requirements

- Functional: kéo deal đổi stage và UI phản ánh; ⌘K search + điều hướng bằng bàn phím.
- Non-functional: assert theo **pattern động** (đếm/so vị trí card), không hardcode record demo → không giòn theo seed.

## Architecture

### Kanban drag — `e2e/kanban.spec.ts`
Backing: [`deals-client.tsx`](../../src/app/(app)/deals/deals-client.tsx) — card `draggable`, `onDragStart={()=>setDragId(deal.id)}`, column `onDragOver` (preventDefault), `onDrop` gọi `moveDeal(dragId, stage.id)` → optimistic `setState` + `PATCH /api/deals/{id}` `{stageId}`. Handler dựa vào **React state `dragId`** (không dùng `dataTransfer`), nên phải để event đi qua React synthetic system.

**Helper `e2e/helpers/drag.ts`** — `dragCardToStage(page, cardTestId, targetStageTestId)`:
1. Tạo `DataTransfer` trong page context (`page.evaluateHandle(() => new DataTransfer())`).
2. `dispatchEvent('dragstart', {dataTransfer})` trên card → React set `dragId`.
3. `dispatchEvent('dragover', {dataTransfer})` trên target column.
4. `dispatchEvent('drop', {dataTransfer})` trên target column → `moveDeal` chạy.
5. Chờ `PATCH /api/deals/*` (`page.waitForResponse`) hoặc chờ card xuất hiện dưới column đích.

Spec:
- Vào `/deals` (kanban view mặc định).
- Chọn 1 card ở stage A (card đầu tiên có deal), đọc `stage-total` của A và B.
- `dragCardToStage(...)` sang stage B.
- Assert: card giờ nằm trong column B (`stage-column[data-stage-id=B] >> deal-card[data-deal-id=X]`); số card cột A giảm 1, cột B tăng 1; `stage-total` A/B đổi tương ứng (assert **thay đổi**, không so số tuyệt đối).

### ⌘K palette — `e2e/command-palette.spec.ts`
Backing: [`shell.tsx:82`](../../src/components/shell.tsx) nghe `metaKey/ctrlKey + k`; [`command-palette.tsx`](../../src/components/command-palette.tsx) có `role="dialog"`, input `role="combobox"` (placeholder "Search contacts…"), `role="listbox"`, `role="option"` id `cmdk-opt-{i}`, ArrowDown/ArrowUp/Enter/Escape.

Spec:
- `page.keyboard.press('Meta+K')` (Playwright map Meta→Cmd trên mac / dùng Control trên Linux CI → thử `Meta+K`, fallback `Control+K`; hoặc detect qua `process.platform`).
- Assert `role="dialog"` hiện, focus ở `role="combobox"`.
- Gõ 1 substring của contact/company demo → assert ≥1 `role="option"`.
- `ArrowDown` → `Enter` → assert điều hướng sang trang record (URL đổi khỏi trang hiện tại) và dialog đóng.
- (phụ) `Escape` đóng dialog.

### data-testid (sửa source tối thiểu)
Trong [`deals-client.tsx`](../../src/app/(app)/deals/deals-client.tsx):
- Column wrapper: `data-testid="stage-column"` `data-stage-id={stage.id}`.
- Card: `data-testid="deal-card"` `data-deal-id={deal.id}`.
- Tổng cột: `data-testid="stage-total"` (trên element hiển thị per-column total/forecast).

Palette đã đủ role-based → **không cần** testid mới.

## Related Code Files

- Create: `e2e/kanban.spec.ts`
- Create: `e2e/command-palette.spec.ts`
- Create: `e2e/helpers/drag.ts`
- Modify: `src/app/(app)/deals/deals-client.tsx` — thêm 3 `data-testid` (không đổi behavior)
- Reference (không sửa): [`command-palette.tsx`](../../src/components/command-palette.tsx), [`shell.tsx`](../../src/components/shell.tsx)

## Implementation Steps

1. Thêm `data-testid`/`data-*` vào `deals-client.tsx` (column, card, total).
2. Viết `e2e/helpers/drag.ts` (native DnD dispatch qua DataTransfer).
3. Viết `kanban.spec.ts` (đọc trạng thái → drag → assert đổi cột + total, pattern động, `waitForResponse('**/api/deals/**')`).
4. Viết `command-palette.spec.ts` (Meta+K với xử lý cross-platform key → search → Arrow+Enter → assert nav).
5. `npm run test:e2e` — cả 3 flow xanh local.

## Success Criteria

- [x] `kanban.spec.ts`: sau drag, card ở đúng column đích; count + `stage-total` hai cột đổi đúng chiều.
- [x] `command-palette.spec.ts`: Meta/Control+K mở dialog, search ra option, Enter điều hướng, Escape đóng.
- [x] Không hardcode id record demo (assert động: first-card/other-column; nav-command "Go to Settings" thay record demo).
- [x] Chỉ thêm `data-testid`, không đổi logic component (diff behavior = 0).

## Risk Assessment

- **Native DnD không kích hoạt React handler** (rủi ro chính): thử (a) truyền `bubbles:true` + đúng thứ tự event `dragstart→dragover→drop`, (b) `retries:1` ở CI. *(Validation S1)* Nếu vẫn flaky → **quarantine** test (`test.fixme`/tách khỏi gate), **KHÔNG** giả lập bằng cách gọi `PATCH /api/deals` trực tiếp — giữ nguyên giá trị "test drag UI thật". Ghi rõ nếu phải quarantine.
<!-- Updated: Validation Session 1 - DnD: retries + quarantine, no API-assert simulation -->
  <!-- Resolved S2: helper dispatch `dragstart/dragover/drop` với `bubbles:true` (React 19 delegate ở root), chờ class `opacity-40` làm tín hiệu React đã commit `dragId` trước khi drop. Không flaky → KHÔNG cần quarantine. -->
- **Meta+K khác nhau mac/Linux**: chọn modifier theo `process.platform` (`Meta` local mac, `Control` CI Linux).
- **Timing SSR/hydration**: dùng web-first assertions (`expect(locator).toBeVisible()`) + `waitForResponse`, tránh `waitForTimeout`.

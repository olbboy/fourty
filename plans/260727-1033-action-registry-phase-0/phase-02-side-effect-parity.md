---
phase: 2
title: "Side-effect parity fix"
status: completed
priority: P1
effort: "M"
dependencies: [1]
---

# Phase 2: Side-effect parity fix

> **Đổi phạm vi sau red-team 2026-07-27.** Phase này ban đầu tên "Event parity
> fix" và chỉ track `dispatchEvent`. Red-team chứng minh ma trận đó quá hẹp:
> `logActivity`, `audit.meta`, snapshot shape và ngữ nghĩa `delete` đều phân kỳ
> giữa 3 surface.

<!-- Updated: Validation Session 1 — ngữ nghĩa delete tách ra thành Phase 1 riêng
     (bug toàn vẹn dữ liệu, ship/revert độc lập). Phase này chỉ còn parity của
     event / activity / audit-meta / snapshot. -->

## Overview

Sửa sai lệch **side-effect quan sát được** (event, activity, audit meta, snapshot
shape) giữa REST / GraphQL / MCP **trên code hiện tại**, chưa refactor gì.
TDD thuần: test đỏ pin sai lệch, rồi sửa cho xanh.

**Ngữ nghĩa `delete` không thuộc phase này** — đã xử lý ở
[Phase 1](./phase-01-delete-semantics.md). Phase này giả định Phase 1 đã xong.

Cùng với Phase 1, đây là phase cuối được phép đổi hành vi. Tách khỏi Phase 4
(refactor) để phase đó chứng minh được mình bảo toàn hành vi tuyệt đối.

## Requirements

### A. Workflow event (`dispatchEvent`)

Cùng operation nghiệp vụ → cùng tập event, bất kể surface. Đang thiếu:
- MCP `create_contact` → `contact.created`
- MCP `update_contact` → `contact.updated`
- MCP `create_company` → `company.created`
- MCP `create_task`/`update_task` → `task.completed` (khi chuyển sang done)
- GraphQL `updateContact` → `contact.updated`
- GraphQL `createCompany` → `company.created`

Không có surface nào dispatch event cho `delete` hôm nay — Phase 1 cũng không
thêm. Giữ nguyên trạng; nếu muốn `contact.deleted` thành workflow event thì đó là
tính năng mới, mở việc riêng.

### B. Snapshot shape (red-team #7)

REST `contacts/[id]/route.ts` gửi snapshot có thêm **`changedFields`** cho
`contact.updated`. Spec cũ của phase này chỉ ghi `{ ...row, custom: undefined }`
— làm đúng spec cũ sẽ tạo ra sai lệch mới.

**Chuẩn: đọc `src/app/api/contacts/[id]/route.ts` lấy shape thật, rồi khớp theo.**
REST là ground truth. Test phải assert shape, không chỉ tên event.

### C. Ngữ nghĩa `delete` → **đã chuyển sang [Phase 1](./phase-01-delete-semantics.md)**

Hợp đồng do Phase 1 chốt, phase này chỉ *bảo toàn*:
- cascade + detach: **thống nhất** cả 3 surface
- not-found: **giữ khác biệt** (404 / `false` / throw) — chủ đích
- dry-run: **giữ riêng MCP** — chủ đích

Nếu Phase 1 chưa xong → không bắt đầu phase này.

### D. `logActivity` (red-team #9)

`contacts.update`: REST gọi có điều kiện + kèm diff; MCP gọi vô điều kiện không
diff; GraphQL **không gọi**. Thống nhất theo REST.

### E. `audit` meta (red-team #1)

MCP gắn `meta.via`; REST update gắn `meta.fields`; GraphQL không gắn gì.
**Phase này không đổi `via`** (câu hỏi mở #4 của plan). Nhưng `meta.fields` phải
có ở mọi surface cho update — vì `tests/audit-log.test.ts` không kiểm `meta`,
mất nó sẽ không ai biết.

## Architecture

Không đổi kiến trúc. Chỉ thêm/sửa lời gọi side-effect cho khớp REST.

### Harness test — sửa sau red-team #11

> **Cảnh báo:** bản trước của phase này bảo dùng `vi.spyOn` và nói "pattern có
> sẵn trong tests/engine.test.ts". **Sai.** `grep -rn "vi.spyOn" tests/` trả về
> **0 kết quả** toàn repo. `tests/engine.test.ts` chạy `dispatchEvent` **thật**
> qua inline queue driver.

Dùng đúng pattern đang có: để `dispatchEvent` chạy thật với queue driver
`inline`, rồi assert vào trạng thái quan sát được (workflow run / job receipt),
theo cách `tests/engine.test.ts` đang làm. Đọc file đó **trước khi viết test** để
lấy đúng cơ chế; không tự phát minh cách bắt event.

<!-- Updated: Validation Session 1 — chốt: ưu tiên đọc DB, không thêm hook. -->
**Chốt ở validation session 1:** assert bằng cách **đọc trạng thái từ DB** mà
inline driver đã ghi (`workflow_runs` / `job_receipts`). **Không** thêm hook
test-only vào `src/lib/workflows/engine.ts` — không đưa code sản xuất vào chỉ để
phục vụ test. Nếu chứng minh được cách đọc DB không đủ quan sát, **dừng và báo
user**; đừng tự ý thêm hook.

Harness vẫn table-driven, kỳ vọng khai một lần cho mọi surface:

```ts
// tests/surface-parity.test.ts — hình dạng, không phải code cuối
const CASES = [
  {
    op: "contact.create",
    expect: {
      events:   ["contact.created"],
      activity: [{ type: "created", entityType: "contact" }],
      auditKey: "contact.created",
    },
    rest: ..., graphql: ..., mcp: ...,
  },
  {
    op: "contact.update",
    expect: {
      events:   ["contact.updated"],
      snapshotHas: ["changedFields"],          // red-team #7
      activity: [{ type: "updated", entityType: "contact" }],
      auditKey: "contact.updated",
      auditMetaHas: ["fields"],                 // red-team #1
    },
    ...
  },
  // contact.delete KHÔNG ở đây — cascade/detach do Phase 1 phủ trong
  // tests/delete-semantics.test.ts. Đừng nhân đôi kỳ vọng ở hai file.
];
```

**Case GraphQL n/a:** deals/tasks/notes chưa có mutation GraphQL. Đánh `skip` kèm
lý do trỏ backlog #10. Không bịa mutation trong phase này.

## Related Code Files

**Create**
- `tests/surface-parity.test.ts`

**Modify**
- `src/mcp/tools.ts` — `dispatchEvent` cho `create_contact` (~180),
  `update_contact` (~351), `create_company` (~228), task tools; `logActivity`
  diff cho update. Mẫu đúng: `create_deal` (~520).
- `src/lib/graphql/schema.ts` — `dispatchEvent` cho `updateContact` (~411),
  `createCompany` (~446); `logActivity` cho `updateContact`.
- `CHANGELOG.md` — **chuyển từ Phase 5 về đây** (red-team #4). Hành vi đổi ở
  phase này thì ghi chép ở phase này.

**Không đụng**
- `src/app/api/**` — REST là chuẩn tham chiếu
- `src/lib/workflows/engine.ts` — trừ khi bước 2 phát hiện thiếu chống đệ quy

## Implementation Steps

1. **Kiểm chứng lại ma trận trên `main`** trước khi viết gì:
   ```bash
   grep -rh 'event: "' src/app/api src/lib/graphql/schema.ts src/mcp/tools.ts | sed 's/.*event: //' | sort | uniq -c
   grep -rn "logActivity(" src/app/api/contacts src/lib/graphql/schema.ts src/mcp/tools.ts
   grep -rn "audit(" src/app/api/contacts src/lib/graphql/schema.ts src/mcp/tools.ts | grep -c meta
   ```
   Khác bảng trong file này → dừng, báo. Nền tảng plan đã lệch.

2. **GATE — kiểm chống đệ quy workflow** (red-team #5, trước là mục rủi ro, giờ
   là bước bắt buộc):
   ```bash
   grep -n "dispatchEvent\|depth\|recursion\|loop" src/lib/workflows/engine.ts
   ```
   Đã xác nhận: `runAction()` hiện **không bao giờ** gọi lại `dispatchEvent`, nên
   hôm nay không đệ quy. Nhưng đó là **tình cờ** (do tập `WorkflowAction` cố
   định), không phải ràng buộc được enforce. Nếu tập action đã mở rộng kể từ lúc
   viết plan và có action nào tạo/sửa record → **DỪNG, báo user.** Bật event mới
   trong tình trạng đó là tự bắn vào chân.

3. **Đọc `tests/engine.test.ts`** lấy đúng cơ chế quan sát event. Không tự phát
   minh (red-team #11).

4. **Viết `tests/surface-parity.test.ts` với kỳ vọng ĐÚNG, chạy → đỏ.**
   Ghi lại chính xác test nào đỏ — đây là bằng chứng bug, phải vào commit message.
   Xanh ngay từ đầu = harness sai, không phải bug đã hết.

5. **Sửa `src/mcp/tools.ts`.** Chèn `dispatchEvent` sau `recompute*Score()`,
   trước `return redact(...)`. Re-read row sau recompute để snapshot mang score
   mới (`create_deal` đã đúng thứ tự này). Thêm diff cho `logActivity` update.

6. **Sửa `src/lib/graphql/schema.ts`** tương tự, dùng helper `byId()`.

7. **Chạy lại parity test → xanh.**

8. **Chạy toàn bộ suite.** Test khác đỏ = **tín hiệu thật**: có test đang khẳng
   định trạng thái sai lệch là đúng. Đọc kỹ, đừng sửa bừa — sửa thì phải ghi lý
   do vào commit.

9. **Viết `CHANGELOG.md`** ngay trong phase này (red-team #4), ngôn ngữ cho người
   vận hành chứ không cho lập trình viên:
   > Workflow giờ kích hoạt cho record tạo/sửa qua AI agent, MCP client và
   > GraphQL. Trước đây các đường này im lặng bỏ qua workflow (bug). Nếu bạn có
   > workflow trên contact/company/task, chúng sẽ bắt đầu chạy cho các nguồn này.

   **Escape hatch = revert commit của phase này.** Cố ý không thêm env flag: một
   cờ config vĩnh viễn cho một bug fix là over-engineering và trái ADR-016
   guardrail #5. Vì vậy phase này **phải là commit tách biệt**, không squash
   chung Phase 3+.

10. `npx tsc --noEmit`.

## Tests / Validation

```bash
npm run test -- tests/surface-parity.test.ts   # đỏ ở bước 4, xanh ở bước 7
npm run test
npx tsc --noEmit
```

Cần Postgres test chạy (`tests/pg-setup.ts`, `npm run db:e2e:setup`).
`fileParallelism: false` — không lo race.

## Success Criteria

- [ ] Bước 2 (gate chống đệ quy) đã chạy và ghi kết quả
- [ ] `tests/surface-parity.test.ts` table-driven, phủ event + activity + audit
      key + audit meta + snapshot shape, trên cả 3 surface
- [ ] Đã ghi danh sách test đỏ trước khi sửa (bằng chứng bug)
- [ ] Parity test xanh sau khi sửa
- [ ] `contact.updated` snapshot có `changedFields` ở cả 3 surface
- [ ] Hợp đồng `delete` do Phase 1 chốt vẫn được bảo toàn (không sửa lại ở đây)
- [ ] `CHANGELOG.md` cập nhật **trong phase này**
- [ ] Phase này là **commit tách biệt**, revert được độc lập
- [ ] Toàn bộ suite xanh; test nào phải sửa đều có lý do ghi lại
- [ ] `tsc --noEmit` xanh; không thêm dependency

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Bật event mới làm workflow nổ hàng loạt trên deployment đang chạy | **Cao** | CHANGELOG ở bước 9 + commit tách biệt để revert. Không thêm env flag (over-engineering). |
| Vòng lặp workflow tạo→dispatch→tạo | Trung bình | Gate bước 2 là bắt buộc, không còn là ghi chú rủi ro. Hiện an toàn nhưng **do tình cờ** — ghi rõ trong ADR để Phase sau biết. |
| Harness test bắt hụt event | Trung bình | Dùng inline queue driver như `tests/engine.test.ts` + đọc trạng thái từ DB; không `vi.spyOn` (không tồn tại trong repo), không hook test-only (chốt validation session 1). |
| Snapshot rò field bị redact vào workflow | Thấp | Đúng thiết kế REST hiện tại. Ghi rõ trong test để không ai "sửa" nhầm sau. |
| Sửa `logActivity` làm hỏng timeline UI | Trung bình | Khớp REST, là shape UI đang render. `tests/api-integration.test.ts` phủ phần này. |

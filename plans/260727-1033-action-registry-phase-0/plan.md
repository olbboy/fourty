---
title: "Action Registry Phase 0 — parity fixes, kernel, contacts"
description: "Sửa bug toàn vẹn dữ liệu khi delete và sai lệch side-effect giữa REST/GraphQL/MCP, rồi dựng Action Registry nội bộ và migrate contacts. TDD: đổi hành vi và đổi cấu trúc tách bạch."
status: in_progress
priority: P1
branch: "main"
tags: [refactor, architecture, tdd, action-registry, adr-017]
blockedBy: []
blocks: []
created: "2026-07-27T03:35:58.898Z"
createdBy: "ck:plan"
source: skill
---

# Action Registry Phase 0 — parity fixes, kernel, contacts

## Overview

Fourty viết chuỗi guard/side-effect nghiệp vụ **ba lần** — REST (58 route),
GraphQL (`src/lib/graphql/schema.ts`), MCP/AI (`src/mcp/tools.ts`, 698 dòng).
Ba bản copy-paste đã trôi dạt khỏi nhau và sinh ra bug thật (§Bug bên dưới).

Plan này thực thi [ADR-017](../../docs/adr/017-action-registry.md) tới hết
**Phase 0**: sửa sai lệch, dựng kernel, migrate `contacts`. Dừng ở đó để đo chi
phí thật trước khi cam kết 57 route còn lại.

**Nguyên tắc TDD cốt lõi của plan:** *đổi hành vi* và *đổi cấu trúc* không bao
giờ nằm chung một phase.
- Phase 1-2 đổi hành vi → test đỏ trước, xanh sau.
- Phase 4 đổi cấu trúc → **mọi test hiện có phải pass mà không được sửa một dòng**.
  Sửa test để chiều refactor = migration thất bại, revert.

## Bug đang tồn tại (động lực, không phải giả định)

> **Mở rộng sau red-team 2026-07-27.** Ma trận ban đầu chỉ track `dispatchEvent`.
> Red-team chứng minh phạm vi đó quá hẹp: `logActivity`, `audit.meta`, snapshot
> shape và ngữ nghĩa `delete` đều phân kỳ.
>
> **Validate 2026-07-27:** ngữ nghĩa `delete` hoá ra nặng hơn báo cáo (mục B) nên
> tách thành Phase 1 riêng; parity còn lại là Phase 2.

### A. Workflow event

Ma trận `dispatchEvent` thực đo trên `main`:

| Event | REST | GraphQL | MCP / AI agent |
|---|---|---|---|
| `contact.created` | ✅ | ✅ | **❌** |
| `contact.updated` | ✅ | **❌** | **❌** |
| `company.created` | ✅ | **❌** | **❌** |
| `task.completed` | ✅ | n/a | **❌** |
| `deal.created` | ✅ | n/a | ✅ |
| `deal.stage_changed` / `won` / `lost` | ✅ | n/a | ✅ |

**Tác động người dùng:** workflow automation **im lặng không chạy** khi record
được tạo/sửa qua AI agent, MCP client hoặc GraphQL — trừ deals. Không lỗi, không
log. `create_deal` trong `tools.ts` nhớ dispatch; `create_contact` ngay bên trên
thì quên.

### B. Ngữ nghĩa `delete` — phân kỳ 3 chiều (nghiêm trọng hơn A)

| Hành vi | REST | GraphQL | MCP |
|---|---|---|---|
| not-found | 404 | `false` im lặng — **chủ đích, giữ nguyên** | throw |
| **contact:** xoá notes + activities | ✅ | **❌** | ✅ |
| **company:** detach `contacts.companyId` | ✅ | **❌** | ✅ |
| **company:** detach `deals.companyId` | ✅ | **❌** | ✅ |
| **company:** xoá notes + activities | ✅ | **❌** | ✅ |
| dry-run trừ khi `confirm` | không | không | ✅ — chủ đích |

Xoá contact qua GraphQL để lại orphan notes/activities. Xoá **company** qua
GraphQL còn tệ hơn: contacts và deals ở lại, trỏ tới một `companyId` **không còn
tồn tại** (`src/lib/graphql/schema.ts:490`).

**Không sửa được ở tầng DB:** `notes`/`activities` là quan hệ **đa hình**
(`entityType` + `entityId`, `src/db/schema.ts:279`), Postgres không đặt FK trên
khoá đa hình → `ON DELETE CASCADE` bất khả thi. Cascade tầng ứng dụng là lựa chọn
duy nhất, hiện viết tay **6 lần** — chính là căn bệnh ADR-017 chữa.

### C. `logActivity`

`contacts.update`: REST có điều kiện + kèm diff; MCP vô điều kiện không diff;
GraphQL **không gọi**. Timeline hoạt động thiếu mục tuỳ theo đường ghi.

### D. `audit.meta` và snapshot shape

`meta.via` chỉ có ở MCP; `meta.fields` chỉ có ở REST update; GraphQL không gắn
gì. Snapshot `contact.updated` của REST có `changedFields`, hai surface kia
không. `tests/audit-log.test.ts` **không kiểm `meta`** → mất là không ai biết.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Delete semantics data-integrity fix](./phase-01-delete-semantics.md) | Completed |
| 2 | [Side-effect parity fix](./phase-02-side-effect-parity.md) | Completed |
| 3 | [Action kernel](./phase-03-action-kernel.md) | Pending |
| 4 | [Contacts migration](./phase-04-contacts-migration.md) | Pending |
| 5 | [Consolidation](./phase-05-consolidation.md) | Pending |

**Thứ tự bắt buộc:** 1 → 2 → 3 → 4 → 5. Phase 3 (kernel) độc lập về code với
Phase 1-2 nhưng phải merge sau, để lưới test của chúng bảo vệ Phase 4.

**Phase 1 và 2 đều đổi hành vi; Phase 4 thì không.** Mỗi phase một commit tách
biệt — Phase 1 và 2 là escape hatch duy nhất cho hai loại behavior change khác
nhau, nên tuyệt đối không squash chung.

## Ràng buộc thiết kế (ràng buộc, không phải gợi ý)

Chép từ ADR-017. Vượt bất kỳ điều nào → dừng, ra ADR mới.

1. **Không sinh GraphQL SDL từ zod.** Chỉ trỏ resolver về kernel, type giữ viết tay.
2. **Không thêm runtime dependency.** `zod → JSON Schema` hand-roll ~80 dòng.
   Giữ ~10 deps (`package.json`).
3. **`effects` là hàm thuần, không DSL.** Cần rẽ nhánh thì viết TypeScript.
4. **Registry là API nội bộ.** Không document ra ngoài, không load action ngoài
   repo, không cam kết stability. Mở public = đảo ADR-016 = cần ADR riêng.
5. **Không phá public API contract.** REST response shape và GraphQL SDL phải
   **giống hệt** trước/sau Phase 3. MCP `tools/list` phải **tương thích**:
   required giữ required, enum giữ nguyên giá trị, lời gọi hợp lệ hôm nay vẫn hợp
   lệ và trả cùng kết quả. Mở rộng (thêm field optional cho `list_contacts`) được
   phép và **phải ghi chép**; thu hẹp hay đổi ngữ nghĩa thì không.
   *(Sửa sau red-team #12 — bản trước ghi "giống hệt" cho cả ba, mâu thuẫn với
   quyết định mở rộng `list_contacts` ở Phase 2.)*

## Ngưỡng từ bỏ (chốt TRƯỚC khi có chi phí chìm)

<!-- Updated: Validation Session 1 — chốt tiêu chí đo được thay vì để Phase 5 tự đánh giá. -->

Plan này đặt cược rằng pattern Action Registry nhân rộng được cho 57 route còn
lại. Cược có thể sai. **Ba tiêu chí máy kiểm được dưới đây, chạm bất kỳ cái nào
thì DỪNG** — không tiếp Phase 1 của ADR-017, ghi kết quả âm vào ADR, giữ lại
những gì đã sửa được (Phase 1-2 vẫn có giá trị độc lập):

| # | Ngưỡng | Kiểm bằng |
|---|---|---|
| 1 | Phase 4 phải sửa **bất kỳ** test có sẵn nào để pass | `git diff --name-only tests/` khác rỗng |
| 2 | `execute.ts` vượt **120 dòng** | `wc -l src/lib/actions/execute.ts` |
| 3 | Cần khoá `effects` **thứ 5**, hoặc cần lifecycle hook / middleware chain | Review thiết kế |

Chạm ngưỡng **không phải** thất bại — là câu trả lời rẻ cho một câu hỏi đắt. Chi
phí dừng ở đây bằng một entity; chi phí phát hiện ở route thứ 40 thì không.

Ngưỡng này ràng buộc: Phase 5 **không được** hợp lý hoá tiếp tục khi đã chạm một
trong ba, chỉ vì đã bỏ công.

## Acceptance criteria (toàn plan)

- [ ] Side-effect đồng nhất: cùng operation → cùng tập event, cùng activity,
      cùng audit key + `meta`, cùng snapshot shape, cùng cascade — bất kể surface
- [ ] Khác biệt **chủ đích** (not-found idiom, dry-run của MCP) được ghi thành
      hợp đồng và assert riêng, không bị "sửa" nhầm
- [ ] `tests/surface-parity.test.ts` tồn tại và fail nếu một surface trôi dạt
- [ ] `src/lib/actions/` tồn tại; contacts CRUD chạy qua kernel trên cả 3 surface
- [ ] Toàn bộ test có trước Phase 4 pass **không chỉnh sửa**
- [ ] `npx tsc --noEmit` + `npm run build` xanh
- [ ] `package.json` dependencies không đổi
- [ ] ADR-017 chuyển `Proposed` → `Accepted` kèm số đo thật (LOC, coverage)
- [ ] Không còn orphan notes/activities hay `companyId` chết sinh ra từ bất kỳ surface nào

## Dependencies

Không có cross-plan dependency. Toàn bộ plan trong `plans/` đã `completed`/`done`.

Liên quan (không blocking):
- [`plans/260708-1645-remaining-features-backlog.md`](../260708-1645-remaining-features-backlog.md)
  mục **#10 "GraphQL mutations cho deals/tasks/notes"** — Phase 1 của ADR-017
  (ngoài plan này) sẽ đóng mục đó. Cập nhật backlog ở Phase 5.
- [ADR-016](../../docs/adr/016-ai-native-strategy.md) guardrail #3 — plan này làm
  guardrail đó thành cấu trúc thay vì kỷ luật copy-paste.
- Brainstorm gốc:
  [report](../reports/from-brainstorm-to-planner-260726-2147-agent-native-action-registry-report.md)

## Rollback

Mỗi phase là một commit độc lập. **Phase 1 và Phase 2 tuyệt đối không squash** —
chúng là escape hatch cho hai loại behavior change khác nhau (cố ý không thêm env
flag; xem Phase 2 bước 9).

| Tình huống | Thủ tục |
|---|---|
| Cascade Phase 1 xoá nhầm | Revert commit Phase 1. Độc lập với mọi thứ khác. |
| Phase 2 gây bão workflow | Revert commit Phase 2. Không kéo theo Phase 1. |
| Phase 4 lỗi, **Phase 5 chưa ship** | Đổi import route/resolver/tool về đường cũ — code cũ vẫn còn. |
| Phase 4 lỗi, **Phase 5 đã ship** | Revert **hai commit theo thứ tự: Phase 5 trước, rồi Phase 4.** Phase 5 đã xoá code cũ nên "đổi import" không còn khả dụng. |

*(Hàng cuối thêm sau red-team #6 — bản trước khẳng định revert luôn chỉ là đổi
import, sai sau khi phase dọn dẹp xoá code.)*

## Red Team Review

### Session — 2026-07-27
**Reviewers:** Security Adversary · Assumption Destroyer · Failure Mode Analyst
(Standard tier: Fact Checker + Contract Verifier)
**Findings:** 19 thô → 15 sau dedupe (14 accepted, 1 accepted-modified, 0 rejected)
**Severity:** 6 Critical, 5 High, 4 Medium

Bốn claim quyết định được controller **tự verify lại** thay vì tin subagent. Cả
bốn đều đúng; hai là lỗi thực tế trong plan bản đầu.

| # | Finding | Sev | Disposition | Applied To |
|---|---------|-----|-------------|------------|
| 1 | `effects.audit` thiếu kênh `meta` → đỏ `tests/ai-agent.test.ts:123`, mất `meta.fields` không ai bắt | Critical | Accept | Phase 3 |
| 2 | Subset zod thiếu `.min`(×8) `.partial`(×4) `.extend` `.length` → kernel throw ở action đầu tiên | Critical | Accept | Phase 3 |
| 3 | `contacts.delete` phân kỳ 3 chiều: not-found + cascade; GraphQL để orphan rows | Critical | Accept | **Phase 1** (tách riêng ở validate) |
| 4 | Phase đổi hành vi nhưng CHANGELOG ở phase dọn dẹp; không escape hatch tại chỗ | Critical | **Accept (modified)** | Phase 1 bước 5, Phase 2 bước 9 |
| 5 | Gate chống đệ quy chỉ ở bảng rủi ro, không ở bước thực thi | Critical | Accept | Phase 2 bước 2 |
| 6 | Rollback "đổi import" sai sau khi phase dọn dẹp xoá code cũ | Critical | Accept | plan.md §Rollback, Phase 4, Phase 5 |
| 7 | Spec snapshot thiếu `changedFields` mà REST thật có | High | Accept | Phase 2 B |
| 8 | `effects` không có state trước mutate; update cần diff cho cả 3 effect | High | Accept | Phase 3 |
| 9 | `logActivity` cũng phân kỳ — ngoài ma trận chỉ-track-`dispatchEvent` | High | Accept | Phase 2 D, plan.md §C |
| 10 | Không gì ràng buộc `object` khai báo với bảng `run()` đụng | High | Accept (risk acceptance) | Phase 3, Phase 5 bước 5 |
| 11 | `vi.spyOn` pattern được trích dẫn **không tồn tại** (0 kết quả toàn repo) | High | Accept | Phase 2 §Harness |
| 12 | Mâu thuẫn nội bộ: ràng buộc #5 "giống hệt" vs mở rộng `list_contacts` | Medium | Accept | plan.md ràng buộc #5, Phase 4 |
| 13 | `MCP list_contacts` đã hẹp hơn REST sẵn (thiếu status/companyId/sort, default limit khác) | Medium | Accept | Phase 4 |
| 14 | Thứ tự effects mâu thuẫn ADR-017 vs REST; non-atomicity `boss.send()` ngoài transaction | Medium | Accept | Phase 3, Phase 5 bước 5 |
| 15 | "Query params vào input schema" xung đột khoá phạm vi file của phase kernel | Medium | Accept | Phase 3 → `src/lib/actions/schemas.ts` |

**Finding 4 — vì sao "modified":** reviewer đòi kill switch bằng env flag. Từ chối
phần đó — một cờ config vĩnh viễn cho một bug fix là over-engineering và trái
ADR-016 guardrail #5 (~10 deps, tối giản). Nhận phần đưa CHANGELOG về đúng phase
đổi hành vi; escape hatch là revert commit của phase đó, vốn bắt buộc không squash.

**Báo cáo đầy đủ:** [`reports/`](./reports/) — 3 file, mỗi reviewer một file.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01`, `phase-02`, `phase-03`, `phase-04`
- Decision deltas checked: 8 — Phase 1 đổi tên/phạm vi (event → side-effect
  parity); `effects.audit` thêm `meta`; `effects` thêm `ctx`; subset zod mở rộng;
  CHANGELOG chuyển Phase 4 → Phase 1; ràng buộc #5 "giống hệt" → "tương thích";
  rollback thành 3 tình huống; schema list về `src/lib/actions/schemas.ts`
- Reconciled stale references: 11 — tiêu đề + frontmatter Phase 1, bảng phases
  trong `plan.md`, acceptance criteria toàn plan, `plan.md` §Bug (thêm B/C/D),
  ràng buộc #5, §Rollback, Phase 2 chữ ký + success criteria, Phase 3
  Requirements + bước 2b + §Architecture, Phase 4 §Related Files + bước 5-9 +
  success criteria
- **Unresolved contradictions: 0**

## Validation Log

### Session 1 — 2026-07-27
**Trigger:** `/ck:plan validate` sau khi red-team áp dụng 15 finding.
**Verification pass:** bỏ qua theo guard Step 2.5 — `## Red Team Review` đã có
evidence `file:line`. 0 tag `[UNVERIFIED]` còn lại.
**Questions asked:** 4 (1 câu hỏi mở khác tự tra được từ repo, không hỏi user).

#### Scout trước khi hỏi
Câu hỏi mở #6 (`deleteCompany`/`deleteDeal` qua GraphQL có cùng lỗi cascade
không) **tra được từ repo**, nên không đưa vào phỏng vấn. Kết quả: `deleteCompany`
qua GraphQL (`schema.ts:490`) **nặng hơn** ca contact — bỏ cả detach
`contacts.companyId` lẫn `deals.companyId`, để lại tham chiếu chết.
`deleteDeal` không tồn tại trên GraphQL. Cũng xác nhận FK cascade **bất khả thi**
vì `notes`/`activities` là quan hệ đa hình (`src/db/schema.ts:279`).

#### Questions & Answers

1. **[Scope]** Phase 1 giờ gồm cả parity side-effect LẪN bug dữ liệu delete. Tách hay gộp?
   - Options: Tách 1a delete-bug / 1b parity (Recommended) | Giữ một phase | Chỉ contacts trong plan này
   - **Answer:** Tách 1a delete-bug, 1b parity
   - **Rationale:** Bug toàn vẹn dữ liệu và đổi hành vi workflow là hai loại rủi
     ro khác hẳn nhau, cần ship và revert độc lập. Plan 4 → 5 phase.

2. **[Architecture]** GraphQL `delete*` trả `false` im lặng khi not-found — giữ không?
   - Options: Giữ `false` (Recommended) | Đồng nhất thành lỗi NOT_FOUND
   - **Answer:** Giữ `false`
   - **Rationale:** Đổi là breaking change của GraphQL API công khai, lợi ích
     thấp. Phải ghi thành hợp đồng + test pin, để kernel Phase 3-4 không "chuẩn
     hoá" nhầm thành đồng nhất.

3. **[Risk]** Nếu inline queue driver không quan sát đủ, cho phép hook test-only trong `engine.ts`?
   - Options: Ưu tiên đọc từ DB (Recommended) | Cho phép hook | Cho phép nhưng xoá ở phase cuối
   - **Answer:** Ưu tiên đọc từ DB
   - **Rationale:** Không đưa code sản xuất vào chỉ để phục vụ test. Nếu chứng
     minh được cách đọc DB không đủ → dừng và hỏi, không tự thêm hook.

4. **[Tradeoffs]** Chốt ngưỡng từ bỏ ngay bây giờ hay để Phase cuối đánh giá?
   - Options: Chốt tiêu chí đo được (Recommended) | Để phase cuối đánh giá bằng số đo
   - **Answer:** Chốt tiêu chí đo được
   - **Rationale:** Quyết định trước khi có chi phí chìm. 3 ngưỡng máy kiểm được
     (test bị sửa / `execute.ts` >120 dòng / cần khoá `effects` thứ 5).

#### Confirmed Decisions
- Tách Phase 1 → 5 phase, phase 1 là bug dữ liệu delete (gồm cả company detach)
- GraphQL not-found giữ `false`, ghi thành hợp đồng chủ đích
- Không thêm hook test-only vào `engine.ts`; assert bằng đọc DB
- Ngưỡng từ bỏ chốt trước, ràng buộc Phase 5 không được hợp lý hoá tiếp tục
- Không tự động dọn dữ liệu đã hỏng sẵn; chỉ cung cấp truy vấn chẩn đoán

#### Impact on Phases
- **Phase 1 (mới):** delete semantics, gồm phát hiện mới về `deleteCompany`
- **Phase 2:** gỡ mục C, harness bỏ case delete, chốt cách quan sát event
- **Phase 3-5:** renumber từ 2-4; tham chiếu chéo cập nhật
- **plan.md:** thêm §Ngưỡng từ bỏ, mở rộng §Bug mục B, rollback thành 4 tình huống

#### Ghi chú công cụ
`ck plan add-phase --after` không dùng được: tham số số → `afterId.toLowerCase is
not a function`; tham số chuỗi → `Invalid phase ID`. Đã renumber tay. Lỗi thuộc
`ck` CLI v4.5.0, không phải plan.

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-delete-semantics`, `phase-02-side-effect-parity`,
  `phase-03-action-kernel`, `phase-04-contacts-migration`, `phase-05-consolidation`
- Decision deltas checked: 5 — tách phase + renumber 1-4 → 1-5; delete ra khỏi
  parity; hợp đồng not-found `false`; cấm hook test-only; thêm ngưỡng từ bỏ
- Reconciled stale references: 30 — frontmatter + tiêu đề 4 file, bảng phases,
  §Overview, §Bug B, §Ngưỡng từ bỏ, acceptance, §Rollback, §Dependencies, cột
  "Applied To" của 15 finding red-team, và tham chiếu chéo trong 4 phase file
- **Unresolved contradictions: 0**

## Câu hỏi chưa giải quyết

1. `ToolContext` → đổi tên `ActionContext`? Nghiêng về **giữ tên**, chỉ mở rộng —
   đổi tên gây churn import toàn repo mà không thêm giá trị. Chốt ở Phase 3.
2. ~~Query params ở đâu~~ — **đã chốt** (red-team #15): vào `input` schema, schema
   list/get/delete đặt tại `src/lib/actions/schemas.ts`, `validators.ts` giữ nguyên.
3. Custom objects metadata-driven → cần *dynamic action provider*, có thể phá
   ràng buộc "không DSL". **Ngoài phạm vi plan này**, chốt ở Phase 2 của ADR-017.
4. `audit meta.via`: sau khi hợp nhất, REST nên tag `via:"rest"` / GraphQL
   `via:"graphql"` (hiện không tag) hay giữ `undefined`? Đổi = ảnh hưởng
   `tests/audit-log.test.ts`. Khuyến nghị: **giữ `undefined`**, bàn riêng.
5. ~~Hook test-only trong `engine.ts`~~ — **đã chốt** (validate #3): không. Đọc DB.
6. ~~`deleteCompany`/`deleteDeal` GraphQL có cùng lỗi không~~ — **đã tra**:
   `deleteCompany` có, và nặng hơn (đã đưa vào Phase 1). `deleteDeal` không tồn
   tại trên GraphQL (backlog #10).
7. **Mới:** dữ liệu đã hỏng sẵn trên các bản tự host (orphan rows + `companyId`
   chết do GraphQL delete trước đây) — chỉ cung cấp truy vấn chẩn đoán, **không**
   tự dọn. Có nên viết script dọn tuỳ chọn về sau không? Việc riêng, cần đồng ý
   của người vận hành vì nó xoá dữ liệu.

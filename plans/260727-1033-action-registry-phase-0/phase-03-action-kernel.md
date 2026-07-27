---
phase: 3
title: "Action kernel"
status: completed
priority: P1
effort: "M"
dependencies: [1, 2]
---

# Phase 3: Action kernel

> **Sửa sau red-team 2026-07-27.** Bản trước có hai lỗi Critical: `effects.audit`
> không có kênh `meta` (làm đỏ `tests/ai-agent.test.ts:123`), và subset
> zod→JSON-Schema thiếu `.min()/.partial()/.extend()/.length()` — tức kernel sẽ
> throw ngay ở action đầu tiên. Cả hai đã sửa bên dưới.

## Overview

Dựng `src/lib/actions/` — `defineAction`, kernel `execute()`, registry, adapter.
**Chưa migrate entity nào.** Kết thúc phase, kernel được test đầy đủ nhưng chưa
có route/resolver/tool nào dùng. Rủi ro với người dùng bằng không.

Tách khỏi Phase 4 để nếu thiết kế kernel sai, ta biết trước khi đụng 3 surface
đang chạy production.

## Requirements

**Functional**
- `defineAction()` khai báo một operation: tên, object (RBAC), verb, zod input
  schema, `expose`, `run`, `effects`.
- `execute(action, rawInput, ctx)` chạy chuỗi guard/side-effect **đúng một lần**:
  ```
  can(role, object, verb)
    → loadFieldPolicy(role) → blockedWrites() → nếu có → Forbidden
    → action.input.safeParse(rawInput)
    → action.run(parsed, ctx)          // run tự nạp `existing` nếu cần
    → effects.activity? → logActivity()
    → effects.audit?    → audit(userId, key, { objectType, objectId, meta })
    → effects.rescore?  → recompute*Score()
    → effects.events?   → dispatchEvent() từng event
    → redact(policy, object, output)
  ```
- Adapter dịch giữa kernel và surface:
  - `rest.ts` → `toRouteHandler(action)`: Request → execute → `NextResponse`
  - `graphql.ts` → `toResolver(action)`: args + GqlContext → execute → `GraphQLError`
  - `mcp.ts` → `toMcpTool(action)`: sinh `Tool` khớp type trong `src/mcp/tools.ts`
  - `ai.ts` → tái dùng `src/lib/ai/tool-bridge.ts`, giữ cờ `mutates`
- Ánh xạ lỗi theo idiom từng surface: RBAC → 403 / `FORBIDDEN` / `ToolError`;
  validation → 400 / `BAD_USER_INPUT` / `ToolError`; not-found → 404 /
  (`deleteContact` trả `false` — khác biệt chủ đích, xem Phase 1 mục C) / `ToolError`.

**Non-functional**
- **Không thêm runtime dependency.** `package.json` `dependencies` không đổi.
- Kernel không mở transaction riêng — chạy trong `withWorkspace()` do caller mở.
- Phần thuần (mapping lỗi, zod→JSON Schema, thứ tự effects với fake) test được
  không cần Postgres.

## Architecture

```
src/lib/actions/
  types.ts        ActionDef, ActionContext, ActionError
  define.ts       defineAction() — identity + type inference
  execute.ts      kernel
  registry.ts     Map name → action
  json-schema.ts  zod → JSON Schema (hand-roll)
  schemas.ts      schema cho list/get/delete input (xem red-team #15)
  adapters/
    rest.ts  graphql.ts  mcp.ts  ai.ts
```

### Chữ ký

```ts
export type ActionContext = {
  workspaceId: string;
  role: string;
  userId: string | null;
  via?: string;          // "mcp" | "ai" | undefined — giữ nguyên ngữ nghĩa hiện tại
};

export type ActionDef<I, O> = {
  name: string;                          // "contacts.create"
  object: string;                        // "contacts" — khoá RBAC + field-perm
  verb: "read" | "create" | "update" | "delete";
  description: string;
  input: z.ZodType<I>;
  /**
   * Surface nào phục vụ action này. Thuần khai báo — kernel không tự đăng ký
   * route/resolver/tool; adapter vẫn gọi tay ở Phase 4. Giá trị: làm cổng chặn
   * coverage ở Phase 5 kiểm được ("đã khai mcp thì tools/list phải có").
   */
  expose: { rest?: boolean; graphql?: boolean; mcp?: boolean; ai?: boolean };
  run: (input: I, ctx: ActionContext) => Promise<O>;
  effects?: {
    activity?: (input: I, out: O, ctx: ActionContext) => ActivityInput | null;
    /** meta BẮT BUỘC có — xem red-team #1 bên dưới. */
    audit?:    (input: I, out: O, ctx: ActionContext)
                 => { key: string; objectType: string; objectId: string;
                      meta?: Record<string, unknown> } | null;
    rescore?:  (input: I, out: O) => Promise<void> | null;
    events?:   (input: I, out: O) => EventContext[];      // [] = không dispatch
  };
};
```

### Red-team #1 — `effects.audit` phải mang được `meta`

Bản trước dùng `{ key, objectId }`. Không đủ:

| Call site | meta thật | Test bắt được? |
|---|---|---|
| `src/mcp/tools.ts:179` và 9 chỗ khác | `{ via: ctx.via ?? "mcp" }` | ✅ `tests/ai-agent.test.ts:123` |
| `src/app/api/contacts/[id]/route.ts:62` | `{ fields: changed }` | ❌ **không test nào kiểm `meta`** |

`tests/ai-agent.test.ts:123` assert `JSON.parse(audits[0].meta).via === "ai"` —
chạy trên `create_contact`, đúng entity Phase 4 migrate. Thiếu `meta` → test đỏ →
Phase 4 vi phạm chính tiêu chí thoát của nó. `meta.fields` còn tệ hơn: mất mà
không ai biết. Vì vậy `effects.audit` nhận `ctx` và trả `meta`.

### Red-team #8 — effects cần state trước khi mutate

`contacts.update` cần diff với `existing` cho **cả ba** effect: activity có điều
kiện, `audit meta.fields`, và `changedFields` trong event snapshot.

**Cách giải — không thêm khoá vào `effects`:** `run()` tự nạp `existing` và trả
về nó trong output. Với update, `O` là `{ row, existing, changedFields }` chứ
không phải mỗi `row`; adapter chọn phần nào trả cho caller.

Giữ được ràng buộc "effects là hàm thuần của `(input, output, ctx)`" mà không
đẻ thêm lifecycle hook. Test kernel **phải có** một case update dùng
`existing`— bản trước không có.

### Red-team #2 — subset zod (đã sửa)

Đo thật trên `src/lib/validators.ts`:

| Construct | Số lần | Có trong subset cũ? |
|---|---|---|
| `.max()` | 21 | ✅ |
| `.min()` | 8 | **❌ THIẾU** |
| `.partial()` | 4 | **❌ THIẾU** |
| `.extend()` | 1 | **❌ THIẾU** |
| `.length()` | 1 | **❌ THIẾU** |
| `.email()` | 1 | ✅ |

`contactInput.firstName` là `z.string().min(1).max(120)` — chính field mà ví dụ
Phase 4 dùng. Theo thiết kế "ngoài subset thì throw", action **đầu tiên** sẽ
throw. Subset bắt buộc: `z.object`, `z.string` (+`.min` `.max` `.email`
`.length`), `z.number`, `z.boolean`, `z.enum`, `z.record`, `.optional()`,
`.nullable()`, `.default()`, `.partial()`, `.extend()`.

`.partial()`/`.extend()` là phép biến đổi schema, không phải constraint field —
converter chỉ cần đọc `_def.shape()` đã giải sau biến đổi, không cần xử lý riêng.
**Kiểm bằng test, đừng suy đoán.**

### Red-team #14 — thứ tự effects + tính nguyên tử

Thứ tự canonical trong Requirements **không khớp REST**, và REST cũng đã tự mâu
thuẫn: `create` gọi `audit` *trước* `recompute`; `update` gọi `recompute` *trước*
`audit`. Không test nào pin thứ tự này.

**Quyết định:** kernel dùng **một** thứ tự cố định (activity → audit → rescore →
events). Sai lệch với REST hiện tại chỉ ở vị trí tương đối `audit`↔`rescore`, mà
hai cái này độc lập (audit không đọc score). Ghi rõ đây là **chuẩn hoá có chủ
đích**, và thêm test pin thứ tự để lần sau không trôi.

**Không nguyên tử — kế thừa nguyên trạng:** `dispatchEvent` → `boss.send()`
commit ngoài transaction `withWorkspace()` của request. Nếu effect sau đó throw,
job workflow vẫn chạy cho entity đã rollback. Kernel **không làm tệ hơn cũng
không sửa** — ghi vào ADR-017 là hạn chế đã biết. Sửa nó là việc riêng (outbox
pattern), ngoài phạm vi.

### Red-team #10 — không gì ràng buộc `object` với bảng `run()` đụng

Kernel tin hoàn toàn chuỗi `object` tự khai. Khai `object: "contacts"` rồi `run()`
ghi vào `deals` → RBAC check sai đối tượng, không ai phát hiện.

Claim của ADR-017 *"AI path không thể bypass RBAC vì không còn đường thứ hai"*
phụ thuộc vào giả định này đúng mãi khi thêm ~50 action nữa.

**Không đóng được trong Phase 0** (mới 1 entity). **Risk acceptance có ghi chép:**
- Phase 5 ghi hạn chế này vào ADR-017, không để claim đứng trần
- Ý tưởng mitigation cho ADR-017 Phase 1 (không làm bây giờ): test khẳng định
  mỗi action chỉ đụng bảng khớp `object`, bằng cách bọc `db` trong test proxy
  ghi lại bảng bị truy cập
- **Không** phát minh cơ chế enforce ngay bây giờ — YAGNI với một entity

### Red-team #15 — schema list đặt ở đâu

Quyết định "query params vào `input` schema" xung đột với khoá phạm vi file của
chính phase này: `validators.ts` **không có** schema list nào để tái dùng, mà
`validators.ts` lại nằm ngoài `src/lib/actions/`.

**Giải:** schema list/get/delete sống trong **`src/lib/actions/schemas.ts`**.
`validators.ts` giữ nguyên (schema ghi cho entity). Khoá phạm vi file vẫn đúng.

### Ranh giới chống phình (ràng buộc ADR-017)

`effects` là **4 khoá cố định**, mỗi khoá một hàm thuần của `(input, output, ctx)`.
Không lifecycle bus, không middleware chain, không plugin. Cần khoá thứ 5 → tín
hiệu thiết kế sai, dừng và bàn.

## Related Code Files

**Create**
- `src/lib/actions/{types,define,execute,registry,json-schema,schemas}.ts`
- `src/lib/actions/adapters/{rest,graphql,mcp,ai}.ts`
- `tests/action-kernel.test.ts`
- `tests/action-json-schema.test.ts`

**Đọc để lấy contract (không sửa)**
- `src/lib/api.ts` — `withAuth`, `authorize`, `json`, `apiError`, `parseBody`, `AuthOk`
- `src/mcp/tools.ts` — type `Tool`, `ToolContext`, `requireRole`, `requireWritableFields`
- `src/lib/graphql/schema.ts` — `GqlContext`, `requireRbac`, `guardWrites`, `zparse`, `byId`
- `src/lib/field-permissions.ts`, `src/lib/permissions.ts`, `src/lib/audit.ts`,
  `src/lib/activity.ts`, `src/lib/workflows/engine.ts`
- `src/lib/validators.ts` — nguồn sự thật cho subset zod

**Không sửa file nào ngoài `src/lib/actions/` và `tests/`.**

## Implementation Steps

1. **Viết `tests/action-kernel.test.ts` TRƯỚC**, dùng action giả lập (không chạm
   bảng CRM thật) để pin:
   - RBAC chặn trước validate (viewer + create → Forbidden, `run` không chạy)
   - field-perm chặn trước validate
   - input sai → lỗi validation, `run` không chạy
   - thứ tự effects: activity → audit → rescore → events
   - **`effects.audit` trả được `meta`; `meta` tới đúng `audit()`** (red-team #1)
   - **case update dùng `existing` từ output** (red-team #8)
   - `effects.events` trả `[]` → không gọi `dispatchEvent`
   - output đi qua `redact()`; **`redact` áp cho cả output đơn lẫn mảng**
   - `run` throw → không effect nào chạy
   Chạy → đỏ.

2. **`types.ts` + `define.ts`.** `defineAction` là identity function có generic.

3. **`execute.ts`** cho tới khi bước 1 xanh. Vượt ~120 dòng = có thứ không thuộc đây.

4. **`tests/action-json-schema.test.ts`**: với **mọi** schema trong
   `validators.ts`, converter phải sinh JSON Schema — kể cả `.min` `.partial`
   `.extend` `.length`. Ground truth là `inputSchema` viết tay trong
   `src/mcp/tools.ts` (MCP client đang phụ thuộc).
   > `inputSchema` hiện tại **lỏng hơn** zod (ví dụ `create_contact` thiếu
   > `source`, `linkedin`, `city`, `country`, `custom`). Yêu cầu là *tương thích*,
   > không phải giống hệt: required giữ required, enum giữ nguyên giá trị. Mọi
   > chênh lệch phải liệt kê trong test và là chủ đích.

5. **`json-schema.ts`** cho tới khi xanh. Construct ngoài subset → throw rõ ràng
   lúc build, không sinh schema sai âm thầm.

6. **`schemas.ts`** — schema list/get/delete (red-team #15).

7. **`registry.ts`** — `Map`, `register()` throw khi trùng tên.

8. **Adapters.** Mỗi cái mỏng: dịch input, gọi `execute`, dịch lỗi. Không logic
   nghiệp vụ. Test mapping lỗi từng adapter.

9. **Test cách ly:** khẳng định kernel không import `next/server`, `graphql`,
   hay type MCP (grep trong test).

10. `npx tsc --noEmit` + toàn bộ suite (phải xanh — chưa ai dùng code mới).

## Tests / Validation

```bash
npm run test -- tests/action-kernel.test.ts tests/action-json-schema.test.ts
npm run test
npx tsc --noEmit
git diff --stat package.json    # phải rỗng
```

## Success Criteria

- [ ] `src/lib/actions/` đầy đủ theo cây trên (gồm `schemas.ts`)
- [ ] `ActionDef` có `expose` (Phase 5 cần để dựng cổng chặn)
- [ ] **`effects.audit` mang được `meta`; test chứng minh `meta` tới `audit()`**
- [ ] **`effects` nhận `ctx`; có test case update dùng `existing`**
- [ ] **`json-schema.ts` xử lý được `.min` `.max` `.email` `.length` `.partial`
      `.extend`** — test chạy trên mọi schema thật trong `validators.ts`
- [ ] `redact` áp đúng cho cả output đơn lẫn mảng
- [ ] Thứ tự effects được pin bằng test; chuẩn hoá vs REST được ghi chép
- [ ] `execute.ts` ≤ ~120 dòng
- [ ] `package.json` dependencies **không đổi**
- [ ] Không file nào ngoài `src/lib/actions/` + `tests/` bị sửa
- [ ] Toàn bộ suite xanh, `tsc --noEmit` xanh

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Kernel over-abstract thành framework-trong-framework | **Cao** | 4 khoá `effects` + trần ~120 dòng là ràng buộc cứng. `existing` giải bằng output shape, không thêm hook. |
| zod→JSON Schema sai âm thầm, MCP client hỏng | **Cao** | Ground truth là `inputSchema` viết tay. Ngoài subset → throw lúc build. Subset đã đo thật, không suy đoán. |
| `object` khai không khớp bảng `run()` đụng | **Cao** | Không đóng được ở Phase 0. Risk acceptance ghi vào ADR-017 ở Phase 5 + đề xuất mitigation cho Phase 1 ADR. Claim của ADR không được đứng trần. |
| Kernel không kham nổi thực tế messy | Trung bình | Chỉ chứng minh với contacts. Sửa kernel khi mới 1 entity là rẻ — chính là lý do tách Phase 3/4. |
| Adapter rò chi tiết surface vào kernel | Trung bình | Test cách ly ở bước 9. |
| Non-atomicity enqueue vs transaction | Trung bình | Kế thừa nguyên trạng, không làm tệ hơn. Ghi vào ADR-017 là hạn chế đã biết. Outbox pattern ngoài phạm vi. |
| Alias `ActionContext = ToolContext` gây nhầm | Thấp | Comment rõ lý do; hợp nhất tên khi migration toàn bộ xong. |

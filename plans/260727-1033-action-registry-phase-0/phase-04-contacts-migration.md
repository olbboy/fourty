---
phase: 4
title: "Contacts migration"
status: completed
priority: P1
effort: "M"
dependencies: [1, 2, 3]
---

# Phase 4: Contacts migration

## Overview

Định nghĩa `contacts.*` một lần bằng `defineAction`, rồi trỏ REST route, GraphQL
resolver và MCP tool về đó. **Refactor thuần — không đổi hành vi.**

Đây là phase chứng minh cả luận điểm. Nếu không migrate được contacts mà giữ
nguyên test, pattern sai và phải dừng trước khi đụng 57 route còn lại.

## Requirements

**Functional**
- 5 action: `contacts.list`, `contacts.get`, `contacts.create`, `contacts.update`,
  `contacts.delete`.
- `src/app/api/contacts/route.ts` + `src/app/api/contacts/[id]/route.ts` dùng
  `toRouteHandler()`.
- GraphQL `contacts`/`contact`/`createContact`/`updateContact`/`deleteContact`
  resolver dùng `toResolver()`. **SDL không đổi** — type vẫn viết tay.
- MCP `list_contacts`/`create_contact`/`update_contact`/`delete_contact` sinh từ
  `toMcpTool()`. `tools/list` phải **tương thích** với hiện tại — required giữ
  required, enum giữ nguyên giá trị; mọi chênh lệch phải là chủ đích và ghi chép
  (khớp ràng buộc #5 của `plan.md` sau red-team #12).
- `delete_contact` giữ ngữ nghĩa **dry-run trừ khi `confirm: true`** (hành vi MCP
  hiện có, `src/mcp/tools.ts:358`). Bất đối xứng **chủ đích** → biểu diễn trong
  `input` schema của action, không phải cờ riêng của adapter.
- **Ngữ nghĩa `delete` đã được Phase 1 chuẩn hoá** (cascade thống nhất; not-found
  và dry-run giữ khác biệt chủ đích). Phase này chỉ *bảo toàn* hợp đồng đó, không
  quyết lại. Nếu Phase 1 chưa xong → **không bắt đầu phase này**.

**Mở rộng có chủ đích của `list_contacts` (red-team #13)**

`MCP list_contacts` hiện **hẹp hơn REST**: không có `status`, `companyId`, `sort`,
và default `limit` khác. Đưa query params vào `input` schema (quyết định ở Phase
2) sẽ **mở rộng** MCP tool — thêm khả năng, không phá cái cũ.

Ràng buộc: lời gọi hợp lệ hôm nay phải vẫn hợp lệ và trả cùng kết quả. Field mới
đều optional; **default `limit` của MCP giữ nguyên giá trị hiện tại**, không đổi
sang default của REST. Pin bằng test trước khi migrate.

**Non-functional — tiêu chí thoát cứng**
- **Mọi test tồn tại trước phase này phải pass mà KHÔNG sửa một dòng.**
  Bao gồm `tests/api-integration.test.ts`, `tests/graphql.test.ts`,
  `tests/mcp.test.ts`, `tests/field-permissions.test.ts`, `tests/rbac-matrix.test.ts`,
  `tests/audit-log.test.ts`, `tests/tenant-isolation.test.ts`,
  `tests/surface-parity.test.ts` (từ Phase 2).
  Cần sửa test = **migration thất bại**, revert, thiết kế lại kernel.
- E2E Playwright xanh (`npm run test:e2e`).
- Không đổi public contract: REST response shape, GraphQL SDL, MCP tool schema.

## Architecture

**Strangler:** code cũ vẫn còn trong repo hết Phase 4, chỉ không được gọi nữa.
Xoá ở Phase 5.

> **Cửa sổ rollback có hạn (red-team #6).** "Revert = đổi import về đường cũ"
> chỉ đúng **trước khi Phase 5 ship**. Sau khi Phase 5 xoá code cũ, revert đòi
> hỏi revert **hai commit theo đúng thứ tự** (Phase 5 trước, rồi Phase 4). Ghi
> vào commit message của Phase 5 để người trực sự cố không phải tự suy ra lúc
> 3 giờ sáng.

```
src/lib/actions/contacts/
  list.ts  get.ts  create.ts  update.ts  delete.ts
  index.ts        # register hết vào registry
```

Ví dụ `create.ts` (nháp — mọi mảnh đã tồn tại trong `src/app/api/contacts/route.ts`):

```ts
export const contactsCreate = defineAction({
  name: "contacts.create",
  object: "contacts",
  verb: "create",
  description: "Create a contact. Requires firstName.",
  input: contactInput,                       // dùng lại validator sẵn có
  run: async (data, ctx) => {
    const now = Date.now();
    const id = newId();
    const { custom, ...fields } = data;
    await db.insert(tables.contacts).values({
      id, ...fields,
      ownerId: ctx.userId,
      custom: JSON.stringify(custom ?? {}),
      createdAt: now, updatedAt: now,
    });
    await recomputeContactScore(id);         // trước khi đọc row → snapshot có score mới
    return (await db.select().from(tables.contacts)
      .where(eq(tables.contacts.id, id)).limit(1))[0]!;
  },
  effects: {
    activity: (_i, row) => ({ type: "created", entityType: "contact", entityId: row.id }),
    audit:    (_i, row) => ({ key: "contact.created", objectId: row.id }),
    events:   (_i, row) => [{ event: "contact.created", entityType: "contact",
                              entityId: row.id, snapshot: { ...row, custom: undefined } }],
  },
});
```

**Ba chi tiết dễ làm hỏng parity — xử lý minh bạch:**

1. **`ownerId`.** REST/GraphQL dùng `auth.user?.id ?? null`; MCP dùng `ctx.userId`.
   Hai cái *đã* tương đương (`ctx.userId` là `null` cho caller API-key), nên
   `ctx.userId` là đúng. Cần một test khẳng định caller API-key vẫn tạo được
   contact với `ownerId = null`.

2. **Merge `custom` khi update.** GraphQL merge nông
   (`{ ...JSON.parse(existing.custom), ...custom }`). Kiểm REST và MCP có làm
   giống không **trước khi** viết action. Nếu lệch → đó là bug thứ hai; **dừng,
   báo user**, đừng lặng lẽ chọn một bên. Sửa nó thuộc Phase 2, không phải ở đây.

2b. **Thông điệp lỗi field-permission (red-team #7).** REST và MCP/GraphQL dùng
   hai câu khác nhau cho blocked-write; test hiện tại chỉ regex lỏng nên hợp nhất
   sẽ **không** làm test đỏ dù hợp đồng lỗi thật đã đổi. Ghi lại cả hai câu trước
   khi migrate, chọn một, và ghi vào `CHANGELOG.md` nếu câu REST đổi — người dùng
   API có thể đang parse nó.

3. **Field-permission redact ở list.** REST redact từng row sau khi query. Kernel
   redact output — với list, output là mảng. `execute()` phải xử lý cả hai; pin
   bằng test.

## Related Code Files

**Create**
- `src/lib/actions/contacts/{list,get,create,update,delete,index}.ts`

**Modify**
- `src/app/api/contacts/route.ts` — GET/POST → `toRouteHandler`
- `src/app/api/contacts/[id]/route.ts` — GET/PATCH/DELETE → `toRouteHandler`
- `src/lib/graphql/schema.ts` — 5 resolver contact → `toResolver`; **type giữ nguyên**
- `src/mcp/tools.ts` — 4 tool contact → sinh từ `toMcpTool`; tool khác không đụng

**Không sửa**
- Bất kỳ file nào trong `tests/` (đó chính là tiêu chí thoát)
- Route/resolver/tool của companies, deals, tasks, notes

## Implementation Steps

1. **Chốt baseline.** Chạy full suite, lưu output:
   ```bash
   npm run test 2>&1 | tail -30 > /tmp/baseline-tests.txt
   ```
   Số test pass phải khớp chính xác ở bước cuối.

2. **Đối chiếu ba bản `create`/`update`/`delete`/`list` contact** (REST vs GraphQL
   vs MCP), lập bảng khác biệt. Với mỗi khác biệt, phân loại:
   *chủ đích* (giữ, biểu diễn trong action) hay *trôi dạt* (**dừng, báo user**).
   Không tự quyết bên nào thắng.

3. **`contacts.create` trước** — dễ nhất, tự chứa. Trỏ chỉ REST POST về nó. Chạy
   `tests/api-integration.test.ts`. Xanh mới đi tiếp.

4. **Trỏ GraphQL `createContact`** về cùng action. Chạy `tests/graphql.test.ts`.

5. **Trỏ MCP `create_contact`** về cùng action. Chạy `tests/mcp.test.ts` +
   `tests/surface-parity.test.ts`. Ba surface giờ dùng chung một implementation —
   đây là lúc tiêu chí thoát thật sự bị thử.

6. **Lặp cho `list` → `get` → `update` → `delete`.** Mỗi operation là một commit.
   Bất kỳ bước nào cần sửa test → dừng, revert commit đó, báo user.

7. **Full suite + e2e + build.**

8. **Đo và ghi lại**: LOC trước/sau ở 3 file, số lời gọi `db.*` trực tiếp còn lại
   trong `tools.ts` cho contacts (phải là 0). Số liệu này vào ADR-017 ở Phase 5.

## Tests / Validation

```bash
npm run test                 # phải khớp baseline, 0 file test bị sửa
npm run test:e2e
npx tsc --noEmit
npm run build
git diff --name-only tests/  # phải RỖNG — tiêu chí thoát cứng
```

## Success Criteria

- [ ] 5 action contacts tồn tại, đăng ký trong registry
- [ ] REST + GraphQL + MCP contact ops đều chạy qua kernel
- [ ] `git diff --name-only tests/` **rỗng** — không test nào bị sửa
- [ ] Số test pass khớp baseline bước 1
- [ ] E2E Playwright xanh
- [ ] `tsc --noEmit` + `npm run build` xanh
- [ ] GraphQL SDL không đổi (so introspection trước/sau)
- [ ] MCP `tools/list` cho contact tools tương thích với trước
- [ ] 0 lời gọi `db.*` trực tiếp cho contacts trong `src/mcp/tools.ts`
- [ ] Ghi lại số đo LOC trước/sau

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Kernel không kham nổi thực tế messy (merge `custom`, redact mảng, dry-run delete) | **Cao** | Từng operation một, từng surface một, commit riêng. Hỏng ở đâu revert đúng đó. Sửa kernel khi mới 1 entity là rẻ. |
| Cám dỗ "sửa tí test cho qua" | **Cao** | `git diff --name-only tests/` rỗng là tiêu chí máy kiểm được, không phải lời hứa. Đưa vào checklist review. |
| Lộ ra bug thứ hai (custom merge lệch giữa 3 surface) | Trung bình | Bước 2 phát hiện sớm. Xử lý = phase-1-style fix riêng, không nhét vào refactor. |
| Đổi SDL GraphQL âm thầm | Trung bình | So introspection trước/sau. `tests/graphql.test.ts` đã có test introspection. |
| MCP tool schema đổi làm hỏng client bên ngoài | Trung bình | Test tương thích JSON Schema ở Phase 3 là chốt chặn; chênh lệch phải là chủ đích và có ghi chép. |
| Refactor phình sang entity khác | Thấp | Phạm vi cứng: chỉ contacts. File companies/deals/tasks/notes xuất hiện trong diff = vượt phạm vi. |

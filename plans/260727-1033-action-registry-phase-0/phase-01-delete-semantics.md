---
phase: 1
title: "Delete semantics data-integrity fix"
status: completed
priority: P1
effort: "S"
dependencies: []
---

# Phase 1: Delete semantics data-integrity fix

<!-- Updated: Validation Session 1 — tách khỏi Phase 1 cũ; đây là bug toàn vẹn dữ
     liệu, ship và revert được độc lập với công việc parity ở Phase 2. -->

## Overview

`deleteContact` và `deleteCompany` qua **GraphQL** không dọn dữ liệu liên quan.
REST và MCP đều dọn. Hậu quả là orphan rows và **tham chiếu chết**.

Phase này **chỉ** sửa ngữ nghĩa delete. Không đụng workflow event, không đụng
`logActivity`, không refactor. Ship được ngay, revert được một mình.

## Bug (đo thật trên `main`)

| Việc phải làm khi xoá | REST | MCP | GraphQL |
|---|---|---|---|
| **contact:** xoá notes + activities | ✅ `contacts/[id]/route.ts:82-84` | ✅ `tools.ts:381-382` | **❌** `schema.ts:441` |
| **company:** detach `contacts.companyId = null` | ✅ `companies/[id]/route.ts:71-73` | ✅ `tools.ts:453` | **❌** |
| **company:** detach `deals.companyId = null` | ✅ `companies/[id]/route.ts:74` | ✅ `tools.ts:454` | **❌** |
| **company:** xoá notes + activities | ✅ `companies/[id]/route.ts:75-76` | ✅ `tools.ts:455-456` | **❌** `schema.ts:497` |

**Ca company nặng hơn ca contact:** xoá company qua GraphQL để lại contacts và
deals trỏ tới một `companyId` không còn tồn tại. UI đọc quan hệ đó sẽ thấy
dữ liệu rỗng hoặc lỗi.

**Không sửa được ở tầng DB.** `notes` và `activities` là quan hệ **đa hình**
(`entityType` + `entityId`, `src/db/schema.ts:279` và `:293`) — Postgres không
đặt được FK trên khoá đa hình, nên `ON DELETE CASCADE` không phải lựa chọn.
Cascade ở tầng ứng dụng là cách duy nhất. Hiện nó đang được viết tay **6 lần**
(3 entity × 2 surface) — chính xác là căn bệnh mà ADR-017 chữa, nhưng Phase này
phải sửa tay vì kernel chưa tồn tại.

**Không sửa `deleteDeal` qua GraphQL** — không có mutation đó (backlog #10).

## Requirements

**Functional**
- GraphQL `deleteContact` xoá notes + activities của contact, khớp REST/MCP.
- GraphQL `deleteCompany` detach `contacts.companyId`, detach `deals.companyId`,
  xoá notes + activities — khớp REST/MCP.
- **Giữ `return false` khi not-found** (quyết định validate session 1). Đây là
  idiom GraphQL, khác biệt **chủ đích** với 404 của REST và throw của MCP. Ghi
  thành hợp đồng + test pin lại để kernel ở Phase 3-4 không "sửa" nhầm thành
  đồng nhất.

**Non-functional**
- Không đổi SDL GraphQL — chỉ đổi thân resolver.
- Không đổi REST và MCP; chúng là chuẩn tham chiếu.
- Không thêm dependency.

## Architecture

Không đổi kiến trúc. Sao đúng thứ tự thao tác của REST sang resolver GraphQL.

**Thứ tự (theo `companies/[id]/route.ts:69-76`):** xoá bản ghi chính → detach
con → xoá notes → xoá activities → audit. Giữ đúng thứ tự này, đừng "cải tiến" —
Phase 2 mới là chỗ bàn chuẩn hoá thứ tự.

**Cảnh báo về mệnh đề `where` cascade:** cả REST lẫn MCP xoá notes/activities
**chỉ theo `entityId`**, không lọc `entityType`. An toàn vì `newId()` sinh id duy
nhất toàn cục, nhưng nó là ràng buộc ngầm. Sao y nguyên hành vi hiện tại — **không**
tự thêm bộ lọc `entityType` trong phase này (sẽ là đổi hành vi lén). Nếu thấy đáng
sửa, mở việc riêng.

## Related Code Files

**Modify**
- `src/lib/graphql/schema.ts` — `deleteContact` (~434), `deleteCompany` (~490)
- `CHANGELOG.md` — ghi bug fix (xem bước 5)

**Create**
- `tests/delete-semantics.test.ts` — hoặc gộp vào file test GraphQL có sẵn nếu
  khớp cấu trúc hơn; đọc `tests/graphql.test.ts` rồi quyết.

**Không đụng**
- `src/app/api/**`, `src/mcp/tools.ts` — chuẩn tham chiếu
- `src/db/schema.ts` — không migration, FK bất khả thi trên khoá đa hình

## Implementation Steps

1. **Kiểm chứng lại bảng bug** trước khi sửa:
   ```bash
   grep -n "db.delete\|db.update" src/app/api/companies/\[id\]/route.ts src/app/api/contacts/\[id\]/route.ts
   grep -n "deleteContact\|deleteCompany" -A14 src/lib/graphql/schema.ts
   ```
   Khác bảng trên → dừng, báo.

2. **Viết test đỏ trước.** Với mỗi surface (REST / MCP / GraphQL):
   - tạo contact + 2 notes + 2 activities → xoá → khẳng định notes/activities = 0
   - tạo company + contact + deal gắn vào nó → xoá company → khẳng định
     `contacts.companyId IS NULL` và `deals.companyId IS NULL`, notes/activities = 0
   - not-found: REST → 404, MCP → throw, GraphQL → `false` (**khác biệt chủ đích**,
     assert riêng từng surface, đừng viết chung một kỳ vọng)
   Chạy → **chỉ các case GraphQL đỏ**. Case REST/MCP đỏ = giả định sai, dừng và báo.

3. **Sửa `deleteContact`** trong `schema.ts`: thêm xoá notes + activities theo mẫu
   `contacts/[id]/route.ts:82-84`.

4. **Sửa `deleteCompany`**: thêm detach contacts + detach deals + xoá notes +
   activities theo mẫu `companies/[id]/route.ts:71-76`.

5. **`CHANGELOG.md`**, viết cho người vận hành:
   > **Sửa lỗi:** xoá contact hoặc company qua GraphQL API giờ dọn cả notes và
   > activities liên quan, và detach contacts/deals khỏi company bị xoá — đúng
   > như REST API và MCP đã làm. Trước đây đường GraphQL để lại orphan rows và
   > contacts/deals trỏ tới company không còn tồn tại. Dữ liệu mồ côi có sẵn
   > **không** được dọn tự động; xem ghi chú bên dưới nếu bạn từng xoá qua GraphQL.

6. **Ghi chú dữ liệu đã hỏng sẵn.** Phase này chỉ chặn bug tái diễn, **không**
   dọn hàng có sẵn. Đưa vào CHANGELOG một truy vấn chẩn đoán để người tự host tự
   kiểm (đếm notes/activities trỏ tới entity đã chết, và contacts/deals trỏ tới
   companyId đã chết). **Không tự động chạy dọn dẹp** — xoá dữ liệu không xin
   phép là việc không được làm.

7. Chạy toàn bộ suite + `npx tsc --noEmit`.

## Tests / Validation

```bash
npm run test -- tests/delete-semantics.test.ts   # GraphQL đỏ ở bước 2, xanh ở bước 4
npm run test
npx tsc --noEmit
```

Cần Postgres test (`npm run db:e2e:setup`).

## Success Criteria

- [ ] Bảng bug được kiểm chứng lại trước khi sửa
- [ ] Test đỏ trước; **chỉ** case GraphQL đỏ
- [ ] GraphQL `deleteContact` dọn notes + activities
- [ ] GraphQL `deleteCompany` detach contacts + deals, dọn notes + activities
- [ ] `return false` khi not-found **được giữ** và pin bằng test như khác biệt chủ đích
- [ ] SDL GraphQL không đổi
- [ ] `CHANGELOG.md` có mục sửa lỗi + truy vấn chẩn đoán dữ liệu đã hỏng
- [ ] Không tự động dọn dữ liệu có sẵn
- [ ] Commit **tách biệt**, revert được độc lập với Phase 2
- [ ] Toàn bộ suite xanh, `tsc --noEmit` xanh, không thêm dependency

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Cascade mới xoá nhầm dữ liệu người dùng | **Cao** | Sao đúng mệnh đề `where` của REST/MCP, không phát minh. Test đếm chính xác số dòng bị xoá. Chạy trên DB test trước. |
| Ai đó đang **dựa vào** việc GraphQL không cascade | Thấp | Khó gọi là tính năng khi kết quả là tham chiếu chết. Vẫn ghi CHANGELOG rõ ràng. |
| Cám dỗ "dọn luôn dữ liệu hỏng có sẵn" | Trung bình | Cấm dứt khoát ở bước 6. Chỉ cung cấp truy vấn chẩn đoán. Xoá dữ liệu là quyết định của người vận hành. |
| Thêm bộ lọc `entityType` nhân tiện | Trung bình | Cấm dứt khoát ở §Architecture. Đó là đổi hành vi lén, thuộc việc khác. |
| Phạm vi phình sang deals | Thấp | GraphQL không có `deleteDeal`. Ranh giới rõ. |

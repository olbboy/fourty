---
title: "Phase 1: Export an toàn và đúng quyền"
status: todo
priority: P1
effort: "2-3 ngày kỹ sư (ước lượng)"
owner: "Backend/security"
depends_on: []
---

# Phase 1: Export an toàn và đúng quyền

## Mục tiêu

Khóa seam rủi ro cao nhất trước UI: export vẫn tenant-scoped qua RLS, đồng thời kiểm object permission, field policy, scope và spreadsheet safety. Không đổi raw CSV contract hay schema.

## Bối cảnh đã kiểm chứng

- Export đọc thẳng row và gọi `toCsv`, chưa `authorize`/load policy: [route.ts](~/.codex/worktrees/0747/fourty/src/app/api/export/[entity]/route.ts:5).
- `withAuth` chỉ auth/rate-limit/RLS context: [api.ts](~/.codex/worktrees/0747/fourty/src/lib/api.ts:91), [api.ts](~/.codex/worktrees/0747/fourty/src/lib/api.ts:112).
- Field bị cấm đọc phải bị xóa: [field-permissions.ts](~/.codex/worktrees/0747/fourty/src/lib/field-permissions.ts:36).
- `toCsv` là RFC-4180 raw serializer: [csv.ts](~/.codex/worktrees/0747/fourty/src/lib/csv.ts:68).

## File ownership

| Hành động | Đường dẫn tuyệt đối | Trách nhiệm |
|---|---|---|
| Modify | `~/.codex/worktrees/0747/fourty/src/lib/csv.ts` | Thêm API spreadsheet-safe riêng; giữ `toCsv` mặc định |
| Modify | `~/.codex/worktrees/0747/fourty/src/lib/field-permissions.ts` | Helper kiểm field có được đọc để query/export không tạo oracle |
| Create | `~/.codex/worktrees/0747/fourty/src/lib/company-query.ts` | Normalize allowlist q/industry/sort/page và tạo predicate/order dùng chung list/export |
| Modify | `~/.codex/worktrees/0747/fourty/src/app/api/export/[entity]/route.ts` | Object auth, policy, scope, RLS query, safe response |
| Modify | `~/.codex/worktrees/0747/fourty/tests/csv.test.ts` | Raw regression + formula/BOM/numeric tests |
| Create | `~/.codex/worktrees/0747/fourty/tests/export.test.ts` | Integration thật Postgres cho permission/scope/RLS |

Không phase nào khác sửa các file này; Phase 2 chỉ gọi helper đã ổn định.

## Contract cần triển khai

- URL cũ `/api/export/:entity` giữ nghĩa `scope=all` để tương thích. Contacts/deals tiếp tục chỉ hỗ trợ all; `filtered|selected` trên hai entity này trả 400 rõ ràng trong scope Companies-first.
- Riêng Companies nhận `scope=all|filtered|selected`. `selected` yêu cầu tối đa 500 ID unique từ trang hiện tại; ID ngoài workspace không xuất hiện. `filtered` dùng đúng allowlist q/industry/sort của Companies nhưng không áp page/offset. `all` bỏ filters.
- Với Companies, `q` chỉ tìm trong các field readable; `industry`/sort theo field bị ẩn trả 403 thay vì tiết lộ count/thứ tự. Cùng rule áp cho metadata Phase 2.
- Sau khi validate entity, gọi cả `authorize(auth, "export", "read")` và `authorize(auth, entity, "read")`; viewer vẫn được export khi cả hai gate cho phép, nhưng chỉ các field readable trong workspace của API key/session. Không tạo permission matrix giả để chứng minh một quyền phân tách mà sản phẩm hiện chưa có.
- Tạo headers sau khi áp policy, không serialize field hidden thành ô rỗng. Cấm profile/owner/custom nhạy ngoài allowlist.
- Spreadsheet-oriented serializer thêm UTF-8 BOM, quote/escape đúng RFC và prefix apostrophe cho **string** có prefix công thức/ngắt dòng (bao gồm `= + - @`, tab, CR, LF, biến thể full-width; kiểm cả sau leading whitespace). Number `-12` vẫn là numeric text `-12`. Raw `toCsv` không đổi để parse/round-trip cũ không vỡ. Không xem regex của demo là một bảo đảm cho mọi spreadsheet; [OWASP](https://community.owasp.org/attacks/CSV_Injection) lưu ý khác biệt giữa ứng dụng và thao tác lưu/mở lại. Docs phải ghi giới hạn này, và acceptance chỉ áp cho output/luồng nhập được kiểm chứng.
- Lỗi validate/auth/query trả JSON lỗi, không trả file CSV có vẻ thành công.

## Trình tự test-first

1. Viết test thất bại cho `toCsv` raw giữ nguyên; safe mode xử lý formula/BOM/tab/CR/LF/full-width/leading whitespace, dấu phân cách và quote chèn giữa chuỗi; `-12` number không bị apostrophe. Không dùng test serialize đơn thuần để tuyên bố an toàn mọi phiên bản Excel/Sheets.
2. Viết integration test real-PG: viewer/API key đúng workspace; hidden field biến mất khỏi header; selected/filtered/all; selected ID cross-workspace bị bỏ; filter/sort hidden bị từ chối.
3. Thêm helper query/policy nhỏ rồi đổi export route; không nhân bản predicate Companies giữa export và list.
4. Chạy test hẹp, sau đó regression auth/tenant/field policy; giữ test matrix thật admin/member/viewer/API-key và auth bị từ chối, cùng kiểm tra source guard cho cả hai authorization calls. Role CRM hiện đều có quyền đọc; không ghi là đã thử cấu hình tách export/entity vốn chưa tồn tại.

## Acceptance

- [x] Output trung hòa các prefix công thức trong test matrix; kiểm tra nhập lần đầu bằng spreadsheet được chọn và ghi phiên bản/kết quả. Không hứa bảo vệ mọi thao tác lưu/mở lại; raw serializer/import round-trip giữ nguyên.
- [x] Field hidden không có header/cell, không làm filter/sort/count oracle; số âm thật không bị đổi nghĩa.
- [x] Ba scope có semantics đo được và URL legacy vẫn export toàn workspace hiện hành.
- [x] API key không thể vượt workspace; cả export/read và entity/read được gate; viewer hợp lệ không bị chặn blanket, request không hợp lệ/không còn membership bị từ chối.

## Lệnh xác minh khi triển khai

```bash
npm test -- tests/csv.test.ts tests/export.test.ts
npm test -- tests/field-permissions.test.ts tests/tenant-isolation.test.ts tests/rbac-matrix.test.ts
```

`node_modules` chưa có khi lập plan; các lệnh trên là gate phải chạy sau setup, không phải test đã chạy.

## Rủi ro và rollback

| Rủi ro | Khả năng × tác động | Mitigation |
|---|---|---|
| Consumer dựa vào header field bị cấm | Medium × High | Đây là sửa security; test admin đầy đủ và role restricted, ghi rõ contract |
| Query filtered lệch list | Medium × High | Một helper dùng chung, contract test cho cùng URL params |
| CSV escaping làm sai số âm | Medium × High | Phân biệt kiểu number/string bằng test |
| Export all lớn tốn bộ nhớ (route hiện chưa có row cap) | Medium × High | Đo heap/latency trên fixture lớn; nếu cần streaming/cap thì dừng và replan contract, không lén đổi semantics hoặc thêm dependency |

Tách security/serializer commit khỏi scope/query commit. Khi rollback giữ auth, entity gate, field mask và CSV protection; có thể tắt export tạm thời nếu không giữ được đường đi an toàn, tuyệt đối không restore route raw bị lộ field. Chỉ revert phần query/scope có lỗi. Không migration/data cleanup.

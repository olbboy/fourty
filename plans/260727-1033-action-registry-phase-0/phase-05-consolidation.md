---
phase: 5
title: "Consolidation"
status: pending
priority: P2
effort: "S"
dependencies: [4]
---

# Phase 5: Consolidation

## Overview

Xoá code chết, biến parity harness thành cổng chặn trôi dạt vĩnh viễn, cập nhật
tài liệu bằng **số đo thật** chứ không phải kỳ vọng, và quyết định có cam kết
Phase 1+ của ADR-017 hay không.

Phase này là chỗ plan trả lời câu hỏi thật: *pattern này có đáng nhân rộng cho 57
route còn lại không?* Trả lời bằng dữ liệu từ Phase 4, không bằng niềm tin.

## Requirements

**Functional**
- Xoá đường code cũ của contacts còn sót lại sau strangler (handler cũ, resolver
  cũ, tool handler cũ) — sau khi xác nhận không còn ai gọi.
- Mở rộng `tests/surface-parity.test.ts` thành cổng chặn:
  - khẳng định mọi action trong registry, nếu khai `expose` cho surface nào, thì
    surface đó phải thực sự phục vụ nó
  - khẳng định contacts ops trên 3 surface cho cùng tập event, cùng audit key,
    cùng activity type
- Cập nhật tài liệu bằng số đo thật.

**Non-functional**
- Không thêm hành vi mới. Phase này chỉ xoá và ghi chép.

## Architecture

Không đổi. Chỉ dọn dẹp.

**Cổng chặn trôi dạt** là artifact dài hạn quan trọng nhất của cả plan. Không có
nó, entity tiếp theo sẽ lại trôi dạt đúng như cũ:

```ts
// tests/surface-parity.test.ts — phần thêm ở Phase 5
it("mọi action đã đăng ký đều được phục vụ trên surface nó khai báo", () => {
  for (const action of registry.list()) {
    if (action.expose?.rest)    expect(restRoutes).toContain(action.name);
    if (action.expose?.graphql) expect(gqlFields).toContain(action.name);
    if (action.expose?.mcp)     expect(mcpToolNames).toContain(action.name);
  }
});
```

## Related Code Files

**Modify**
- `src/mcp/tools.ts` — xoá handler contact cũ đã chết
- `src/lib/graphql/schema.ts` — xoá resolver contact cũ đã chết
- `tests/surface-parity.test.ts` — thêm cổng chặn coverage
- `docs/adr/017-action-registry.md` — `Proposed` → `Accepted` + số đo thật
- `docs/adr/README.md` — cập nhật status ADR-017
- `CHANGELOG.md` — chỉ bổ sung nếu Phase 4 đổi thông điệp lỗi field-permission
  (Phase 4 bước 2b). **Behavior change chính đã được ghi ở Phase 1-2**, không phải
  ở đây (red-team #4).
- `plans/260708-1645-remaining-features-backlog.md` — ghi chú mục #10 (GraphQL
  mutations deals/tasks/notes) giờ đã có đường đi rõ ràng qua registry
- `docs/architecture.md` — thêm mục Action Registry nếu file có mô tả tầng API

**Cân nhắc, không bắt buộc**
- `CLAIMS.md` — chỉ thêm claim "một định nghĩa, mọi surface" **nếu** cổng chặn
  coverage thật sự phủ được nó. Contacts một mình chưa đủ để tuyên bố toàn cục.
  Nếu chưa đủ → **không thêm**. Đúng kỷ luật anti-vanity của repo.

## Implementation Steps

1. **Tìm code chết:**
   ```bash
   grep -rn "requireRole\|requireWritableFields" src/mcp/tools.ts | head
   npx tsc --noEmit    # unused export không bị bắt, phải rà tay
   ```
   Xoá handler contact cũ. Giữ helper còn dùng cho entity chưa migrate.

2. **Thêm cổng chặn coverage** vào `tests/surface-parity.test.ts`. Kiểm nó thật
   sự bắt lỗi: tạm bỏ một tool contact khỏi MCP → test phải đỏ → khôi phục.
   Cổng chặn không được kiểm chứng là cổng chặn giả.

3. **Thu số đo thật:**
   ```bash
   wc -l src/mcp/tools.ts src/lib/graphql/schema.ts src/app/api/contacts/route.ts \
         src/app/api/contacts/\[id\]/route.ts src/lib/actions/**/*.ts
   grep -c "db\." src/mcp/tools.ts
   npm run test 2>&1 | tail -5
   ```

4. **Cập nhật ADR-017** → `Accepted`. Thêm mục "Kết quả đo được" gồm: LOC
   trước/sau, số lời gọi `db.*` còn lại, số test, và **đánh giá thẳng thắn**
   pattern có đáng nhân rộng không. Nếu chi phí cao hơn dự kiến — ghi đúng như
   vậy. ADR ghi cái đã xảy ra, không ghi cái đã hy vọng.

5. **Ghi ba hạn chế đã biết vào ADR-017** — không để claim của ADR đứng trần:
   - **`object` không được ràng buộc với bảng `run()` đụng** (red-team #10). Claim
     *"AI path không thể bypass RBAC"* đúng vì không còn đường thứ hai, nhưng vẫn
     phụ thuộc mỗi action khai `object` trung thực. Ghi kèm đề xuất mitigation cho
     ADR-017 Phase 1: test proxy `db` ghi lại bảng bị truy cập.
   - **Không nguyên tử giữa transaction và enqueue** (red-team #14): `boss.send()`
     commit ngoài transaction request; effect sau đó throw thì workflow vẫn chạy
     cho entity đã rollback. Kế thừa nguyên trạng, không tệ hơn. Outbox pattern
     ngoài phạm vi.
   - **Không có ràng buộc chống đệ quy workflow** (red-team #5): hiện an toàn chỉ
     vì `runAction()` không tạo/sửa record — **tình cờ, không phải enforce**. Bất
     kỳ `WorkflowAction` mới nào ghi dữ liệu đều phải xét lại.

6. **Cập nhật `CHANGELOG.md`** chỉ khi Phase 4 đổi thông điệp lỗi
   field-permission. Behavior change chính đã ghi ở Phase 1-2.

7. **Ghi thủ tục rollback vào commit message của phase này** (red-team #6): sau
   khi Phase 5 xoá code cũ, revert đòi hỏi revert Phase 5 **rồi mới** Phase 4.

8. **Cập nhật backlog + `docs/adr/README.md`.**

9. **Quyết định cuối** — dựa trên số đo, trả lời trong ADR: cam kết Phase 1 của
   ADR-017 (companies + deals) hay dừng? Đây là output thật của plan.

## Tests / Validation

```bash
npm run test
npm run test:e2e
npx tsc --noEmit
npm run build
git diff --stat package.json     # phải rỗng
```

Kiểm tài liệu: mọi số trong ADR-017 phải tái tạo được bằng lệnh ở bước 3.

## Success Criteria

- [ ] Code contact cũ đã chết được xoá; entity chưa migrate không bị ảnh hưởng
- [ ] Cổng chặn coverage tồn tại **và đã được kiểm chứng là bắt được lỗi**
- [ ] ADR-017 = `Accepted`, chứa số đo thật tái tạo được
- [ ] ADR-017 ghi đủ **ba hạn chế đã biết** (object/run, non-atomicity, đệ quy)
- [ ] `docs/adr/README.md` cập nhật
- [ ] Thủ tục rollback hai-commit nằm trong commit message của phase này
- [ ] Backlog #10 được ghi chú
- [ ] `CLAIMS.md` chỉ thêm claim nếu test chống lưng được — nếu không, ghi lý do
- [ ] Full suite + e2e + build xanh
- [ ] ADR ghi rõ quyết định: tiếp Phase 1 ADR-017 hay dừng

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Xoá nhầm helper còn dùng cho entity chưa migrate | Trung bình | `tsc --noEmit` + full suite sau mỗi lần xoá. Xoá từng phần, không một phát. |
| Cổng chặn coverage là giả (luôn xanh) | Trung bình | Bước 2 bắt buộc kiểm chứng bằng cách cố ý làm đỏ. |
| Tô hồng số liệu trong ADR | Trung bình | Mọi số phải kèm lệnh tái tạo. Chi phí cao hơn dự kiến thì ghi đúng vậy — ADR để quyết định, không để bán hàng. |
| Người tự host bất ngờ vì workflow đột nhiên chạy | **Cao** | Mục CHANGELOG là biện pháp giảm thiểu chính. Viết cho người vận hành, không cho lập trình viên. |
| Overclaim trong CLAIMS.md | Trung bình | Contacts một mình không chống lưng được claim toàn cục. Mặc định **không thêm**. |

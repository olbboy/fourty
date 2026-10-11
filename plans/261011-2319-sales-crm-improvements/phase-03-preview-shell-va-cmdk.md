---
title: "Phase 3: Preview, shell và CmdK"
status: todo
priority: P2
effort: "2-3 ngày kỹ sư (ước lượng)"
owner: "Frontend/platform"
depends_on: [2]
---

# Phase 3: Preview, shell và CmdK

## Mục tiêu

Cho phép xem nhanh công ty mà giữ list state, hoàn thiện mobile/keyboard shell và làm CmdK giàu ngữ cảnh bằng metadata đã qua policy. Mọi thay đổi là presentation/read-only, không tạo nguồn dữ liệu hay mutation thứ hai.

## Bối cảnh đã kiểm chứng

- Detail GET đã RLS-scoped và redact, cross-workspace ID thành 404: [route.ts](~/.codex/worktrees/0747/fourty/src/app/api/companies/[id]/route.ts:11).
- Modal có dialog label/Escape nhưng cần focus trap chuẩn hóa: [ui.tsx](~/.codex/worktrees/0747/fourty/src/components/ui.tsx:27).
- Mobile nav chưa có Companies và sidebar desktop cố định: [shell.tsx](~/.codex/worktrees/0747/fourty/src/components/shell.tsx:25).
- Search hiện trả title/subtitle nhưng chưa field policy: [route.ts](~/.codex/worktrees/0747/fourty/src/app/api/search/route.ts:5).

## File ownership

| Hành động | Đường dẫn tuyệt đối | Trách nhiệm |
|---|---|---|
| Modify | `~/.codex/worktrees/0747/fourty/src/components/ui.tsx` | Focus trap/restore dùng chung và drawer primitive tối thiểu |
| Create | `~/.codex/worktrees/0747/fourty/src/components/company-preview.tsx` | Read-only preview state machine + full-detail link |
| Modify | `~/.codex/worktrees/0747/fourty/src/app/(app)/companies/companies-client.tsx` | Gắn preview vào row mà giữ URL/list state |
| Modify | `~/.codex/worktrees/0747/fourty/src/components/shell.tsx` | Mobile Companies, sidebar resize |
| Modify | `~/.codex/worktrees/0747/fourty/src/app/api/search/route.ts` | Policy-aware result/metadata |
| Modify | `~/.codex/worktrees/0747/fourty/src/components/command-palette.tsx` | Grouping/badges/keyboard từ response an toàn |
| Modify | `~/.codex/worktrees/0747/fourty/src/app/globals.css` | Semantic state tokens/classes, reduced motion; không rebrand |
| Modify | `~/.codex/worktrees/0747/fourty/src/lib/i18n/locales/en.ts` | Copy cho surfaces mới |
| Modify | `~/.codex/worktrees/0747/fourty/src/lib/i18n/locales/vi.ts` | Copy tương ứng tiếng Việt |
| Modify | `~/.codex/worktrees/0747/fourty/tests/a11y.test.ts` | Names/markup và mobile/sidebar semantics; hành vi focus kiểm bằng browser Phase 4 |
| Modify | `~/.codex/worktrees/0747/fourty/tests/i18n.test.ts` | Catalog parity cho copy mới |
| Create | `~/.codex/worktrees/0747/fourty/tests/search.test.ts` | Real-PG search field policy/RLS |

Phase này là ngoại lệ ownership có chủ đích với `companies-client.tsx`: bắt đầu sau Phase 2 và chỉ tích hợp preview trên contract list đã hoàn tất; không chạy song song.

## Thiết kế preview

- Row action khi id readable đặt `preview=<id>` trong URL: mở từ list dùng push, đổi record đang preview dùng replace; Escape/close quay về list URL giữ q/filter/sort/page và không điều hướng ra ngoài Companies nếu vào bằng deep link. Back/forward khôi phục state tương ứng. List query key loại trừ `preview`, nên mở panel không làm reset selection hoặc refetch list. Không dùng cache list để khôi phục field đã redact.
- State: closed -> loading(id) -> ready | 404/forbidden | retryable-error -> closed. Đổi id/đóng abort request cũ; response cũ không commit.
- Drawer read-only dùng DTO đọc partial Phase 2 và field từ `GET /api/companies/:id`; field absent render omitted/“—”, không zero giả. Không dựng lại id/name/updatedAt từ cache. Link “Xem chi tiết đầy đủ” dùng id được phép ở response; edit/delete vẫn ở detail hiện hành.
- Dialog/drawer giữ focus bên trong, Escape đóng, restore đúng trigger; khi trigger biến mất do page/filter đổi, focus về heading/list container hợp lệ.
- Query/workspace đổi clear preview để ID cũ không được tái dùng. API cross-workspace vẫn là 404, không phân biệt tồn tại/forbidden.

## Shell, CmdK và token

- Mobile navigation có đường trực tiếp tới Companies trong giới hạn layout; aria-current và safe-area giữ nguyên.
- Sidebar width là UI preference duy nhất trong localStorage. Default 224px giữ hiện trạng; clamp 224-360px, pointer capture, ArrowLeft/Right từng 8px, Home/End và reset. **Một CSS variable** điều khiển cả aside width và desktop main margin; mobile main margin bằng 0. Không lưu workspace/record/permission.
- `/api/search` load policy cho contacts/companies/deals trước query. Predicate allowlist: contacts chỉ firstName/lastName/email readable (chỉ nối full name khi cả hai được đọc); companies chỉ name/domain readable; deals chỉ name readable. Không có field searchable thì skip entity, không query toàn bảng. Field hidden không được dùng trong WHERE dù đã mask output.
- Projection kiểm từng thành phần: contact title chỉ ghép name parts readable, subtitle email rồi jobTitle readable; company title name readable, subtitle domain rồi industry readable; deal title name, subtitle amount+currency chỉ khi cả hai readable. Bỏ result nếu id bị ẩn hoặc không có title hợp lệ. Không trả owner/profile; workspace vẫn do RLS.
- Rich CmdK giữ response `{results}` và các key cũ; optional metadata là additive, allowlist theo type. Test chứng minh hidden company name/domain và deal amount không rò qua title/subtitle/metadata.
- Chỉ thêm semantic tokens cho focus/error/selected/panel và reduced-motion trên surfaces chạm; giữ palette/brand Fourty, không copy theme/assets của source.

## Trình tự test-first

1. Thêm failing tests markup cho names/catalog parity và integration search restricted fields/cross-workspace. Hidden-field-only query phải không trả result, kèm visible-field control cho mỗi entity; kiểm composite/fallback riêng. `tests/a11y.test.ts` hiện dùng SSR/source scan, không chứng minh focus loop; browser tests Phase 4 phải viết trước khi coi trap/restore hoàn tất.
2. Harden primitive và search route trước; sau đó xây preview/CmdK để chỉ dùng contract đã bảo vệ.
3. Tích hợp preview vào list, rồi mobile nav/sidebar; kiểm tra keyboard, pointer và localStorage malformed/clamp.
4. Chạy unit/integration hẹp; Phase 4 thêm browser journeys trên app thật.

## Acceptance

- [x] Mở/đóng/đổi preview không mất list query/page/selection hợp lệ; stale fetch không hiện sai record.
- [x] Cross-workspace/unknown preview ID là 404; focus trap/restore và Escape qua test.
- [x] CmdK không rò title/subtitle/amount/domain/metadata hoặc membership qua search predicate bị ẩn; result có id/title readable vẫn điều hướng được.
- [x] Companies reachable trên mobile; sidebar resize keyboard/pointer được, clamp đúng và chỉ persist width.
- [x] EN/VI có đủ key cho surfaces chạm; semantic tokens giữ nhận diện hiện tại.

## Lệnh xác minh khi triển khai

```bash
npm test -- tests/a11y.test.ts tests/i18n.test.ts tests/search.test.ts
npm test -- tests/field-permissions.test.ts tests/tenant-isolation.test.ts
```

## Rủi ro và rollback

| Rủi ro | Khả năng × tác động | Mitigation |
|---|---|---|
| Hai dialog cùng trap focus | Medium × High | Một stack/primitive dùng chung; test nested/close order |
| Search metadata trở thành side channel | Medium × Critical | Server allowlist + policy; bỏ result khi title không readable |
| localStorage malformed làm shell vỡ | Medium × Medium | Parse finite number, clamp, fallback default |
| Preview làm URL/back khó đoán | Medium × Medium | Test back/forward và giữ full route rõ ràng |

Rollback theo thứ tự CmdK/preview/shell rồi primitive, giữ search-policy commit độc lập. Nếu search không thể phục vụ an toàn thì tạm vô hiệu endpoint, không khôi phục predicate/projection bị lộ field. localStorage width cũ có thể bỏ qua; không có DB/schema rollback.

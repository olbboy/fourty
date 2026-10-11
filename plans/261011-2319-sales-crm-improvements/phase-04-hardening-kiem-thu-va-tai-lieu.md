---
title: "Phase 4: Hardening, kiểm thử và tài liệu"
status: todo
priority: P1
effort: "1-2 ngày kỹ sư (ước lượng)"
owner: "QA/docs"
depends_on: [1, 2, 3]
---

# Phase 4: Hardening, kiểm thử và tài liệu

## Mục tiêu

Chứng minh toàn bộ journey trên browser và real Postgres, cập nhật đúng owning docs, rồi chốt release/rollback. Phase này không mở rộng scope và không sửa schema.

## File ownership

| Hành động | Đường dẫn tuyệt đối | Trách nhiệm |
|---|---|---|
| Create | `~/.codex/worktrees/0747/fourty/e2e/companies.spec.ts` | Companies query/selection/export/preview/mobile/race/a11y journeys |
| Modify | `~/.codex/worktrees/0747/fourty/e2e/command-palette.spec.ts` | Rich metadata, restricted results, keyboard/focus |
| Create | `~/.codex/worktrees/0747/fourty/e2e/helpers/restricted-session.ts` | Fixture user/member/field policy thật trong DB E2E và session đăng nhập riêng |
| Modify | `~/.codex/worktrees/0747/fourty/e2e/auth.setup.ts` | Sau admin wizard, seed restricted fixture và lưu storage state riêng dưới e2e/.auth |
| Modify | `~/.codex/worktrees/0747/fourty/docs/guides/import-export.md` | Scope, safe CSV, permissions và API examples |
| Modify | `~/.codex/worktrees/0747/fourty/docs/guides/records.md` | Companies filters/page/preview/mobile behavior |

Không sửa lại source của Phase 1-3 trừ khi test tìm thấy regression; khi đó trả fix về owner/phase tương ứng và chạy lại gate, không vá logic trong test.

## Ma trận kiểm thử

| Lớp | Scenarios bắt buộc | Gate |
|---|---|---|
| Unit | raw/safe CSV, numeric negative, query normalize, i18n parity, a11y markup | Test hẹp Phase 1/3; focus hành vi ở browser |
| Real-PG integration | export role/API-key/RLS/field policy; company total/facet/sort/page; search masking; preview 404 cross-workspace | Test files Phase 1-3 |
| Browser desktop | q/industry/sort/saved view/page; select current page; 3 export scopes; error/retry; preview -> full detail -> back | `companies.spec.ts` |
| Browser race | Delay response A, issue query B, resolve A sau; UI chỉ hiện B; đổi query/page clear selected/preview | `companies.spec.ts` |
| Browser a11y | Tab/Shift+Tab trap, Escape, focus restore, semantic row/checkbox, sidebar keyboard clamp và aside/main không overlap/gap | `companies.spec.ts` |
| Browser mobile | Companies reachable, filters apply/reset, table/toolbar usable ở viewport nhỏ | `companies.spec.ts` |
| Regression | Auth, tenant isolation, RBAC, field permissions, saved views, existing CmdK, full build | Existing suites |

## Trình tự thực hiện

1. Trước test có reset/mutation: kiểm cả DATABASE_URL và MIGRATE_DATABASE_URL trỏ đúng cùng DB test chuyên dụng (runtime role khác owner role), tạo backup theo quy tắc dự án. `tests/pg-setup.ts` migrate rồi TRUNCATE; không dùng DSN dev/prod hoặc in credentials. Vitest dùng fourty_test, E2E dùng fourty_e2e; chạy tuần tự.
2. Kiểm port 3100 và owner process trước E2E. Release gate đặt `CI=1` để `reuseExistingServer` bị tắt, bắt buộc build + reset + boot từ code hiện tại; port do người dùng/session khác giữ thì dừng, không kill hoặc đổi port. Theo dõi và dừng process do mình khởi tạo sau test.
3. Viết browser specs theo acceptance trước khi coi UI hoàn tất; seed record thật trong DB E2E. Helper mới tạo user/membership bằng fixture DB giới hạn đúng fourty_e2e, hash password bằng helper auth hiện có, cấu hình field policy, rồi đăng nhập qua login thật để lưu restricted storage state riêng. Không giả lập session cookie. Admin storage state hiện tại không chứng minh masking vì admin bypass policy. Specs dùng context riêng cho restricted user và đóng context sau test; không đổi default admin project của smoke tests.
4. Chạy narrow commands từng phase. Nếu Postgres test fail vì môi trường, sửa setup; không skip/weakening assertion.
5. Chạy `npm test`, Playwright specs liên quan, `npm run lint`, rồi `npm run build`. Nếu lint lỗi do baseline/script/config, ghi lại nguyên nhân và trạng thái chưa qua, không bỏ qua hoặc tự tuyên bố gate xanh.
6. Đối chiếu network payload bằng restricted user thật: hidden fields absent, search không match riêng field hidden, total/facet không cross workspace, export content-disposition/CSV đúng, error không masquerade CSV. Kiểm id/name/updatedAt bị ẩn không phá table/selection/preview.
7. Cập nhật hai docs sau khi behavior đã qua gate; ghi rõ source attribution nếu implementation sao chép mã đáng kể, không copy asset.
8. Chuẩn bị rollback UI/query tách khỏi security baseline export/search; không tạo migration.

## Acceptance

- [x] Tất cả scenarios trong matrix có assertion quan sát được và qua trên real PostgreSQL/Chromium.
- [x] Cross-workspace preview/selected ID là 404/không xuất; field hidden không xuất hiện trong table, zero giả, facet, sort, search hoặc CSV.
- [x] Stale response, retry, no-data/no-results, focus trap/restore và selection reset được chứng minh trên browser.
- [x] Docs mô tả đúng contract đã ship, link source code/ADR thay vì copy chi tiết dễ stale.
- [x] `git diff -- drizzle src/db/schema.ts package.json package-lock.json` không có migration/dependency/schema ngoài scope.

## Lệnh xác minh khi triển khai

```bash
npm test -- tests/csv.test.ts tests/export.test.ts tests/companies-list.test.ts tests/search.test.ts tests/a11y.test.ts tests/i18n.test.ts tests/saved-views.test.ts tests/field-permissions.test.ts tests/tenant-isolation.test.ts tests/rbac-matrix.test.ts
CI=1 npm run test:e2e -- e2e/companies.spec.ts e2e/command-palette.spec.ts
npm test
npm run lint
npm run build
git diff --check
```

Không ghi “đã qua” trước khi executor chạy thật; tại thời điểm plan, `node_modules` chưa có.

## Rủi ro và rollback

| Rủi ro | Khả năng × tác động | Mitigation |
|---|---|---|
| E2E race/flaky do debounce/network | Medium × High | Route interception có barrier xác định; không dùng sleep tùy ý |
| Test source-level tạo an tâm giả | Medium × High | Browser + real handler/Postgres assertions cho invariants critical |
| Docs đi trước behavior | Low × Medium | Chỉ cập nhật sau gates, đối chiếu response thật |
| Rollback source nhưng docs còn mới | Low × Medium | Revert docs cùng phase/release commit |

Rollback Phase 4 là revert E2E/docs cùng UX chưa release; nếu gate phát hiện lỗi Phase 1-3, không release. Revert UI/query theo thứ tự phụ thuộc, giữ security fixes hoặc vô hiệu endpoint lỗi. Không khôi phục route export/search thiếu policy; không có schema rollback, nhưng test fixture/reset vẫn là ghi dữ liệu và cần backup đúng DB.

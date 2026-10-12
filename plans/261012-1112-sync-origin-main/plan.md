# Đồng bộ `origin/main` và ổn định sau merge

## Trạng thái

- Status: complete
- Branch: `codex/sales-crm-improvements`
- HEAD local trước merge: `8b27f8542cd055732fa6480196e363f4b06efb16`
- Remote target đã fetch lại: `origin/main` tại `631b033037b16e55d5193a1dc8b27e68c7df349d`

## Kết quả mong muốn

Branch hiện tại chứa đầy đủ lịch sử mới nhất của `origin/main`, giữ những hành vi còn giá trị từ ba commit local, dùng design-system contract mới của remote, và vượt qua toàn bộ quality gates của repository. Bản local review phải chạy từ kết quả đã đồng bộ.

## Ràng buộc

- Giải quyết conflict theo ý định và contract đã kiểm chứng; không chọn nguyên một phía theo máy móc.
- Giữ API, schema, RBAC và dữ liệu tương thích trừ khi remote đã chủ động thay đổi contract.
- Không sửa test chỉ để che regression.
- Không push, mở PR hoặc thay đổi dữ liệu thật trong phạm vi này.
- Dùng dependency và primitive đã được `origin/main` chọn; không duy trì hai design system song song.

## Ngoài phạm vi

- Thiết kế lại sản phẩm ngoài những hành vi có trong local hoặc remote.
- Dọn toàn bộ lịch sử branch hoặc squash ba commit local.
- Migration dữ liệu production.

## Facts

1. `origin/main` đi trước local `main` 117 commit và đã adopt shadcn/Base UI.
2. Branch hiện tại có ba commit behavior chưa tồn tại trên remote: `d721238`, `f8ccb90`, `677ba05`; commit `8b27f85` ghi kế hoạch đồng bộ.
3. 46 file đã thay đổi ở cả hai phía kể từ merge-base `24997d2`; rủi ro conflict ở UI, API, tests và docs là cao.
4. Hai remote feature branches còn tồn tại đều đã được merge hoàn toàn vào `origin/main`.
5. Dev server cũ đã được dừng trước khi đổi source.

## Kết quả

1. Đã merge toàn bộ lịch sử `origin/main` và resolve conflict theo contract của
   Next 16, shadcn/Base UI, action registry, API/RBAC và schema hiện tại.
2. Đã giữ các behavior local còn giá trị cho Companies, Deals, pipeline
   Settings, search/export và design system; primitive cũ trùng lặp và direct
   Radix dependencies đã được loại bỏ.
3. Pipeline stage dùng chung service invariant: stage mới luôn là `open` và
   đứng trước Won/Lost; type không thể đổi; terminal stage và open stage cuối
   cùng không thể xóa.
4. Đã sửa focus cho nested Company Preview/Command Palette, selector E2E theo
   shadcn sidebar, link thật cho record/deal, mobile touch target, pluralization
   và harness Next dev trên Node 24.
5. `origin/claude/codebase-review-audit-9b75d4` và
   `origin/fix/custom-object-field-retype-revalidation` đều là ancestor của
   `origin/main`; không còn remote branch nào thiếu khỏi target.

## Assumptions đã kiểm chứng

| Mức rủi ro | Giả định | Kết quả |
| --- | --- | --- |
| Cao | Các behavior CRM local chưa có trên remote vẫn có thể port qua interface mới | Đã port và kiểm chứng bằng unit/integration/E2E |
| Cao | Merge không làm mất contract shadcn/Base UI và action registry của remote | Typecheck, component/API tests và final review đều pass |
| Trung bình | Test database/E2E harness của remote chạy được trong máy local | Đã chạy trên PostgreSQL disposable được guard riêng |
| Thấp | Merge commit là hình thức lịch sử phù hợp cho branch hiện tại | Giữ cả hai parent và toàn bộ lịch sử local/remote |

## Thực hiện

1. Ghi nhận intent của ba commit local và contract tương đương trên remote.
2. Merge `origin/main`, phân loại và giải quyết từng conflict theo primary sources.
3. Cài dependency theo lockfile và chạy typecheck cùng focused tests để tạo feedback loop.
4. Sửa lỗi theo nguyên nhân, giữ seam sâu của remote và port behavior local qua interface đó.
5. Chạy full unit/integration, build, migration checks và E2E theo CI hiện tại.
6. Review diff/merge result, cập nhật tài liệu chịu ảnh hưởng, commit phần sửa còn lại.
7. Khởi động một server duy nhất ở port 3000 để review.

## Acceptance criteria

- Không còn unmerged path hoặc conflict marker.
- `origin/main` là ancestor của branch hiện tại.
- Ba commit local vẫn reachable và behavior được giữ hoặc được chứng minh đã có trên remote.
- Typecheck, tests, build và E2E được nêu trong CI đều pass; không ẩn lỗi.
- Không có design system thứ hai hoặc primitive trùng contract shadcn/Base UI.
- Workspace sạch sau commit và local server chạy ở `http://localhost:3000`.

## Validation

- Conflict: `git ls-files -u` rỗng; không còn conflict marker.
- TypeScript: `npx tsc --noEmit --pretty false` pass.
- Vitest: 129 file pass, 2 file skip; 1105 test pass, 6 test skip.
- Build: `npm run build` pass trên Next.js 16.4.0.
- Playwright production: 107/107 pass; regression focus cuối cùng pass lại sau review.
- Playwright development: 14/14 pass, không có browser/framework warning.
- Dependency audit: `npm audit --audit-level=high` exit 0; còn 4 advisory
  moderate trong chuỗi `drizzle-kit`/`esbuild`, không vượt quality gate.
- Review: finding focus restoration đã sửa và re-review không còn finding actionable.
- Local review: một Next dev server đang chạy tại `http://localhost:3000` trên
  database disposable của worktree.

## Rollback

Commit `8b27f85` là mốc ngay trước merge; `677ba05` là mốc behavior cuối cùng.
Nếu cần đối chiếu, dùng lịch sử Git hoặc worktree tạm; không reset branch đang
làm việc trong khi merge.

## Quyết định đã chốt

Behavior local được giữ khi còn contract người dùng hoặc test chứng minh; phần
đã được remote thay thế dùng implementation shadcn/Base UI và service layer mới.

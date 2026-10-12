# Đồng bộ `origin/main` và ổn định sau merge

## Trạng thái

- Status: in-progress
- Branch: `codex/sales-crm-improvements`
- Base local trước merge: `677ba05`
- Remote target: `origin/main` tại `631b033`

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
2. Branch hiện tại có ba commit chưa tồn tại trên remote: `d721238`, `f8ccb90`, `677ba05`.
3. 46 file đã thay đổi ở cả hai phía kể từ merge-base `24997d2`; rủi ro conflict ở UI, API, tests và docs là cao.
4. Hai remote feature branches còn tồn tại đều đã được merge hoàn toàn vào `origin/main`.
5. Dev server cũ đã được dừng trước khi đổi source.

## Assumptions cần kiểm chứng

| Mức rủi ro | Giả định | Cách kiểm chứng |
| --- | --- | --- |
| Cao | Các behavior CRM local chưa có trên remote vẫn có thể port qua interface mới | Đối chiếu tests/commits hai phía, rồi chạy focused tests sau resolve |
| Cao | Merge không làm mất contract shadcn/Base UI và action registry của remote | Typecheck, component tests, API tests và code review diff |
| Trung bình | Test database/E2E harness của remote chạy được trong máy local | Đọc CI/setup, chạy setup theo đúng disposable database guard |
| Thấp | Merge commit là hình thức lịch sử phù hợp cho branch hiện tại | Xác nhận lịch sử sau `git merge --no-ff origin/main` |

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

## Rollback

Commit `677ba05` là mốc trước merge. Nếu cần đối chiếu, dùng lịch sử Git hoặc worktree tạm; không reset branch đang làm việc trong khi merge.

## Câu hỏi chưa giải quyết

- Behavior nào trong ba commit local đã được remote thay thế hoàn toàn sẽ được chốt khi hoàn tất intent mapping và focused tests.

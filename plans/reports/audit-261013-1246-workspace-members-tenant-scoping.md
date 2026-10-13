---
title: "Rà phạm vi workspace của bảng thành viên: không còn rò rỉ đọc, nhưng SSO dùng chung cho phép chiếm tài khoản giữa các workspace"
date: 2026-10-13
branch: fix/workspace-members-scoping (từ main 2b77da6)
status: "Đã sửa F1 và F2 (Leo chọn Q54–Q57 = A); F3 giữ nguyên"
---

# Rà phạm vi workspace của `workspace_members` và các bảng không có RLS

## Bối cảnh

Khi làm P1 (owner của deal), ta phát hiện `workspace_members` không bật RLS (Postgres tự lọc dòng theo workspace), và các hàm danh sách người được gán đã liệt kê cả thành viên của workspace khác. Lỗi đó đã sửa trong PR #22. Báo cáo này rà mọi chỗ còn lại.

Trạng thái RLS kiểm trên database test đã chạy đủ migration:

| Bảng | RLS | Vì sao |
|---|---|---|
| `workspace_members`, `workspaces`, `api_keys` | tắt | Đăng nhập và xác thực API key chạy trước khi biết workspace |
| `users`, `sessions`, `sso_connections` | tắt | Bảng dùng chung cho cả instance |
| `invites` | bật, bắt buộc | |

Bảng không có RLS thì mỗi truy vấn phải tự lọc theo workspace.

## Các chỗ đã rà và kết luận

| Chỗ | Kết luận | Bằng chứng |
|---|---|---|
| `GET /api/members` | Lọc đúng | `src/app/api/members/route.ts:22` lọc `auth.workspaceId` |
| `PATCH`/`DELETE /api/members/:userId` | Lọc đúng | `activeMember` và `activeAdminCount` lọc workspace; cập nhật theo id dòng đã tìm (`[userId]/route.ts:25-61`) |
| `POST /api/members/accept` | Lọc đúng | Workspace lấy từ token, mã băm token phủ cả phần đó; truy vấn thành viên lọc workspace (`accept/route.ts:34-80`) |
| `roleInWorkspace` | Lọc đúng, loại thành viên đã vô hiệu | `src/lib/auth.ts:188-203`; mọi request API kiểm lại vai trò (`src/lib/api.ts:104`) |
| `listAssignees`, `getAssignee`, `resolveOwner` | Đã sửa ở PR #22 | `src/lib/actions/assignees.ts`; test "neither lists nor accepts a member of another workspace" |
| Route API key | Lọc đúng | `src/app/api/api-keys/route.ts:18,53,80` |
| Đọc bảng `workspaces` | Theo id tường minh | `members/invite/route.ts:98`, `capabilities.ts:194` |
| Đọc bảng `users` | Theo id hoặc email của chính người đó, hoặc id lấy từ dòng trong workspace | đăng nhập, 2FA, đặt lại mật khẩu, `deals/update.ts:153` |
| GraphQL `assignees`, `Task.owner`, `Deal.owner`; MCP `list_assignees` | Dùng `assignees.ts` đã sửa | |

## Phát hiện

### F1 — Nghiêm trọng khi một instance có nhiều workspace: SSO dùng chung cho phép chiếm tài khoản

- `sso_connections` không có cột workspace. Admin của **bất kỳ** workspace nào cũng tạo, sửa, xoá mọi kết nối (`authorize(auth, "sso", …)` chỉ kiểm vai trò admin, `src/app/api/sso/connections/route.ts:36-55`).
- Callback gắn người dùng có sẵn **theo email** (`findOrProvisionUser`, `src/lib/sso/provision.ts:23-44`).
- Hệ quả: admin workspace A tạo kết nối trỏ tới IdP do mình dựng, cho IdP khai email của một người bất kỳ trên instance, đăng nhập được thành người đó. Hoặc đặt `defaultWorkspaceId` là workspace B và `defaultRole` là `admin`, rồi tự cấp cho mình quyền admin ở B (`provision.ts:50-72`).
- ADR-014 có ghi "any workspace admin can manage SSO for the whole instance — a known limitation", nhưng không nêu hệ quả chiếm tài khoản.
- Với `crm.example.com` hôm nay: chỉ có một workspace và một admin, nên chưa có rủi ro thực tế. Rủi ro xuất hiện khi instance có workspace thứ hai do người khác làm admin.

### F2 — Lỗi chức năng, không rò dữ liệu: đăng nhập bằng mật khẩu có thể đưa người dùng vào workspace họ đã bị gỡ

- `membershipsOf` không lọc thành viên đã vô hiệu và không sắp thứ tự; đăng nhập lấy phần tử đầu (`src/app/api/auth/login/route.ts:60`, `src/lib/auth.ts:179-185`).
- Người bị gỡ khỏi workspace A nhưng còn ở workspace B có thể vào phiên ở A rồi bị mọi API từ chối. Đường SSO đã lọc đúng (`provision.ts:74-81`).

### F3 — Ghi nhận thiết kế: link mời dùng như vé, không so email

- Người đang đăng nhập cầm link mời gửi cho email khác vẫn chấp nhận được (`accept/route.ts:52-53`). Link có hạn và dùng một lần.

## Không đổi

Không đề xuất bật RLS cho `workspace_members`: đăng nhập cần đọc thành viên trước khi có workspace, nên chính sách sẽ cần thêm một biến phiên cho user. Mọi truy vấn hiện đã lọc tường minh và có test cho chỗ từng hở.

## Quyết định và kết quả (13/10/2026)

| Phát hiện | Quyết định | Đã làm |
|---|---|---|
| F1 | Q54 = A: chỉ admin của workspace tạo đầu tiên (chủ instance) quản lý SSO | `src/lib/sso/authorize.ts`; 5 thao tác của hai route SSO đi qua nó; ADR-014 và `docs/self-hosting/operations.md` ghi quy tắc. Test mới trong `tests/sso.test.ts`: admin workspace sau bị 403 ở GET, POST, PATCH, DELETE; admin workspace đầu làm được |
| F2 | Q55 = A: chỉ chọn workspace còn hoạt động, tham gia sớm nhất trước | `membershipsOf` lọc thành viên đã vô hiệu và sắp theo thời điểm tham gia. Test mới `tests/login-workspace.test.ts` (2) |
| F3 | Q56 = A: giữ link mời như vé | Không đổi |

Seam test (Q57 = A): REST `/api/sso/connections` và `POST /api/auth/login`. Test bảo vệ tĩnh trong `tests/api-auth.test.ts` nhận `authorizeSso(` như một lần gọi `authorize()`, vì hàm này gọi `authorize()` trước. Toàn bộ 1.141 unit test và 107 e2e đạt.

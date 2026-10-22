---
title: "Quản trị người dùng trong Fourty: admin mời, đổi vai trò và gỡ thành viên được; mọi việc khác về một con người phải làm bằng lệnh trên máy chủ hoặc sửa thẳng cơ sở dữ liệu"
date: 2026-10-13
branch: docs/user-admin-and-feature-gaps (commit 87d61b7; chỉ đọc, không sửa mã)
status: "Nghiên cứu xong. Chưa có quyết định sản phẩm: các lựa chọn nằm ở mục 'Chỗ trống cần điền', không có khuyến nghị"
nguon_da_mo:
  - "src/db/schema.ts, drizzle/0000_init.sql, 0003, 0004, 0009, 0010, 0018"
  - "src/lib/{auth,api,permissions,audit,audit-display,invites,password-reset,mail}.ts, src/lib/sso/{authorize,provision}.ts, src/lib/actions/{assignees,schemas}.ts, src/lib/actions/deals/update.ts, src/lib/workflows/engine.ts, src/lib/queue.ts"
  - "src/app/api/{members (4 route), auth/{login,logout,setup,forgot,reset,sso callback}, 2fa/*, api-keys, audit, tasks/assignees, sync/accounts/[id]}/route.ts"
  - "src/app/(app)/settings/{page,settings-client}.tsx và sections/{members,security,audit-log,api-keys,sso}.tsx; tasks-client.tsx; deals/deal-form.tsx; src/components/{app-sidebar,record-panels}.tsx; src/app/{login,accept}"
  - "scripts/reset-password.ts, package.json, docs/self-hosting/{operations,configuration}.md, docs/reference/cli.md, docs/api/rest.md, docs/adr/{005,012,014}.md, docs/getting-started/glossary.md, CONTEXT.md, README.md"
  - "tests/{members,rbac-matrix,login-workspace,invite-accept,reset-password,password-reset-flow}.test.ts, e2e/{invite-accept,settings,two-factor,forgot-password}.spec.ts"
  - "plans/reports/audit-261013-1246-workspace-members-tenant-scoping.md; runbook deploy và kế hoạch pipeline của khách hàng thử nghiệm (đã chuyển sang kho tri thức của khách)"
---

# Quản trị người dùng: hiện có gì, thiếu gì

## Kết luận ngắn

Leo nói: "không có chỗ nào để quản lý thông tin về tất cả người dùng". Đọc mã cho thấy câu đó đúng, với một chỉnh: có một chỗ, **Cài đặt → Team members**, nhưng nó quản lý *tư cách thành viên trong một workspace* chứ không quản lý *con người*. Ở đó admin làm được đúng bốn việc: xem danh sách, mời người, đổi vai trò, gỡ người. Mọi việc khác về một con người đều không có màn hình và không có API. Riêng đặt lại mật khẩu có một lệnh chạy trên máy chủ; phần còn lại chỉ làm được bằng cách sửa thẳng cơ sở dữ liệu.

Những khoảng trống lớn nhất, theo thứ tự đau với khách hàng thử nghiệm:

1. **Bàn giao khi một người nghỉ.** Gỡ người không động đến deal, task, workflow, API key, hộp thư mà người đó để lại. Trang deal không hiện owner, danh sách deal không lọc được theo owner, task của người đã gỡ hiện thành "Unassigned".
2. **Lời mời đang chờ vô hình.** Không có danh sách, không thu hồi, không gửi lại. Hai lời mời đang chờ hôm nay không có chỗ nào để nhìn.
3. **Không sửa được tên và email** của bất kỳ ai, kể cả chính mình. Tên do người được mời tự gõ lúc nhận lời mời.
4. **Người quên mật khẩu khi mail hỏng** chỉ còn cách nhờ người có quyền vào máy chủ chạy lệnh. Admin không có nút nào.
5. **Mất 2FA** (cả điện thoại lẫn mã dự phòng) không có đường thoát trong ứng dụng, và tài liệu không nhắc tới.
6. **Không thấy lần đăng nhập cuối, không thấy phiên, không đăng xuất cưỡng bức được.** "Ai 30 ngày chưa vào" không trả lời được.
7. **Không có danh sách tài khoản toàn hệ thống.** Chỉ thấy người có dòng thành viên trong workspace đang mở.
8. API key và hộp thư đã nối không gắn với người nào; key tạo từ giao diện luôn là quyền admin.

## Từ ngữ (đọc một lần, rồi dùng lời thường)

`CONTEXT.md` chỉ có hai nhóm từ (Selling, Reporting) và không định nghĩa người dùng, thành viên hay chủ instance; `docs/getting-started/glossary.md` chỉ có Workspace, RBAC, Audit log, API key, không có các từ còn lại. Bảng dưới là cách mã dùng các từ đó.

| Từ | Nghĩa trong Fourty | Bằng chứng |
|---|---|---|
| **Instance** | Một lần cài Fourty đang chạy. `crm.example.com` là một instance. | |
| **Workspace** | Không gian dữ liệu của một đội; mọi bản ghi CRM thuộc đúng một workspace. khách hàng thử nghiệm có một. Ứng dụng chỉ tạo workspace ở lần cài đầu; không màn hình nào tạo workspace thứ hai. | `glossary.md:5-9`; `src/app/api/auth/setup/route.ts:15-20`; `createWorkspace` chỉ được gọi ở đó và ở dữ liệu mẫu `src/db/seed.ts:258` |
| **Tài khoản** (bảng `users`) | Một con người ở mức cả instance: email (duy nhất), tên, mật khẩu đã băm, cấu hình 2FA. Không thuộc workspace nào. | `src/db/schema.ts:95-110` |
| **Thành viên** (bảng `workspace_members`) | Một dòng nối một tài khoản với một workspace, mang **vai trò** và dấu "đã gỡ". Một tài khoản có thể là thành viên của nhiều workspace, hoặc của không workspace nào. | `schema.ts:38-53`; `docs/adr/005-authz-model.md:7-10` (vai trò nằm trên tư cách thành viên, không nằm trên con người) |
| **Vai trò** | admin (toàn quyền, gồm quản trị), member (đọc và ghi dữ liệu CRM, không quản trị), viewer (chỉ đọc). | `src/lib/permissions.ts:1-10,45,54-59` |
| **Vai trò cũ `users.role`** | Cột còn sót từ bản đầu. Tôi không tìm thấy chỗ nào dùng nó để cấp quyền (tìm `user.role`: chỉ `auth.ts:83` trả nó ra). | `schema.ts:102` ("legacy global role") |
| **Gỡ mềm** | "Gỡ thành viên" chỉ điền `deactivated_at`; dòng thành viên và tài khoản còn nguyên. Không có lệnh xoá cứng nào trên `users` hay `workspace_members` trong `src/` và `scripts/`. | `src/app/api/members/[userId]/route.ts:82-85`; tìm `delete(tables.users)`, `delete(tables.workspaceMembers)`: không có |
| **Chủ instance** | Admin của workspace được tạo sớm nhất. Chỉ dùng để quyết định ai quản lý đăng nhập một lần (SSO). Không phải cột trên người nào; mỗi lần gọi, mã sắp workspace theo ngày tạo rồi lấy cái đầu. Đừng nhầm với **Owner** của deal (`CONTEXT.md:18-19`: thành viên chịu trách nhiệm về một deal). | `src/lib/sso/authorize.ts:17-25`; `docs/adr/014-sso-oidc.md:46-55` |
| **Phiên đăng nhập** (session) | Dòng trong bảng `sessions` tạo mỗi lần đăng nhập, sống 30 ngày, gắn với một workspace đang dùng. | `src/lib/auth.ts:8,37-56` |
| **API key** | Chuỗi bí mật cho script và công cụ, thuộc về workspace chứ không thuộc người; có vai trò riêng. | `schema.ts:498-508` |
| **2FA** | Xác thực hai bước: mã 6 số từ ứng dụng trên điện thoại. **Mã dự phòng** là 10 mã dùng một lần, chỉ lưu dạng băm. | `docs/adr/012-two-factor-auth.md:11-24` |
| **SSO** | Đăng nhập bằng tài khoản của nhà cung cấp danh tính (Google, Okta...) thay vì mật khẩu Fourty. | `docs/adr/014-sso-oidc.md` |
| **Nhật ký kiểm toán** (audit log) | Bảng ghi "ai làm gì lúc nào", chỉ thêm, không sửa, không xoá. | `drizzle/0004_audit_rls.sql:23-25` |
| **RLS** | Postgres tự lọc dòng theo workspace. `users`, `sessions`, `workspace_members`, `api_keys` không bật RLS (đăng nhập và xác thực API key chạy trước khi biết workspace; `users` và `sessions` dùng chung cả instance); `invites` và `audit_log` có bật. | `plans/reports/audit-261013-1246-workspace-members-tenant-scoping.md:14-22` |
| **REST / GraphQL / MCP** | Ba cửa vào cùng dữ liệu: REST (HTTP, giao diện web và script dùng), GraphQL (truy vấn có kiểu), MCP (cổng cho trợ lý AI gọi công cụ). Phần quản trị (thành viên, SSO, workflow) chỉ có REST. | `README.md:86` |
| **Lệnh trên máy chủ** | `npm run reset-password -- <email>`, chạy trong container ứng dụng (`docker compose exec app ...`). Cần quyền vào máy chủ (SSH tới droplet). | `docs/self-hosting/operations.md:67-70` |

## Một người được lưu những gì

| Bảng | Cột có thật | Ghi chú |
|---|---|---|
| `users` | id, email, name, password_hash, role (cũ), totp_secret, totp_enabled, backup_codes (băm), created_at | `schema.ts:97-110`; `drizzle/0000_init.sql:149-157` + `0009_two_factor.sql:5-7` |
| `workspace_members` | id, workspace_id, user_id, role, deactivated_at, created_at | `schema.ts:38-53`; `deactivated_at` thêm ở `drizzle/0003:25` |
| `invites` | id, workspace_id, email, role, token_hash, expires_at, accepted_at, invited_by, created_at | `schema.ts:56-73`; bật RLS (`drizzle/0004:7-9`) |
| `sessions` | id (băm của cookie), user_id, workspace_id, expires_at, created_at | `schema.ts:112-118` |
| `password_resets` | id, user_id, token_hash, expires_at, used_at, created_at | `schema.ts:126-133` |
| `api_keys` | id, workspace_id, name, prefix, key_hash, role, last_used_at, revoked_at, created_at | `schema.ts:498-508` |
| `audit_log` | id, workspace_id, actor_id, action, object_type, object_id, meta, created_at | `schema.ts:77-93`. `actor_id` để trống khi người làm là API key hoặc hệ thống (`src/lib/audit.ts:10`); giao diện hiện cả hai là "System" (`audit-display.ts:59`) |

**Không có cột nào cho:** lần đăng nhập cuối, tài khoản bị vô hiệu ở mức cả instance, ảnh đại diện, số điện thoại, chức danh, người quản lý, ngày nghỉ; người gỡ và lý do gỡ trên `workspace_members`; thời điểm thu hồi trên `invites`; id người đã nhận lời mời (chỉ có sự kiện `member.joined` trong nhật ký, `accept/route.ts:94`); IP, thiết bị, "thấy lần cuối" trên `sessions`; người tạo trên `api_keys`. Tìm `last_login`, `lastSeen`, `avatar` trong `src/`, `drizzle/`, `docs/`: không có chỗ nào thuộc về người dùng hệ thống (`jobTitle` và `phone` có trong `schema.ts:200-206` nhưng là cột của *liên hệ khách hàng*, không phải của người dùng).

**Người xuất hiện ở bảng khác chỉ bằng một chuỗi id, không có khoá ngoại** (bảng nào cũng là `text` thường; khoá ngoại duy nhất trong schema là `ai_messages → ai_conversations`, `schema.ts:687`): `companies.owner_id` (:185), `contacts.owner_id` (:206), `deals.owner_id` (:262), `tasks.owner_id` (:289), `notes.author_id` (:305), `activities.actor_id` (:319), `saved_views.user_id` (:526), `ai_conversations.user_id` (:652). Hệ quả: gỡ hay đổi một người không kéo theo gì ở các bảng này.

## Hiện có

### Quản trị (admin)

Cột "Ai được làm" ghi rõ từng việc. Phần quản trị thật (`members`, `api-keys`, `audit`, `sso`) nằm trong danh sách đối tượng chỉ admin (`src/lib/permissions.ts:45,54-59`; test `tests/rbac-matrix.test.ts:97-107`). Một API key có vai trò admin cũng gọi được các route thành viên (xem ghi chú c).

| Việc | Ai được làm | Ở đâu | Bằng chứng và ghi chú |
|---|---|---|---|
| Xem danh sách thành viên: tên, email, vai trò, "vào khi nào", đã gỡ hay chưa | admin | Cài đặt → Team members; REST `GET /api/members`. Không có trên GraphQL và MCP | `src/app/api/members/route.ts:7-25`; `members.tsx:185-218`. Danh sách gồm cả người đã gỡ (gạch ngang, `members.tsx:188`). Không hiện 2FA bật hay tắt, lần đăng nhập cuối, hay lời mời |
| Xem tên và id người đang hoạt động (để gán owner) | mọi vai trò | REST `GET /api/tasks/assignees`; GraphQL `assignees`; MCP `list_assignees` | `src/lib/actions/assignees.ts:13-26`; `src/lib/graphql/schema.ts:764`; `src/mcp/tools.ts:485-494`. Chỉ id và tên, chỉ người chưa gỡ |
| Mời người mới (email + vai trò) | admin | Cài đặt → Team members; REST `POST /api/members/invite` | `invite/route.ts:24-63`. Hạn 7 ngày (:13). Có mail thì xếp hàng gửi, không thì chỉ trả link (:51-61,80-91). Link hiện **một lần** trên màn hình ngay sau khi tạo (`members.tsx:75-79,152-173`); trong DB chỉ lưu bản băm nên không dựng lại được (`invite/route.ts:32,40`) |
| Nhận lời mời | người cầm link (chưa cần là thành viên) | `/accept?token=...` → `POST /api/members/accept` | `accept/route.ts:29-96`. Người mới tự gõ tên và mật khẩu (:59-62); người đã có tài khoản phải đăng nhập trước (:56-58). Dùng một lần (:43,93). Tên người đó gõ là tên hiển thị về sau |
| Đổi vai trò | admin | Ô chọn vai trò trên mỗi dòng; REST `PATCH /api/members/:userId` | `[userId]/route.ts:40-69`. Chặn hạ admin cuối cùng (:51-57). Ghi nhật ký `member.role_changed` (:62-66). Không áp dụng cho người đã gỡ (:49 trả 404) |
| Gỡ thành viên | admin | Nút thùng rác; REST `DELETE /api/members/:userId` | `[userId]/route.ts:71-89`. Chặn gỡ admin cuối (:79-81). Chỉ điền `deactivated_at` (:82-85). Ghi `member.removed` (:86). Giao diện báo "They lose access immediately." (`en.ts:289`). Hiệu lực ngay ở API: mỗi request kiểm lại tư cách (`src/lib/api.ts:104-105`, `auth.ts:192-207`), và mọi route dữ liệu đi qua bước đó (route không dùng `withAuth` chỉ còn các route danh tính: 2fa, auth, locale, accept, metrics). Không có test nào kiểm "phiên của người đã gỡ bị từ chối" (tìm `Not a member` trong `tests/` và `e2e/`: không có; `tests/members.test.ts:158-163` chỉ kiểm trả 200) |
| Đưa người đã gỡ quay lại | admin, gián tiếp | Tạo lời mời mới tới đúng email, người đó nhận | `accept/route.ts:79-83` đặt lại vai trò và xoá `deactivated_at`. `PATCH` không làm được. Xem ghi chú a và b |
| Xem nhật ký | admin | Cài đặt → Audit log (200 dòng mới nhất, cuộn); REST `GET /api/audit?limit=` tối đa 1000; `format=csv` | `src/app/api/audit/route.ts:8-33`; `audit-log.tsx:55,106,126-128`. Ghi: `member.invited` / `role_changed` / `removed` / `joined` (`invite/route.ts:45`, `[userId]/route.ts:62,86`, `accept/route.ts:94`). Không lọc theo người, hành động, ngày; không phân trang |
| Đặt lại mật khẩu của người khác, bằng lệnh | người vào được máy chủ | `docker compose exec app npm run reset-password -- <email>` | `scripts/reset-password.ts`; `package.json:26`; `operations.md:42-72`; runbook runbook deploy (kho tri thức của khách hàng thử nghiệm). Gõ mật khẩu mới ở dấu nhắc; xoá mọi phiên của người đó (`auth.ts:141-152`). Không ghi nhật ký (hai file này không gọi `audit`). Không có trong `docs/reference/cli.md` (bảng Operations chỉ có `backup-drill` và `rekey`, :67-68) |
| Quản lý API key (tạo, thu hồi, xem lần dùng cuối) | admin | Cài đặt → API keys; REST `/api/api-keys` | `api-keys/route.ts:11-84`; `api-keys.tsx:125-131`. Key không gắn người |
| Quản lý SSO | admin của workspace đầu tiên | Cài đặt → Single sign-on | `src/lib/sso/authorize.ts:17-25` |

**Ghi chú đọc mã (không phải thiếu chức năng, nhưng ảnh hưởng quản trị):**

- **(a) Lời mời cũng đổi được vai trò mà không qua rào "admin cuối cùng".** Route mời không kiểm email đã là thành viên (`invite/route.ts:31-44`), còn route nhận ghi đè vai trò bằng vai trò của lời mời (`accept/route.ts:79-83`) mà không có kiểm tra admin cuối như `PATCH`. Admin mời chính email của mình với vai trò member rồi tự nhận sẽ hạ mình xuống mà workspace có thể không còn admin. Suy ra từ mã; chưa chạy thử.
- **(b) Mời lại người đã gỡ có thể để họ vào một phiên không có workspace.** Từ commit sửa F2, đăng nhập bằng mật khẩu bỏ qua workspace đã gỡ (`auth.ts:182-189`), nên người đó nhận phiên có `workspace_id` rỗng (`login/route.ts:59-61`). Route nhận lời mời chỉ ghi lại dòng thành viên, không gán workspace cho phiên đang có (`accept/route.ts:79-95`; không có nơi nào cập nhật `sessions`). Request tiếp theo gặp "No active workspace" (`api.ts:101`) cho tới khi họ đăng xuất rồi đăng nhập lại. Test e2e hiện chỉ phủ trường hợp người nhận *đang là thành viên* (`e2e/invite-accept.spec.ts:80-120`). Suy ra từ mã; chưa chạy thử.
- **(c) Quản trị qua API key để lại dấu vết mờ.** Các route thành viên không chặn API key (chỉ route `api-keys` có `viaApiKey`: `api-keys/route.ts:37,74`), và test dùng đúng đường đó (`tests/members.test.ts:6-7,11,25-29`). Key tạo từ giao diện luôn có vai trò admin vì giao diện chỉ gửi tên (`api-keys.tsx:51`) và mặc định của route là admin (`api-keys/route.ts:43`). Việc làm bằng key ghi `actor_id` trống nên hiện là "System".
- **(d) Chú thích và tài liệu lệch nhau.** `src/lib/auth.ts:114` và `scripts/reset-password.ts:4` vẫn viết "Fourty has no forgot-password flow", trong khi luồng quên mật khẩu đã có (`drizzle/0018`, `src/lib/password-reset.ts`, `operations.md:42-47`). `docs/api/rest.md:35` chỉ ghi `/api/members`, không nhắc `invite`, `accept`, `:userId`. ADR-005 nói API key "carry scopes" (`005-authz-model.md:29-31`) nhưng cột thật chỉ có `role` (`schema.ts:498-508`).

### Tự phục vụ (người dùng tự làm cho mình)

| Việc | Có không | Ở đâu | Bằng chứng |
|---|---|---|---|
| Đổi tên của mình | Không | | Mọi nơi ghi vào `users`: `auth.ts:96` (tạo), `auth.ts:147` (mật khẩu), `login/route.ts:53` (tiêu thụ mã dự phòng), `2fa/setup,enable,disable`, `sso/provision.ts:34` (tạo). Không nơi nào ghi `name` hay `email` sau khi tạo |
| Đổi email | Không | | như trên. Email còn là khoá đăng nhập (`login/route.ts:26-32`) |
| Đổi mật khẩu khi đang đăng nhập | Không có chức năng riêng | | Chỉ có "Quên mật khẩu" (cần mail bật; link 1 giờ, dùng một lần: `password-reset.ts:26,42-119`; link chỉ hiện khi `mailEnabled()`: `login/page.tsx:75-78`) hoặc lệnh trên máy chủ. `setPassword` chỉ được gọi từ hai đường đó (`auth.ts:132,141`; `password-reset.ts:117`) |
| Bật hoặc tắt 2FA | Có | Cài đặt → Two-factor authentication | `security.tsx`; `src/app/api/2fa/*`. Tắt cần nhập mật khẩu (`2fa/disable/route.ts:21`). Bật xong không đăng xuất các phiên khác (`2fa/enable/route.ts:27-33`). 2FA chỉ được hỏi ở đăng nhập bằng mật khẩu (`login/route.ts:37-57`); đường SSO không hỏi (`auth/sso/[id]/callback/route.ts:86-88`) |
| Phục hồi khi mất cả điện thoại lẫn mã dự phòng | Không | | Đăng nhập cần mã (`login/route.ts:37-56`); tắt 2FA cần đang đăng nhập (`2fa/disable/route.ts:15-16`); đặt lại mật khẩu chỉ đổi mật khẩu và xoá phiên, không đụng 2FA (`auth.ts:141-152`). Tìm "totp", "2fa", "lost" trong `docs/self-hosting/`, `docs/reference/`, `scripts/`: không có hướng dẫn |
| Xem hoặc huỷ các phiên của mình | Không | | Phiên chỉ bị xoá ở `auth.ts:62` (đăng xuất phiên hiện tại) và `auth.ts:150` (đổi mật khẩu). Không route nào đọc bảng `sessions` ngoài kiểm tra cookie (`auth.ts:71-74`) |
| API key "của mình" | Không có khái niệm này | | `api_keys` không có cột người (`schema.ts:498-508`); chỉ admin thấy danh sách |
| Đăng xuất | Có | Menu tài khoản cuối thanh bên | `src/components/app-sidebar.tsx:198-270`. Menu chỉ có tên, email, đổi sáng/tối, đăng xuất; không có "Hồ sơ" hay "Tài khoản" |

## Thiếu

Cột cuối ghi cách tôi biết là *không có*: tôi đã tìm gì và không thấy gì.

| # | Việc | Hệ quả cụ thể với khách hàng thử nghiệm | Bằng chứng là không có |
|---|---|---|---|
| T1 | Danh sách lời mời đang chờ; thu hồi; gửi lại | Hai lời mời đang chờ hôm nay không nhìn được ở đâu. Gõ nhầm email thì link vẫn dùng được tới 7 ngày, và người cầm link đang đăng nhập có thể nhận (đã ghi nhận F3 ở báo cáo trước, giữ nguyên). Muốn "gửi lại" phải tạo lời mời mới, các lời mời cũ vẫn sống. Link mất khỏi màn hình khi rời trang | `invite/route.ts` chỉ export `POST`; thư mục `src/app/api/members` chỉ có `[userId]`, `accept`, `invite`, `route.ts`; bảng `invites` chỉ được đọc ở `accept/route.ts:39` và `invites.ts:25-27`; `invites` không có cột thu hồi (`schema.ts:56-73`) |
| T2 | Sửa tên và email (của người khác và của chính mình) | Tên sai chính tả hiện ở danh sách thành viên, ô chọn owner, nhật ký, lịch sử deal. Đổi email công ty cũng không làm được | Danh sách nơi ghi `users` ở bảng Tự phục vụ. SSO lần sau không cập nhật tên (`provision.ts:28-31` trả tài khoản cũ nguyên trạng) |
| T3 | Admin đặt lại mật khẩu hoặc tạo link đặt lại để gửi tay | Mail hỏng hoặc vào hộp thư rác (runbook ghi domain mới hay vào spam: `runbook-...:430-431`) thì người quên mật khẩu bị kẹt cho tới khi có người vào máy chủ | Không có route admin nào chạm mật khẩu hay `password_resets`; token đặt lại chỉ đi vào mail (`password-reset.ts:75-86`) |
| T4 | Admin tắt hoặc đặt lại 2FA của người khác | Người mất điện thoại và mã dự phòng bị khoá vĩnh viễn nếu không ai sửa DB | Không route nào ghi `totp_*` trừ chính chủ đang đăng nhập (`2fa/*`) |
| T5 | Xem phiên; buộc đăng xuất | Không đuổi được một người đang mở app, trừ cách gỡ khỏi workspace (có hiệu lực ngay, nhưng phiên vẫn nằm trong DB tới 30 ngày) | Mục "Xem hoặc huỷ các phiên" ở trên |
| T6 | Lần đăng nhập cuối; hoạt động cuối | Không trả lời được "ai 30 ngày chưa vào". Đăng nhập, đăng xuất, đổi mật khẩu, bật tắt 2FA, đăng nhập SSO đều không ghi nhật ký | `login/route.ts`, `logout/route.ts`, `auth/sso/[id]/callback/route.ts`, `2fa/*` không gọi `audit`; chỗ gọi `audit(` toàn `src/` liệt kê được và không có sự kiện đăng nhập. Bảng `sessions` không có "thấy lần cuối"; đăng xuất xoá dòng (`auth.ts:62`); không có job dọn phiên hết hạn (tìm `sessions` trong `src/worker`: không có). Chỉ API key có `last_used_at` (`api.ts:84-87`) |
| T7 | Bàn giao công việc của người nghỉ: thấy owner, lọc theo owner, đổi hàng loạt | Xem kịch bản A | Trang deals không hiện owner (tìm `owner` trong `src/app/(app)/deals`, `dashboard`, `reports`: chỉ có `deal-form.tsx`); `listDealsInput` và `listTasksInput` không có bộ lọc owner (`schemas.ts:53-60,66-72`); không có chữ "bulk/reassign" cho owner trong `src/`. Contact và company chỉ nhận owner lúc tạo (`contacts/create.ts:33`, `companies/create.ts:26`, `import/contacts/route.ts:144,232`), schema nhập chỉ có owner cho deal và task (`validators.ts:48,59`) |
| T8 | Gắn API key và hộp thư đã nối với người; thu hồi theo người | Key và hộp thư của người nghỉ tiếp tục chạy | `api_keys` và `sync_accounts` không có cột người (`schema.ts:498-508`, `554-568`) |
| T9 | Danh sách tài khoản của cả instance | Tài khoản không có dòng thành viên ở workspace đang mở (ví dụ người từng vào qua SSO không có workspace mặc định) không ai thấy | Không route, không GraphQL, không MCP, không script nào liệt kê `users`; `/api/members` luôn lọc theo workspace (`members/route.ts:22`). Tìm trong `scripts/`: chỉ có `reset-password.ts`, `rekey.ts` và script dựng tài sản |
| T10 | Nút "kích hoạt lại" thành viên đã gỡ | Phải đi vòng qua lời mời mới (xem ghi chú a, b) | `PATCH` từ chối người đã gỡ (`[userId]/route.ts:49`) |
| T11 | Vô hiệu hoá một con người ở mức cả instance | Người bị gỡ vẫn đăng nhập được vào Fourty (vào app không có workspace) và vẫn đặt lại được mật khẩu | `users` không có cột vô hiệu (`schema.ts:97-110`); `deactivated_at` chỉ có ở thành viên |
| T12 | Hồ sơ người dùng: chức danh, số điện thoại, ảnh, người quản lý | Admin không ghi được ai là ai ngoài tên và email | Danh sách cột ở mục "Một người được lưu những gì" |
| T13 | Lọc và tìm nhật ký theo người, hành động, ngày | "BTDuc đã làm gì tuần trước" phải tải CSV rồi tự lọc; CSV chỉ có `actor_id` thô, không có tên | `audit/route.ts:11-24`: chỉ nhận `limit` và `format`; `audit-log.tsx:106` cuộn trong khung 200 dòng |
| T14 | Cửa quản trị trên GraphQL và MCP | Trợ lý AI và script GraphQL không quản trị thành viên được. Có thể là chủ ý | `README.md:86`; thư mục `src/lib/actions/` không có nhóm thành viên (kernel hành động chỉ phủ dữ liệu CRM); MCP chỉ có `list_assignees` |

## Kịch bản cụ thể

Tên người trong các kịch bản lấy từ yêu cầu nghiên cứu (BTDuc, haidv, longnv). Kho mã không chứa dữ liệu thật của họ; kế hoạch pipeline của khách hàng thử nghiệm nhắc tới ba thành viên khác tên viết (DVHai, LTHoa, NVLong). Số liệu production ("1 admin, 2 thành viên, 2 lời mời đang chờ") lấy từ yêu cầu, **chưa kiểm** vì không được chạm production.

### A. BTDuc nghỉ việc: admin làm được gì, từng bước

**Làm được:**

1. Cài đặt → Team members → bấm thùng rác ở dòng BTDuc → xác nhận "They lose access immediately." (`members.tsx:102-116`, `en.ts:289`).
2. Hệ thống chặn nếu BTDuc là admin cuối cùng (`[userId]/route.ts:79-81`). Khi BTDuc là admin duy nhất, admin phải đổi vai trò một người khác thành admin trước (`PATCH`, `:40-69`), rồi mới gỡ được.
3. Kết quả: dòng thành viên của BTDuc có `deactivated_at`; mọi request API của phiên BTDuc gặp 403 "Not a member of this workspace" (`api.ts:104-105`); nhật ký ghi `member.removed` (`:86`). Tên BTDuc vẫn hiện trong lịch sử vì tài khoản còn nguyên và danh sách thành viên không lọc người đã gỡ (`members/route.ts:11-23`, `audit-log.tsx:35-50`).

**Còn lại sau bước đó, admin xử lý thế nào:**

| Thứ BTDuc để lại | Trạng thái sau khi gỡ | Admin làm được gì hôm nay | Bằng chứng |
|---|---|---|---|
| Deal đang do BTDuc phụ trách | `owner_id` giữ nguyên | Mở từng deal, sửa owner (form hiện "Inactive member", vi: "Thành viên đã nghỉ"); mỗi lần đổi ghi một dòng `owner_changed` trên timeline. Hoặc `GET /api/deals` rồi lọc `ownerId` bằng script và `PATCH` từng cái. Không có chỗ nào xem "deal của BTDuc" trong giao diện: trang deal không hiện owner, danh sách không lọc được. GraphQL `Deal.owner` trả null cho người đã gỡ | `deal-form.tsx:305-308`; `vi.ts:743`; `deals/update.ts:46-52,114-121`; `graphql/schema.ts:259-264`; `assignees.ts:28-37` |
| Task của BTDuc | `owner_id` giữ nguyên, **giao diện hiện "Unassigned"** | Mở từng task đổi owner. Task của người đã gỡ trông như chưa ai nhận, nên khó phân biệt với task thật sự chưa giao | `tasks-client.tsx:236-237,346` và `record-panels.tsx:458` dùng danh sách người đang hoạt động (`/api/tasks/assignees`) |
| Workflow tạo task tự động | Task mới vẫn gán cho owner của bản ghi, tức BTDuc, cho tới khi đổi owner deal | Đổi owner deal (dòng trên). Workflow không kiểm owner còn hoạt động | `src/lib/workflows/engine.ts:96` |
| Contact và company BTDuc tạo hoặc nhập CSV | `owner_id` = BTDuc | Không đổi được qua giao diện hay API. Ảnh hưởng ngoài workflow có điều kiện theo `ownerId` (`engine.ts:131-132`): **chưa kiểm** còn chỗ nào đọc trường này | `contacts/create.ts:33`; `companies/create.ts:26`; `validators.ts:48,59` |
| Phiên đăng nhập | Dòng `sessions` còn tới 30 ngày; vô hiệu trong workspace này | Không xem, không huỷ được. Không cần, vì kiểm tra tư cách mỗi request | `auth.ts:8`; `api.ts:104-105` |
| API key BTDuc tạo | Vẫn hoạt động. Key tạo từ giao diện là quyền admin | Xem danh sách key (tên, tiền tố, ngày tạo, lần dùng cuối) rồi đoán theo tên. Truy ngược bằng nhật ký `api_key.created` có `actor_id` = BTDuc (`api-keys/route.ts:60-64`), nhưng giao diện chỉ hiện 200 dòng gần nhất, không lọc | `api-keys.tsx:51,125-131`; `api-keys/route.ts:43` |
| Hộp thư BTDuc đã nối | Tiếp tục đồng bộ | Cài đặt → Mailboxes → ngắt kết nối thủ công (ghi `sync_account.deleted`) | `schema.ts:554-568` (không cột người); `sync/accounts/[id]/route.ts:78` |
| Tài khoản | Còn nguyên; email vẫn bị chiếm (duy nhất); BTDuc vẫn đăng nhập được vào app nhưng không có workspace | Không vô hiệu được ở mức tài khoản | `schema.ts:99`; `login/route.ts:59-61`; `auth.ts:182-189` |
| Nếu khách hàng thử nghiệm dùng SSO | Danh tính công ty của BTDuc vẫn qua được IdP; vào app vẫn bị chặn vì dòng đã gỡ được coi là "đã tồn tại", không tạo lại | Không cần làm gì thêm. Có dùng SSO không: **chưa kiểm** | `provision.ts:56-62`; `api.ts:104-105` |
| Dữ liệu cá nhân trỏ về BTDuc | view đã lưu, hội thoại trợ lý AI, ghi chú, hoạt động vẫn trỏ về id của BTDuc | Không cần làm gì; tên vẫn hiện nhờ đọc từ `users` (ghi chú trong mã: "a departed owner keeps their name in history") | `schema.ts:305,319,526,652`; `deals/update.ts:150` |

**Nếu BTDuc quay lại sau này:** admin tạo lời mời mới tới đúng email; BTDuc đăng nhập rồi nhận. Có thể rơi vào ghi chú (b): phiên không có workspace cho tới khi đăng nhập lại. Chưa chạy thử.

### B. haidv quên mật khẩu và mail hỏng

1. haidv mở trang đăng nhập. Link "Forgot your password?" hiện nếu biến mail đã cấu hình (`mailEnabled()`), *không* kiểm nhà cung cấp mail còn sống (`login/page.tsx:75-78`, `mail.ts:43-45`). Production gửi qua Resend (`runbook-...:84,410-431`).
2. Anh nhập email, API luôn trả 200 dù email có tồn tại hay không (`auth/forgot/route.ts:24-25`). Mail xếp hàng, thử lại có lùi dần (`docs/self-hosting/configuration.md:121-123`; `queue.ts:12-13`). Nếu Resend lỗi hoặc thư vào spam, không ai nhận được báo lỗi.
3. Admin không có nút nào: không xem được link, không tạo link, không đặt mật khẩu (T3).
4. Đường duy nhất: người có SSH vào droplet chạy `docker compose exec app npm run reset-password -- <email haidv>` (`operations.md:67-71`; `runbook-...:398`), gõ mật khẩu tạm, rồi nhắn cho haidv bằng kênh khác. Mọi phiên của haidv bị đăng xuất (`auth.ts:150`).
5. Không có cờ "bắt đổi mật khẩu lần đầu" (`users` không có cột như vậy) và không có chức năng đổi mật khẩu khi đang đăng nhập (bảng Tự phục vụ). haidv phải dùng mật khẩu tạm cho tới khi mail hoạt động để dùng "Quên mật khẩu".
6. Nếu haidv đã bật 2FA, lệnh trên *không* gỡ 2FA (`auth.ts:141-152`); mất cả điện thoại lẫn mã dự phòng thì vẫn kẹt (T4). haidv có bật 2FA không: **chưa kiểm**.
7. Việc này không để lại dòng nào trong nhật ký; chỉ có dòng chữ in ra màn hình của người chạy lệnh (`scripts/reset-password.ts:77`).

### C. Tên của longnv bị viết sai

1. Tên do chính longnv gõ lúc nhận lời mời (`accept/route.ts:59-62`; ô "Your name" ở `accept-form.tsx`). Nếu vào qua SSO, tên lấy từ thông tin IdP lần đầu và không bao giờ cập nhật lại (`provision.ts:28-37`).
2. Tên sai hiện ở danh sách thành viên, ô chọn owner (`assignees.ts:21`), nhật ký, GraphQL `owner.name`.
3. Không ai sửa được qua ứng dụng (T2). Chỉ còn cách sửa trực tiếp dòng trong bảng `users` ở Postgres production. Việc đó không để lại dòng nhật ký.
4. Email cùng tình trạng. Về mặt dữ liệu, các bảng CRM trỏ về người bằng id chứ không bằng email (bảng "Một người được lưu những gì"), nhưng email là khoá đăng nhập nên người đó phải biết email mới.

### D. "Ai 30 ngày chưa đăng nhập?"

Không trả lời được từ giao diện hay API (T6). Hai lối vòng, đều không đáng tin:

- Tải CSV nhật ký (`GET /api/audit?format=csv&limit=1000`): chỉ chứa *hành động ghi*, cột `actor_id` là id thô cần ghép với `/api/members` để ra tên, không lọc theo ngày, tối đa 1000 dòng, việc làm bằng API key hoặc hệ thống có `actor_id` trống. Kết quả đúng nhất là "người nào chưa ghi gì trong 1000 dòng gần nhất", không phải "chưa đăng nhập".
- Đọc bảng `sessions` bằng SQL, lấy `created_at` mới nhất mỗi người: đăng xuất xoá dòng, hết hạn không bị dọn, nên con số lệch theo thói quen đăng xuất.

### E. Hai lời mời đang chờ

Admin muốn biết: gửi cho ai, hết hạn lúc nào, ai mời. Giao diện không hiện. Chỉ đọc được bảng `invites` bằng SQL (cột `accepted_at` trống và `expires_at` còn hạn). Nếu một lời mời gõ nhầm email, không thu hồi được; mời lại tạo thêm một link nữa, link nhầm vẫn sống tới hết 7 ngày. Khi lời mời hết hạn, người nhận chỉ thấy "invalid or expired" (`accept/route.ts:44-46`) và admin chỉ biết nếu người đó báo lại.

## Điều chưa kiểm

- Số liệu production (1 admin, 2 thành viên, 2 lời mời đang chờ, một workspace): lấy từ yêu cầu, không đọc từ production.
- Ghi chú a và b: suy ra từ đọc mã, chưa chạy test hay thử trên app. Chạy test cần Postgres và truncate DB test nên tôi không chạy.
- khách hàng thử nghiệm có dùng SSO không; haidv có bật 2FA không; hôm nay production có tài khoản nào không có dòng thành viên không.
- Còn chỗ nào đọc `owner_id` của contact và company ngoài điều kiện workflow (`engine.ts:131-132`) và quyền theo trường (`field-permissions.tsx`).
- Mọi tên người (BTDuc, haidv, longnv) chỉ là ví dụ; không đối chiếu với danh sách thật.
- Tôi đã kiểm bằng tìm kiếm văn bản rằng không có route, script hay tài liệu cho các việc ở bảng "Thiếu". Không bao giờ loại trừ được 100% một chức năng ẩn dưới tên khác, nhưng đã thử các từ khoá `last_login`, `lastSeen`, `avatar`, `bulk`, `reassign`, `offboard`, `sessions`, `totp`, và đã liệt kê toàn bộ nơi ghi vào `users`, `sessions`, `workspace_members`.

## Chỗ trống cần điền

Báo cáo này không đề xuất, theo yêu cầu. Mỗi câu liệt kê phương án trung tính và điều đổi theo.

**U1. "Quản lý người dùng" nên đứng ở tầng nào?**
- A. Mở rộng panel Team members trong workspace (thêm cột và nút ngay trên dòng thành viên). Đổi: mọi thứ nằm cạnh việc mời, vai trò, gỡ; vẫn không thấy tài khoản không có dòng thành viên.
- B. Thêm một trang cấp instance liệt kê mọi tài khoản. Đổi: thấy được cả người không thuộc workspace nào; cần quyết ai được vào (có sẵn khái niệm chủ instance dùng cho SSO).
- C. Không thêm màn hình; chỉ viết thêm lệnh vận hành và tài liệu cho việc hiếm (đặt lại 2FA, sửa tên). Đổi: ít mã nhất; việc vẫn cần người vào máy chủ.

**U2. Bàn giao khi một người nghỉ.**
- A. Bước gỡ thành viên hỏi luôn "chuyển deal và task của người này cho ai". Đổi: một thao tác, nhưng gỡ trở thành thao tác nặng hơn.
- B. Giữ gỡ như hiện nay, thêm hiển thị owner và bộ lọc theo owner ở deal và task, đổi từng cái hoặc hàng loạt. Đổi: dùng được cả khi chuyển việc giữa hai người còn ở lại.
- C. Chỉ thêm cột owner vào bảng deal và bộ lọc, đổi từng cái. Đổi: ít nhất; với khoảng 11 deal (theo kế hoạch khách hàng thử nghiệm, chưa kiểm trên production) có thể đủ.
- D. Không đổi; ghi quy trình vào runbook (dùng REST để liệt kê rồi `PATCH`).

**U3. Đặt lại mật khẩu cho người khác khi mail không dùng được.**
- A. Admin bấm tạo link đặt lại dùng một lần và tự gửi. Đổi: không cần vào máy chủ; admin cầm được link nên phải ghi vào nhật ký.
- B. Admin đặt mật khẩu tạm và người dùng buộc đổi ở lần vào đầu. Đổi: cần cột "phải đổi" và chức năng đổi mật khẩu khi đang đăng nhập (hiện chưa có).
- C. Giữ lệnh trên máy chủ, bổ sung vào `docs/reference/cli.md` và ghi nhật ký cho lệnh đó.

**U4. Mất 2FA.**
- A. Admin tắt 2FA cho người khác (ghi nhật ký). Đổi: admin thành mắt xích tin cậy; người dùng đăng nhập lại và bật 2FA mới.
- B. Lệnh trên máy chủ, tương tự lệnh đặt lại mật khẩu.
- C. Giữ nguyên; chỉ viết hướng dẫn sửa DB trong tài liệu vận hành.

**U5. "Ai còn dùng, ai không."**
- A. Thêm cột "đăng nhập lần cuối" trên `users`. Đổi: một con số, rẻ nhất; không cho biết phiên nào đang mở.
- B. Trang phiên (admin xem và huỷ phiên của bất kỳ ai; mỗi người xem và huỷ phiên của mình), có IP và thiết bị. Đổi: trả lời được "đăng xuất cưỡng bức"; thêm cột vào `sessions` và việc dọn phiên hết hạn.
- C. Ghi sự kiện đăng nhập, đăng xuất, đổi mật khẩu, bật tắt 2FA vào nhật ký hiện có. Đổi: dùng lại màn hình nhật ký; nhật ký dài hơn nhiều.
- D. Không làm.

**U6. Sửa tên và email.**
- A. Mỗi người tự sửa tên; email chỉ admin sửa. Đổi: cần màn hình hồ sơ (hiện menu tài khoản chưa có).
- B. Chỉ admin sửa cả hai, trong panel Team members.
- C. Không làm; sửa DB khi cần.

**U7. Lời mời.**
- A. Danh sách + thu hồi + gửi lại. Đổi: cần cột thu hồi trên `invites`; link "gửi lại" tạo token mới vì token cũ không dựng lại được.
- B. Chỉ danh sách (đọc).
- C. Chỉ thu hồi, không danh sách riêng.
- D. Không đổi.

**U8. API key và hộp thư gắn với người.**
- A. Thêm người tạo; gỡ thành viên có hỏi "thu hồi key và ngắt hộp thư của người này".
- B. Chỉ hiển thị người tạo, không tự thu hồi.
- C. Không đổi. Kèm theo: key tạo từ giao diện hiện luôn là quyền admin (`api-keys.tsx:51`, `api-keys/route.ts:43`); giữ, cho chọn vai trò khi tạo, hoặc đổi mặc định?

**U9. Rào "admin cuối cùng" qua đường lời mời (ghi chú a) và phiên không workspace sau khi mời lại (ghi chú b).** Hai điểm này là hành vi hiện tại có thể không đúng ý. Chọn: (A) coi là lỗi, sửa riêng; (B) để vào phạm vi quản trị người dùng ở trên; (C) chạy thử xác nhận trước khi quyết.

**Câu hỏi về dữ kiện (ngoài lựa chọn sản phẩm):** khách hàng thử nghiệm hiện dùng SSO hay chỉ mật khẩu? Người phụ trách vận hành (có SSH vào droplet) có luôn là admin trong Fourty không? Việc "đặt lại mật khẩu bằng lệnh" có chấp nhận được là quy trình thường trực của khách hàng thử nghiệm hay chỉ là biện pháp khẩn?

## Quyết định (13/10/2026, Leo)

| Câu | Chọn | Nghĩa |
|---|---|---|
| Q63 (ghi chú a, b; U9) | A | Sửa riêng ngay, viết test trước ở `POST /api/members/accept`: thành viên đang hoạt động mở link thì được báo "đã ở trong workspace", vai trò không đổi, link không bị tiêu; người từng bị gỡ nhận lại lời mời thì vào thẳng workspace |
| Q64 (U1) | A | "Quản lý người dùng" là quản lý **Thành viên** của workspace; nâng Cài đặt → Team members thành trang Thành viên đầy đủ. Từ ngữ Workspace, Account, Member, Invite thêm vào `CONTEXT.md` |
| Q65 (U2, U3, U4, U6, U7) | A | Đợt đầu gồm nhóm 1–4: bàn giao khi nghỉ (hiện owner, lọc theo owner, đổi owner hàng loạt, task của người đã nghỉ hiện đúng nhãn); lời mời (danh sách, thu hồi, gửi lại); sửa tên (tự sửa) và email (admin sửa); cứu tài khoản không cần SSH (link đặt lại mật khẩu do admin tạo, admin tắt 2FA, tự đổi mật khẩu khi đang đăng nhập, mọi thao tác ghi nhật ký). Nhóm 5 (lần đăng nhập cuối, phiên) và 6 (key, hộp thư theo người) để đợt sau |

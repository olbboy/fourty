# Thực thi cải tiến Companies từ sales-crm

Worktree: `~/.codex/worktrees/0747/fourty`. Kế hoạch: [Companies-first](../261011-2319-sales-crm-improvements/plan.md). Người dùng đã yêu cầu triển khai đủ bốn phase qua `ak-cook`; không có `--yagni`. Đã triển khai đủ scope, kiểm thử và review; chưa commit/publish. Lint vẫn chưa qua vì cấu hình baseline, được ghi riêng bên dưới.

## Môi trường và tài nguyên

- `npm ci` hoàn tất, không đổi package/lockfile. Npm báo 12 vulnerabilities của dependency tree hiện có; không chạy audit fix hoặc nâng package ngoài scope.
- PostgreSQL cổng 5432 thuộc container dự án khác và từ chối credential mặc định Fourty. Không thay đổi hoặc dừng container đó.
- Tạo container riêng `fourty-0747-test-postgres` (`postgres:16-alpine`, ID `4a29a7833bedbc1e6a2ecf5a28f3f5b8ff868fe3616ec20afeb61d9311735dc2`), chỉ bind `127.0.0.1:55447`; worktree là owner của process test này.
- Database `fourty_test` dành Vitest, `fourty_e2e` dành Playwright, `fourty_revtest` dành migration reversibility; runtime role `fourty_app` không superuser/bypass RLS, migration role `fourty`. Controller điều phối các suite mutation tuần tự.
- Backup cluster trước tạo role/database, từng DB trước reset/mutation, và snapshot cuối nằm trong `/tmp/fourty-0747-validation-261011/`, không đưa vào Git; thư mục700, SQL/dump600. Sau validation đã dừng và xóa container cùng anonymous volume riêng; không đụng PostgreSQL dự án khác.
- Playwright tự dừng server sau mỗi lượt. Server `npm start` chụp ảnh cuối thuộc phiên này, PID20380/port3100/worktree0747, đã nhận SIGTERM và kết thúc. Kiểm cuối không còn listener trên3100 hoặc55447; không còn browser/process do phiên tạo.

## Kết quả triển khai

- CSV có serializer riêng cho spreadsheet, giữ raw round-trip; export kiểm cả object quyền export/entity, field policy và RLS. Companies có ba scope, selected giới hạn 500 ID unique và từ chối khi ID bị ẩn.
- Companies query/count/facet trong một SQL statement; default API 200/cap500, UI50; URL/saved views, paging, current-page selection và empty/loading/error/retry states. DTO đọc partial giữ field redaction.
- Preview read-only, giữ list query/selection, abort stale request, full detail và history. Shared focus stack xử lý thứ tự đóng nested dialogs; shell có mobile Companies và resize224–360; CmdK có grouping/metadata qua policy.
- Không sao chép khối mã/asset đáng kể từ sales-crm. Đây là implementation theo pattern, dùng kiến trúc sẵn có của Fourty; provenance khảo sát ở packet Xia.
- Cập nhật [import/export guide](../../docs/guides/import-export.md), [records guide](../../docs/guides/records.md), và [CLI reference](../../docs/reference/cli.md) cho cấu hình test migration riêng.

## Bằng chứng kiểm thử

- Test-first: CSV mới ban đầu đỏ vì chưa có safe serializer; Companies list mới 6/7 đỏ vì thiếu metadata/validation/masking. Những test đó đã xanh sau implementation.
- Backend narrow gate: 54/54 tests trong `csv`, `export`, `company-query`, `companies-list`, `field-permissions`, `tenant-isolation`, `rbac-matrix` đã qua trên PostgreSQL thật. Các thay đổi review sau gate này phải chạy lại suite liên quan.
- Probe import thực tế: LibreOfficeDev `26.8.0.0.alpha0`, build `2c87e51eeaa2b413ff4ae097b2705eea1995d8e5`; CSV UTF-8, comma, quote, import-as-formulas bật theo [tài liệu filter chính thức](https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html). File safe có 15 mẫu: không có formula cell, `-12` và `0` còn numeric. Control raw `=1+1` được nhập thành formula `1+1`, giá trị 2. Artifacts CSV/XLSX tại thư mục validation tạm. Chỉ chứng minh lần nhập này, không mọi spreadsheet hay lưu/mở lại.
- Fixture 10.000 Companies trên PostgreSQL riêng: request list filter/sort/page50 trả total5.000 trong khoảng 17ms; export all10.000 khoảng37ms, 378.959 bytes, heap tăng khoảng22,4MiB. Đây là mẫu đo local một lần, không SLA hay kiểm thử tải production.
- EXPLAIN ANALYZE cho cùng cấu trúc truy cập count/page/facet (projection tối giản) có RLS workspace filter, top-N heapsort, khoảng13ms execution; không phát sinh yêu cầu index/schema mới trong fixture này.
- `npm run lint` đã chạy và exit1: `next lint` hỏi tạo cấu hình ESLint vì repository chưa cấu hình. Không bỏ gate hoặc ghi thành pass; không tự thêm dependency/config ngoài scope.
- Full Vitest: 43 files / 288 tests qua trong 39,56s trên PostgreSQL thật. Lượt đầu có 287/288 pass vì migration reversibility hard-code cổng 5432; đã thêm `MIGRATION_TEST_DATABASE_URL` với guard database `fourty_revtest`, tạo database riêng sau backup, kiểm thử hẹp rồi chạy lại toàn suite. Không đổi assertion/schema.
- Search được viết trước test, khác trình tự test-first của plan. Negative control chạy test hidden company name/domain với route baseline trích từ HEAD thất bại đúng chỗ; route hiện tại qua cả 7 tests. Bằng chứng này chứng minh regression, không được ghi lại thành một red run đã xảy ra trước implementation.
- Simplifier đã làm scoped edits tại search/export và ran clean trên các helper backend còn lại. Full Vitest sau simplify vẫn qua.
- Lượt browser đầu build thành công nhưng setup thất bại vì helper mới dùng `getByLabel` trên login form baseline không liên kết label/input. Đã đổi helper sang selector `input[name]` theo setup hiện hữu; 17 scenarios chưa chạy ở lượt đó, không tính là pass.
- Các lượt browser tiếp theo tìm lỗi focus sau full-detail/Back và các lỗi harness: assertion URL không chờ navigation, selector rộng trùng toolbar/route announcer/combobox, chờ request thay vì download, và chờ browser chrome reload trong headless. Sửa đúng nguyên nhân, giữ các assertions sản phẩm; empirical probe xác nhận download thật thành công trước khi sửa selector test.
- **Lượt cuối trên source hoàn chỉnh:** `npm test` đạt **43 files / 288 tests**, 42,18s; `CI=1 npm run test:e2e` đạt **28/28**, 28,3s, không retry. Có admin/restricted/id-hidden/empty-workspace sessions thật, desktop/mobile, lỗi mạng được inject, CSV download, query/saved view/paging, preview 404/stale/retry/history, keyboard/nested focus/sidebar, auth/logout và Kanban.
- **Build production qua** trong webServer command của lượt E2E cuối: build → reset fourty_e2e → boot Next production. `tsc --noEmit` và `git diff --check` qua. Warning dynamic dependency tại `src/lib/otel.ts` thuộc baseline; không bị che hoặc coi là build error.
- **Lint chưa qua:** command baseline `next lint` mở prompt cấu hình ESLint rồi exit1; repository chưa cấu hình lint. Plan yêu cầu ghi lại giới hạn này khi gặp baseline failure. Không cài thêm dependency hoặc viết config ngoài scope để che gate.
- Đã kiểm ảnh desktop1440×960, mobile390×844, preview và mobile filters trên app production thật. Phát hiện và sửa mobile-only Filters bị CSS display override trên desktop và padding input đè search icon; browser assertions đã qua. Screenshots và logs tại thư mục validation tạm.
- `git diff -- drizzle src/db/schema.ts package.json package-lock.json` rỗng: không migration/schema/dependency mới.

## Review đã chốt

Reviewer backend xác nhận RLS/snapshot/CSV và phát hiện selected export cần kiểm quyền đọc `id` trước predicate. Đã thêm test restricted-role và trả403 khi id bị ẩn; reviewer kiểm lại không còn finding.

Review UI phát hiện offset vượt total làm trang trắng, nested CmdK restore focus ra ngoài preview và sidebar R chặn browser reload. Owners đã sửa; reviewer kiểm lại source không còn finding. Concern về explicit-close history được rút lại: open dùng push giữ Back/Forward, explicit close replace chủ đích không hồi sinh preview đã đóng. Browser regression đã xác nhận cả Back/Forward và close deep-link.

Follow-up focus sau full-detail/Back chỉ dùng trigger đang render với ID readable. Reviewer bắt thêm close-order khi Back đóng preview bên dưới CmdK: shared stack chỉ restore từ dialog top, còn client bỏ qua restore khi có modal visible. Review cuối không còn finding mở và E2E cho đúng thứ tự này đã qua. Xem [UI review](./review-261012-sales-crm-ui.md) và [simplify](./code-simplifier-261012-0002-backend-stability.md).

## Giới hạn và bàn giao

Không có scope sản phẩm nào bị cắt hoặc hoãn. Lint baseline chưa có cấu hình; spreadsheet probe chỉ chứng minh lần import với phiên bản đã nêu; benchmark10k là mẫu local, không SLA; offset không cung cấp snapshot xuyên các request. Chưa commit, push hoặc deploy. Khi ship, tách security baseline export/search khỏi UX/query để rollback không khôi phục các đường đọc thiếu policy.

`ak plan status` xác nhận completed, 4/4 phase và19/19 acceptance; `ak plan validate` qua. Các relative links trong owning docs/report đã kiểm tồn tại. [Journal phiên triển khai](../journals/2026-10-12-hon-tt-ci-tin-companies-v-export-theo-sales-crm.md) lưu cục bộ; AgentWiki publish skipped.

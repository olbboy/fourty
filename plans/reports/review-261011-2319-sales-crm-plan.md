# Review kế hoạch học từ sales-crm

Ngày: 2026-10-11. Đối tượng: [kế hoạch Companies-first](../261011-2319-sales-crm-improvements/plan.md), baseline Fourty `24997d2ff6ff72030265788ea966632ea7b0c352`. Đây là review tài liệu trước triển khai; không phải xác nhận code đã được sửa hoặc sản phẩm đã an toàn.

## Kết quả

Ba reviewer độc lập kiểm tra security, failure modes và assumptions. Chín findings (5 High, 4 Medium) đều có bằng chứng từ source và đã được đưa vào điều kiện thực thi. Hai findings snapshot xét hai phạm vi khác nhau: tính nhất quán trong một response và sự thay đổi dữ liệu giữa các request. Không đổi quyết định stack/schema/scope sản phẩm, không yêu cầu thêm dependency.

| Mức | Finding và bằng chứng | Quyết định đã áp dụng |
| --- | --- | --- |
| High | Search mask output vẫn lộ sự tồn tại của record nếu WHERE tìm qua field hidden; `src/app/api/search/route.ts` dùng name/email/domain trước policy | Phase 3 chỉ dùng field readable trong predicate; kiểm từng thành phần title/subtitle, bỏ result không có id/title hợp lệ; test hidden-field-only query và visible-field control |
| High | Nhiều SELECT trong `withWorkspace` không bảo đảm cùng snapshot; `src/db/index.ts` dùng transaction mặc định | Phase 2 yêu cầu một SQL statement cho rows/count/facets, cả trường hợp offset vượt total; không suy ra transaction READ COMMITTED là snapshot xuyên statement |
| High | Revert toàn phase export/search có thể khôi phục route đang thiếu field policy | Tách security commit khỏi query/UX; rollback giữ auth/policy/CSV protection hoặc vô hiệu endpoint không thể phục vụ an toàn |
| High | `playwright.config.ts` cho phép reuse server local, bỏ qua build/reset khi server cũ tồn tại | Phase 4 chạy gate với `CI=1`, kiểm port 3100 và owner trước test; không kill process thuộc người dùng/session khác |
| Medium | Sidebar resize riêng width sẽ lệch main offset; `src/components/shell.tsx` có cả `w-56` và `md:ml-56` | Phase 3 dùng cùng CSS variable cho aside width/main margin, mobile margin 0; browser assertion geometry |
| High | Policy cho phép ẩn cả id/name/updatedAt; `src/app/api/field-permissions/route.ts` nhận field string, `redact` xóa key, kiểu `Company` lại yêu cầu đủ field | Phase 2 thêm DTO đọc partial; không dựng field từ cache; row thiếu id không có hành động, thiếu name/date dùng fallback đã dịch; giữ mutation types và chính sách admin hiện có |
| Medium | Export object permission khác entity permission dù matrix hiện cùng cho các role đọc; `src/lib/permissions.ts` và export route | Phase 1 gọi cả export/read và entity/read; không bịa cấu hình tách quyền để tuyên bố test; kiểm role/API key thật và source guard |
| Medium | Offset + stable sort không tạo snapshot xuyên request khi dataset đổi | Phase 2 chỉ hứa ordering ổn định khi dataset không đổi; ghi rõ drift, replan nếu workload cần cursor/snapshot |
| Medium | E2E dùng admin nên không chứng minh field masking; `e2e/auth.setup.ts` chỉ lưu admin state, admin bypass field policy | Phase 4 tạo restricted fixture trong DB E2E, hash/login thật, storage state riêng; không giả session cookie hoặc thay default admin smoke project |

Reviewer security đã kiểm tra lại Phase 1/3 sau sửa và xác nhận không còn contradiction/blocker trong phạm vi search predicate, export authorization và CSV.

## Các điều kiện bổ sung của controller

- Quy tắc snapshot đối chiếu [PostgreSQL 16](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED): READ COMMITTED lấy snapshot theo statement. Điều kiện một statement tránh đổi isolation chung của ứng dụng.
- CSV có test prefix, whitespace/control/full-width, quote/separator và số âm kiểu number; giữ raw serializer. Theo [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection), hành vi khác nhau giữa spreadsheet và thao tác lưu/mở lại, nên không tuyên bố bảo vệ mọi ứng dụng chỉ từ test serialize. Khi triển khai phải ghi phiên bản và kết quả luồng nhập thực tế.
- `tests/a11y.test.ts` dùng SSR/source scan; hành vi focus trap/restore phải chứng minh ở Playwright. Preview bị loại khỏi list query key để không tự xóa selection khi mở panel.
- `tests/pg-setup.ts` migrate rồi TRUNCATE: gate yêu cầu xác minh DSN runtime/owner cùng DB test riêng, backup trước mutation/reset, không in credential, chạy Vitest/E2E tuần tự.
- Chạy lint thật khi triển khai; nếu baseline lỗi thì báo rõ, không bỏ gate dựa trên phỏng đoán. Tổng effort 8–12 ngày kỹ sư là ước lượng từ bốn phase, chưa có benchmark.

## Validation tài liệu

- `ak plan validate plans/261011-2319-sales-crm-improvements --json`: `valid: true`.
- `ak plan parse ... --json`: 4 phase, 19 acceptance tasks, 0 hoàn tất; plan `pending`, phases `todo`.
- Các file có thể sửa và dependency phase được khai báo; file client dùng chung chỉ sửa tuần tự Phase 2 rồi Phase 3.
- Kiểm tra đường dẫn/link và whitespace thực hiện ở bước kết thúc phiên; kết quả cuối được ghi trong journal cùng phiên.
- Không chạy Vitest, build hoặc E2E vì đây là phiên nghiên cứu/plan và worktree chưa có `node_modules`. Không tạo server, không chạy script từ source tham khảo, không ghi DB.

Không còn câu hỏi bắt buộc để bàn giao plan. Các kết luận hiệu năng, usability, spreadsheet behavior và an toàn end-to-end vẫn chờ kiểm thử khi triển khai; chúng không được coi là đã đạt chỉ vì review tài liệu hoàn tất.

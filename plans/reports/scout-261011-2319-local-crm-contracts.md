# Scout: hợp đồng CRM backend của Fourty

Phạm vi này chỉ đọc backend, schema, AI, CSV/export và test để làm đường biên khi học UI CRM từ repo khác. Không sửa app/DB, không chạy server/migration, không commit.

## Kết luận cần giữ nguyên

Fourty là CRM Postgres đa tenant. UI phải gọi các route server đã có, giữ wrapper/params/kiểu dữ liệu và để server thực hiện RLS, RBAC, field masking, audit, activity, score và workflow. README mô tả các boundary này tại `README.md:15-28`, `README.md:65-75`, `README.md:113-123`; kiến trúc yêu cầu REST route + Drizzle schema/migrations và pure core/injectable edges tại `docs/architecture.md:8-61`.

### Xác thực, tenant và quyền

- `authenticate` nhận session hoặc Bearer API key; API key cố định một workspace/role, session dùng active workspace và membership. Kết quả gồm `workspaceId`, `role`, `callerId`, `viaApiKey` (`src/lib/api.ts:28-89`). Không đưa workspace hoặc role từ state phía client vào request như một nguồn sự thật.
- `withAuth` xác thực, rate-limit, metrics/logging và chạy handler trong `withWorkspace(auth.workspaceId, ...)`, nên các query export nằm trong workspace của caller (`src/lib/api.ts:112-155`). Nó **không tự gọi `authorize`**; `authorize` là lời gọi riêng (`src/lib/api.ts:91-102`). Đây là điểm cần giữ khi học UI: có `withAuth` không đồng nghĩa đã qua object RBAC.
- Shared schema dùng `workspace_id` và RLS với context `app.workspace_id`; ADR yêu cầu mọi đọc/ghi qua helper có workspace context, `ENABLE/FORCE RLS`, và test chống bypass (`docs/adr/001-tenancy-model.md:5-54`). Schema đặt `workspaceId` mặc định từ setting và fail-closed khi thiếu context (`src/db/schema.ts:13-27`).
- RBAC có `admin`, `member`, `viewer`: viewer chỉ đọc CRM; member đọc/ghi CRM; admin có quyền quản trị. `export` và `import` nằm trong tập CRM object (`src/lib/permissions.ts:12-37`, `src/lib/permissions.ts:43-51`; nguyên tắc route matrix tại `docs/adr/005-authz-model.md:5-36`).
- Với contacts/companies/deals, policy được load trong workspace transaction; field bị cấm đọc bị **xóa khỏi JSON**, không đổi thành `null`; field bị cấm ghi bị chặn theo các key caller gửi (`src/lib/field-permissions.ts:4-9`, `src/lib/field-permissions.ts:19-61`, `docs/adr/011-field-level-permissions.md:5-36`). `parseBody` giữ raw top-level keys trước zod defaults để default không bị coi là caller write (`src/lib/api.ts:157-182`). UI không được khôi phục field từ cache/local fixture sau khi server đã redaction.

### Hình dạng dữ liệu và route surface

Các response list dùng object wrapper, không trả mảng trần: `contacts`, `companies`, `deals`, `tasks`; mutation trả `contact`, `company`, `deal`, `task`, `note`, hoặc `{ok:true}` tùy route. Các shape và nullability chính nằm ở `src/lib/types.ts:3-106`; validator và default nằm ở `src/lib/validators.ts:3-73`.

| Surface | Hợp đồng đọc cần bảo toàn | Ghi/chỉnh sửa và side effects |
|---|---|---|
| `/api/contacts` | `q` tìm trên tên ghép/email/jobTitle; `status`, `companyId`; `sort=score\|name\|createdAt\|updatedAt`; `limit` mặc định 200, tối đa 500; trả `{contacts}` (`src/app/api/contacts/route.ts:12-54`). | POST/PATCH/DELETE có `authorize`, zod, field write check và redaction; tạo/sửa ghi activity + audit, recompute score, dispatch workflow; xóa contact xóa notes/activities (`src/app/api/contacts/route.ts:58-97`, `src/app/api/contacts/[id]/route.ts:23-88`). |
| `/api/companies` | `q` trên name/domain/industry, `industry`, `limit` mặc định 200/tối đa 500; sort `updatedAt` giảm dần; trả `{companies}` (`src/app/api/companies/route.ts:11-40`). | Ghi có RBAC/field policy/audit/activity; xóa company detach `companyId` ở contacts/deals rồi xóa notes/activities (`src/app/api/companies/route.ts:44-81`, `src/app/api/companies/[id]/route.ts:21-80`). |
| `/api/deals` | `q`, `stageId`, `pipelineId`, `companyId`, `contactId`; `limit` mặc định 300/tối đa 1000; sort `updatedAt` giảm dần; trả `{deals}` (`src/app/api/deals/route.ts:13-38`). | Tạo chọn pipeline/stage hợp lệ; PATCH không chuyển pipeline, stage phải cùng pipeline, cập nhật `stageEnteredAt`/`closedAt`, ghi activity/audit/workflow và recompute score (`src/app/api/deals/route.ts:41-95`, `src/app/api/deals/[id]/route.ts:23-102`). |
| `/api/tasks` | `state=open\|done\|all` mặc định open, `entityType`, `entityId`; `dueDate` tăng dần, hard limit 500; trả `{tasks}` (`src/app/api/tasks/route.ts:8-28`). | POST/PATCH/DELETE qua RBAC; `completed` đổi `completedAt`, task gắn entity khi hoàn tất ghi activity và dispatch event (`src/app/api/tasks/[id]/route.ts:11-64`). |
| `/api/activities`, `/api/notes` | Activities lọc entity, limit mặc định 50/tối đa 200, `createdAt` giảm dần; notes yêu cầu `entityType` + `entityId`, trả `{activities}`/`{notes}` (`src/app/api/activities/route.ts:9-27`, `src/app/api/notes/route.ts:10-22`). | Ghi qua `authorize`, helper activity/audit; note cũng tạo activity; contact activity có thể recompute score (`src/app/api/activities/route.ts:30-50`, `src/app/api/notes/route.ts:25-46`). |
| `/api/search` | Chỉ có `q`; rỗng trả `{results:[]}`; mỗi loại tối đa 5 contact/company/deal, shape `{type,id,title,subtitle}`; không có page/cursor/sort (`src/app/api/search/route.ts:5-58`). | Đây là read surface để typeahead, không dùng thay list API. Kiểm tra field policy chưa hiện diện trong route này, nên không tự coi search là đủ field masking cho mọi field. |
| `/api/saved-views` | Repo có saved views, không có route `views`; entity là contacts/companies/deals/tasks, config gồm filters/sort/columns tối đa 40; list shared hoặc view cá nhân của caller (`src/app/api/saved-views/route.ts:8-45`). | Tạo/sửa/xóa có RBAC; view cá nhân kiểm owner, shared cho writer; RLS giữ workspace (`src/app/api/saved-views/[id]/route.ts:24-73`, `tests/saved-views.test.ts:52-120`). |

Không có `offset`, `cursor` hoặc `page` trong các core list route; chỉ có các `limit` cap nêu trên. Không tìm thấy bulk mutation route; endpoint batch duy nhất trong scope là CSV contact import. Vì vậy UI học từ demo có pagination client-side hoặc bulk action phải được xem là adapter mới, không được giả định là backend contract hiện có.

### Schema, dates, currency và validation

- Timestamp lưu epoch milliseconds dạng number; `workspaceId` là text; `custom` là JSON text trong DB (`src/db/schema.ts:13-27`, `src/db/schema.ts:154-207`, `src/lib/types.ts:3-106`). `formatDate` dùng epoch millis; input date `YYYY-MM-DD` đổi qua noon local và trả millis (`src/lib/format.ts:3-40`). Deal export lại format `expectedCloseDate`/`closedAt` thành ISO ngày `YYYY-MM-DD` (`src/app/api/export/[entity]/route.ts:22-34`).
- Company `annualRevenue` và deal `amount` là số; deal luôn có `currency` (mặc định USD), pipeline/stage, các ngày đóng/giai đoạn (`src/db/schema.ts:154-207`; validators tại `src/lib/validators.ts:20-47`). Không chuyển sang micros hoặc string trong UI state nếu chưa qua boundary rõ ràng.
- Currency hỗ trợ USD/EUR/GBP/JPY/AUD/CAD/CHF/SGD/INR/VND/BRL/CNY; convert đi qua USD, currency lạ pass-through; `formatMoney` dùng Intl và fallback (`src/lib/currency.ts:7-74`). Các quy tắc này có test, gồm VND scale và round-trip (`tests/currency.test.ts:4-33`).
- Validator giữ các enum/default như contact status `lead|qualified|customer|churned`, task priority `low|medium|high`, activity type `email|call|meeting`, cùng giới hạn body/text (`src/lib/validators.ts:3-73`). UI phải gửi payload hợp lệ và giữ field omitted khác với field gửi explicit.

### Import, mutation semantics và audit

Contact import đọc raw CSV, tối đa 5.000 dòng; authorize `contacts/create`, fuzzy/case-insensitive header, lookup hoặc tạo company, bỏ qua email trùng, chuẩn hóa status, rồi trả `{created,skipped,companiesCreated,total}` (`src/app/api/import/contacts/route.ts:10-108`). Các mutation thường có audit/activity và score/workflow side effects; bỏ qua chúng bằng local state sẽ làm timeline, automation và reporting sai. Audit là immutable và có export riêng đã được test (`tests/audit-log.test.ts:49-75`).

## CSV/export: seam cần bàn giao rõ

### Tenant scope có, object/field authorization chưa có

`src/app/api/export/[entity]/route.ts:5-45` chỉ gọi `withAuth`, rồi `db.select()` contacts/companies/deals và `toCsv`; route không gọi `authorize(auth, "export", "read")`, `loadFieldPolicy` hoặc `redact`. Vì `withAuth` bọc handler bằng `withWorkspace`, các rows export vẫn bị tenant-scoped bởi RLS (`src/lib/api.ts:112-155`), nhưng role/object permission và field masking không được áp dụng. `withAuth` không tự authorize như đã chứng minh ở `src/lib/api.ts:91-102`; do đó đây là bypass parity cần nêu trong phase export, không được nhân bản khi học UI.

Permission matrix có object `export` (`src/lib/permissions.ts:15-34`), nhưng static auth test chỉ bắt buộc `authorize` cho mutating handlers, không buộc GET export (`tests/api-auth.test.ts:121-157`). Tài liệu lại mô tả export cùng field set UI và field-permissions (`docs/guides/import-export.md:21-32`), nên code và docs hiện lệch nhau. Đây là finding đã có bằng chứng; không suy ra rằng mọi API GET khác đều thiếu policy.

### Filter parity và CSV serializer

- Contact UI fetches `q`, `status`, `sort` nhưng export anchor luôn `/api/export/contacts`; company UI fetches `q` nhưng export không truyền query; deal UI lọc pipeline ở client nhưng export anchor vẫn `/api/export/deals` (`src/app/(app)/contacts/contacts-client.tsx:32-39`, `src/app/(app)/contacts/contacts-client.tsx:60-64`, `src/app/(app)/companies/companies-client.tsx:19-24`, `src/app/(app)/companies/companies-client.tsx:37-41`, `src/app/(app)/deals/deals-client.tsx:26-50`, `src/app/(app)/deals/deals-client.tsx:117-120`). Local export hiện xuất toàn bộ rows, không nhận filter/sort/page (`src/app/api/export/[entity]/route.ts:9-35`). Vì vậy “export filtered rows” chưa phải local contract đang chạy.
- Local `src/lib/csv.ts:5-77` parser strip BOM input và serializer quote theo comma/quote/newline, CRLF + trailing newline; serializer không thêm UTF-8 BOM và không neutralize formula prefix. Test chỉ cover RFC quoting/round-trip và BOM input (`tests/csv.test.ts:4-55`), chưa cover formula injection hoặc output BOM. Probe đã được bàn giao: `toCsv(["name","revenue"],[["=1+1",-12]])` trả `name,revenue\r\n=1+1,-12\r\n`.
- Theo probe source/demo do parent cung cấp, `escapeCell` của source prefix `'` cho `/^[=+\-@\t\r]/`, vẫn quote RFC và có UTF-8 BOM; toolbar source export filtered rows. Đây là điểm có thể học ở **export boundary**. Nếu triển khai sau này, giữ `toCsv` raw/import round-trip và giữ số `-12` là số; chỉ thêm spreadsheet-safe mode ở boundary export, kèm test formula/BOM/filter. Report này không triển khai thay đổi.

## AI và MCP contracts

- AI Tier 3 là optional BYO key, off khi chưa cấu hình; deterministic scoring vẫn là Tier 2. Guardrails gồm cùng RLS/RBAC/field permissions/audit, human confirmation và không autonomous agent/mandatory gen-AI (`docs/adr/016-ai-native-strategy.md:1-40`, `docs/adr/016-ai-native-strategy.md:121-142`).
- `/api/ai/chat` intentionally không giữ transaction dài: route tự authenticate, stream SSE, mỗi DB touch dùng workspace transaction ngắn; conversation owner là user hoặc API-key principal, pending write cần decision approve/reject (`src/app/api/ai/chat/route.ts:50-136`, `src/app/api/ai/chat/route.ts:138-227`). UI phải xử lý SSE event/order và không tự thực thi tool proposal.
- Agent dừng trước write, lưu proposal args ở server, atomic claim để chỉ một confirmation thực thi; tool bridge dùng cùng `TOOLS` với MCP, còn mutation thực thi trong `withWorkspace` và field/RBAC/audit path (`src/lib/ai/agent.ts:17-66`, `src/lib/ai/agent.ts:127-194`, `src/lib/ai/tool-bridge.ts:4-14`, `src/mcp/tools.ts:30-70`).
- AI tests khóa các invariant: provider SSE/interleaved tool chunks và generic provider error (`tests/ai-provider.test.ts:54-201`, `tests/ai-hardening.test.ts:25-50`); stop-at-write/confirm-once/viewer-deny/owner isolation (`tests/ai-agent.test.ts:84-240`); atomic sequence, RLS tenant và per-user isolation (`tests/ai-store.test.ts:29-146`); disabled=404, quota, pending=409, API-key thread isolation (`tests/ai-chat-api.test.ts:85-185`).

## Test contract cần bảo toàn khi đổi UI

- Auth/tenant/RBAC/field masking: API key valid/unknown/revoked và static route guards (`tests/api-auth.test.ts:56-157`); cross-workspace read/write/delete + direct RLS/no-context (`tests/tenant-isolation.test.ts:95-195`); role matrix viewer read-only/admin-only objects (`tests/rbac-matrix.test.ts:60-108`); redaction, blocked raw writes, defaults và workspace isolation (`tests/field-permissions.test.ts:72-137`).
- Core integration: contact create/list/read/invalid body và score; deal default pipeline/stage, close behavior, stage transition workflow/activity, invalid stage và missing id (`tests/api-integration.test.ts:46-155`).
- Saved view visibility/filters/ownership/workspace (`tests/saved-views.test.ts:52-120`), CSV parse/quote/BOM-input (`tests/csv.test.ts:4-55`), currency conversion/format (`tests/currency.test.ts:4-33`), SQLite/Twenty migration field types including numeric revenue, EUR và epoch close date (`tests/migrate-from-sqlite.test.ts:97-120`, `tests/twenty-migrate.test.ts:46-80`).
- MCP là integration surface phải giữ nếu UI/AI dùng chung tool: protocol, search/create, viewer deny, RLS, field redaction/write blocking, CRUD deals/tasks/notes và dry-run delete (`tests/mcp.test.ts:41-84`, `tests/mcp.test.ts:119-160`, `tests/mcp.test.ts:166-229`, `tests/mcp.test.ts:254-265`). Custom record validation/CRUD/RLS là surface riêng; ADR-011 không áp field-permission cho custom records (`src/lib/records.ts:9-83`, `tests/custom-objects.test.ts:55-155`, `docs/adr/011-field-level-permissions.md:5-36`).

Chưa thấy test route chuyên biệt cho REST tasks, activities, notes, search hoặc export trong nhóm test đã rà soát; MCP và API integration vẫn cover một phần activity/task/note. Đây là coverage gap cần ghi nhận khi planner tính phase test, không phải bằng chứng rằng các API đó không tồn tại.

## Rủi ro khi mang demo client-only/localStorage vào

Một demo lưu rows/filter/mutation trong client hoặc localStorage không thể thực hiện server guarantees: workspace RLS, API-key workspace binding, role checks, field masking, immutable audit, activity timeline, score recompute, stage/workflow side effects và durable cross-device state. Nó cũng dễ hiển thị lại field đã bị redact, dùng shape cũ (ví dụ `score` có trong route/schema nhưng thiếu trong `Deal` client type tại `src/lib/types.ts:41-74`), coi epoch millis/currency units như string, hoặc làm export khác với tập rows đang lọc. Khi học UI, giữ adapter gọi route và response wrapper; không thay backend contract bằng fixture/localStorage.

## Integration checklist cho planner

1. Map fetch tới các route/params/wrapper ở bảng trên; giữ `Authorization`/session cookie và để server quyết định workspace/role.
2. Render field có thể vắng do `redact`; không dùng `null` giả để khôi phục field. Gửi PATCH/POST chỉ các keys caller thực sự chỉnh.
3. Giữ numeric epoch millis, deal `amount` + `currency`, date input/output conversion và custom JSON shape.
4. Sau mutation, refresh từ server để nhận score, activities, audit/workflow effects; không tự ghi localStorage làm nguồn sự thật.
5. Đối với CSV, coi filtered export + field/object authorization + formula-safe boundary là seam phải giải quyết riêng; không copy nguyên route export hiện tại vào UI mới.

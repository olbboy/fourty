# Báo cáo rà soát mức độ hoàn thiện tính năng — Fourty CRM v2.0.0

- **Ngày:** 2026-08-29 · **Reviewer:** Claude (ak:code-review, chế độ codebase scan, thực hiện tuần tự)
- **Phạm vi:** toàn bộ codebase tại `origin/main` (HEAD `0ba6264`) + đối chiếu bản live https://crm.example.com
- **Câu hỏi:** các tính năng công bố đã *hoàn thiện thực sự* và *chạy thực sự được* chưa?

## Kết luận nhanh (TL;DR)

**Codebase chạy thật, phần lớn tính năng hoàn thiện thật — không phải "hoàn thiện trên giấy".** Bằng chứng thực thi: build production sạch, 678 unit/integration test pass trên Postgres thật (RLS bật), 42/42 e2e Playwright pass (boot server production thật, đi qua wizard → đăng nhập → mọi trang → kéo thả kanban → CRUD settings), bản live đang chạy đúng code mới nhất của `main`.

Điểm trừ tập trung vào một cụm: **6 tính năng có backend + API + test đầy đủ nhưng thiếu UI**, trong đó nặng nhất là **2FA** (không có UI bật, form đăng nhập không có ô nhập mã dù backend đã enforce) và **custom objects** (docs hứa "Define it from Settings" nhưng Settings không có màn đó). Không phát hiện code giả/mock trong sản phẩm, không có TODO/FIXME bỏ dở.

## 1. Phương pháp & bằng chứng thực thi

| Bước | Lệnh | Kết quả |
|---|---|---|
| Type-check + build | `npm run build` (Next.js 16, production) | **PASS** — exit 0, đủ 25 trang + ~50 API route |
| Unit/integration | `npm test` (vitest, Postgres 16 thật, chạy tuần tự từng file) | **678 pass / 0 fail / 3 skip** (54s) |
| Reversibility | `vitest run tests/migration-reversibility.test.ts` | **PASS** — up → down → re-apply toàn chuỗi 18 migration, checksum trùng khớp |
| E2E trình duyệt | `npx playwright test` (build → migrate DB e2e → `next start` → Chromium) | **42/42 PASS** (42s) |
| Live probe (read-only) | `curl` https://crm.example.com | Health OK, auth đúng, đủ bề mặt route v2.0 |

Ghi chú minh bạch: lần chạy vitest đầu báo 1 fail ở `migration-reversibility` — nguyên nhân là **môi trường máy review** (test này đọc `REVTEST_DATABASE_URL` riêng, mặc định port 5432 đang bị Postgres của dự án khác chiếm). Trỏ đúng DSN thì pass. Không phải bug sản phẩm.

3 test skip đều có chủ đích, không phải giấu lỗi:
- `tests/surface-parity.test.ts:382` — "GraphQL task completion — no task mutations exist yet (backlog #10)" (gap được ghi nhận công khai, xem Finding 3)
- `tests/surface-parity.test.ts:384` — "MCP task completion — no tool completes a task" (nt.)
- `tests/ds-cards.test.ts:33` — `skipIf(!HAS_BUNDLE)`: cần bundle design-system tùy chọn, không liên quan runtime sản phẩm

## 2. Đối chiếu bản live https://crm.example.com

| Probe | Kết quả | Ý nghĩa |
|---|---|---|
| `GET /` | 307 → `/login` | Middleware auth hoạt động |
| `GET /api/health` | 200 `{"status":"ok"}` | App + DB sống |
| `GET /login`, `/forgot`, `/accept` | 200 | **Live có cả các tính năng mới nhất** (forgot-password, invite-accept vừa merge) → live = main hiện tại |
| `GET /api/contacts`, `/api/facts`, `/api/agent-tasks`, `/api/ai/conversations`, `/api/saved-views`, `/api/custom-objects` | 401 (không phải 404) | Đủ bề mặt API v2.0, auth enforce đúng |
| `POST /api/graphql` không auth | 401; `GET` → 405 | Đúng thiết kế |
| `GET /api/metrics` | 200 công khai | Đúng thiết kế đã ghi trong code (chỉ số liệu tổng hợp, không PII) — xem Observation O1 |

Counter trên metrics gần như bằng 0 và không có gauge queue-depth → instance mới restart / traffic thấp, chưa có job nào enqueue từ lúc đó (`queueDepths()` trả `{}` khi boss chưa khởi động — [queue.ts:243](src/lib/queue.ts)). **Không thể xác minh từ bên ngoài việc container `worker` có đang chạy trên live hay không** — xem mục "Việc người vận hành cần tự xác minh".

## 3. Ma trận tính năng: công bố vs. thực tế

Trạng thái: ✅ hoàn thiện & chạy được (có bằng chứng) · 🟡 backend hoàn thiện, thiếu UI · ⚠️ có caveat.

| # | Tính năng (README/docs) | Trạng thái | Bằng chứng chính |
|---|---|---|---|
| 1 | Core CRM: Contacts, Companies, Deals, Tasks, Notes + timeline, list view (search/filter/sort), detail page | ✅ | e2e `views.spec` (9 trang + 3 detail), `record-detail.spec`, vitest `api-integration`, `delete-semantics` |
| 2 | Kanban pipeline: drag-drop optimistic, tổng theo cột, forecast theo xác suất | ✅ | e2e `kanban.spec` (kéo thả thật trên Chromium), `motion.spec` |
| 3 | Đa tiền tệ 12 loại, quy về USD | ✅⚠️ | [currency.ts:25-38](src/lib/currency.ts) đúng 12; tỷ giá là **hằng số tĩnh** (O3) |
| 4 | Lead scoring 0–100 cho contact | ✅ | `scoring.ts` + `ScoreBadge` hiển thị ở list + detail + sort; vitest `scoring` |
| 5 | Deal scoring | 🟡 | Tính + lưu thật ([deal-score.ts:55](src/lib/services/deal-score.ts)), lộ qua REST/MCP; **UI deals không hiển thị** (F6) |
| 6 | Dashboard analytics (pipeline, forecast, win rate, cycle, funnel, hottest leads, stale deals) | ✅ | `stats.ts` tính từ dữ liệu thật; e2e dashboard stands-up; vitest `metrics` |
| 7 | Reports (win/loss theo tháng, source conversion, aging, temperature, lifecycle) | ✅ | `computeReportStats` + `reports-client` + e2e |
| 8 | Workflow automation: visual builder, 8 trigger, 9 toán tử điều kiện, **6 action types**, template variables, retry/backoff, dead-letter, run history | ✅ | [types.ts:28-37](src/lib/workflows/types.ts) đúng 6 action; engine đủ 6 case; pg-boss + idempotency ledger (`job_receipts`); e2e builder; UI run-history có thật; vitest `engine`, `worker` |
| 9 | Keyless research (đọc mailbox → điền title/company, evidence, revert 1 click) | ✅ | `research/` (signature parser thuần, bias-against-extracting), `facts/` (evidence, write-path không đè giá trị người gõ), e2e `fact-suggestions.spec` + `agent-panel.spec`; vitest `research-*`, `facts-*` |
| 10 | Background work ledger (agent_tasks) | ✅ | schema + `agent-tasks/claim,schedule` + dispatch tick; vitest `agent-tasks-*`; e2e agent-panel |
| 11 | Mailbox sync: Gmail (OAuth2+PKCE), Microsoft Graph, ICS calendar | ✅⚠️ | Code thật gọi Gmail API/Graph ([fetch-mail.ts](src/lib/sync/fetch-mail.ts)), token refresh, transaction ngắn; creds mã hóa AES-256-GCM + rekey; e2e ICS lifecycle. **Chưa kiểm chứng với provider thật** trong review này (cần OAuth env + mailbox thật) |
| 12 | REST API + API keys (SHA-256, revoke) | ✅ | `api.ts` dual-auth; vitest `api-auth`; e2e settings row controls |
| 13 | GraphQL typed | ✅⚠️ | Schema 578 dòng, đủ query/mutation cho contacts/companies/custom records; **thiếu task mutations** (F3, skip test ghi rõ backlog #10) |
| 14 | MCP server **26 tools**, stdio + HTTP | ✅⚠️ | Đếm đúng 26 ([tools.ts](src/mcp/tools.ts)); vitest `mcp`, `mcp-neighbours`; **không có tool complete task** (F3) |
| 15 | Signed webhooks (HMAC-SHA256) + SSRF protection | ✅ | `webhook-sign.ts`; [net.ts](src/lib/net.ts) chặn private/loopback/link-local/CGNAT, ghi rõ giới hạn DNS-rebinding; worker deliver + retry; secret quản trị **API-only** (F5) |
| 16 | AI assistant BYO-key (chat per-record/global, đề xuất write phải confirm, tắt mặc định) | ✅⚠️ | Provider OpenAI-compatible streaming tự viết, agent + tool-bridge + quota + SSE; 8 file test AI pass; gate `AI_API_KEY`. **Chưa kiểm chứng với LLM provider thật** |
| 17 | Custom fields (6 kiểu, forms + detail + API) | ✅ | Settings UI + `CustomFieldsInputs/Display` + vitest |
| 18 | Custom objects "no-code… Define from Settings" | 🟡 | REST/GraphQL/MCP + validation + RLS đầy đủ (vitest `custom-objects`); **không có UI định nghĩa/quản lý** — docs hứa quá (F2) |
| 19 | Multi-tenant RLS | ✅ | 24 policy (`0002_rls.sql`) + 6 (`0004`); vitest `tenant-isolation`, `rbac-matrix` chạy bằng role `fourty_app` chịu RLS thật |
| 20 | RBAC admin/member/viewer | ✅ | `permissions.ts` + ma trận test |
| 21 | Field-level permissions | 🟡 | Backend enforce + vitest `field-permissions`; **không có UI quản trị** (F4b) |
| 22 | Immutable audit log | 🟡 | Ghi thật + RLS + vitest `audit-log`; **không có UI xem** (F4a) |
| 23 | 2FA TOTP + backup codes | 🟡 **nặng nhất** | Crypto chuẩn RFC (test vector), login route enforce; **không có UI enroll, login form không xử lý `requires2fa`** (F1) |
| 24 | SSO OIDC (PKCE, JWKS/RS256, JIT provisioning) | ✅ | Full flow + Settings UI; e2e "adds, edits, disables and deletes an OIDC provider" |
| 25 | Members + invite qua email + trang accept | ✅ | e2e `invite-accept.spec`; mail qua queue `mail.send` (cần worker + SMTP — xem mục vận hành) |
| 26 | Forgot/reset password + script CLI cứu locked-out | ✅ | e2e `forgot-password.spec`; vitest `password-reset-flow`, `reset-password` |
| 27 | CSV import (fuzzy header, dedupe, auto-link company) / export | ✅ | Import UI + vitest `csv`; export nút thật ở contacts/companies/deals |
| 28 | ⌘K command palette | ✅ | e2e `command-palette.spec` |
| 29 | Saved views (filter+sort+columns, tôn trọng field-permissions) | ✅ | component + `/api/saved-views` + vitest + e2e |
| 30 | Dark mode + PWA | ✅ | `theme-provider`, `manifest.ts` (build ra `/manifest.webmanifest`) |
| 31 | i18n EN + VI | ✅ | 2 locale + Settings Language + vitest `i18n` |
| 32 | Diagnostics + Prometheus metrics | ✅ | e2e diagnostics; `/api/metrics` (O1) |
| 33 | Docker compose 1 lệnh (app + worker + postgres) | ✅⚠️ | Compose đầy đủ 3 service; review này không chạy docker build, nhưng e2e đã boot server production từ source — rủi ro còn lại thấp |
| 34 | Migrations thuận nghịch | ✅ | Chứng minh bằng test trên Postgres thật |

**Không tìm thấy:** code giả/mock trong sản phẩm (mọi "fake/stub" đều là test seam DI), TODO/FIXME bỏ dở, nút chết trỏ vào API không tồn tại.

## 4. Findings (xếp theo mức độ)

### F1 — MEDIUM · 2FA không dùng được từ giao diện, dù backend hoàn chỉnh và được quảng bá

- **Vì sao là vấn đề:** README + key-features bán "2FA/TOTP" như tính năng Enterprise Security. Thực tế backend enforce thật ([login/route.ts:45-58](src/app/api/auth/login/route.ts)) nhưng: (a) không màn hình Settings nào cho enroll (không component nào tham chiếu `api/2fa`); (b) [login-form.tsx](src/app/login/login-form.tsx) chỉ có email + password, nhận `requires2fa: true` thì chỉ hiện chuỗi lỗi "Two-factor code required", **không có ô nhập mã**. ADR-012 ghi rõ ý định "*so the client prompts*" — phần client chưa được làm.
- **Hệ quả thực tế:** user bật 2FA qua API sẽ không đăng nhập được bằng UI (thoát hiểm duy nhất: POST `/api/auth/login` kèm `token` bằng curl để lấy cookie). Không ai bật được 2FA một cách "no-code".
- **Đề xuất:** thêm bước nhập mã ở login form khi nhận `requires2fa` + section enroll trong Settings; hoặc sửa README/docs ghi rõ "2FA qua API".

### F2 — MEDIUM · Custom objects: docs hứa UI không tồn tại

- [docs/guides/custom-objects.md:19](docs/guides/custom-objects.md): "*Define it from Settings with its own fields*" — Settings chỉ có UI cho custom **fields** trên 3 object có sẵn; định nghĩa custom **object** chỉ làm được qua `POST /api/custom-objects`. UI duy nhất nhắc tới là 1 dòng text trỏ API ([settings-client.tsx:56](src/app/(app)/settings/settings-client.tsx)). README "no-code custom objects… instantly available in forms, detail pages" cũng quá lời ở vế UI (không có form/detail page cho custom records trong web app — chỉ REST/GraphQL/MCP).
- **Đề xuất:** sửa docs về đúng "API-first" (rẻ nhất), hoặc bổ sung UI quản trị object + màn list/record generic.

### F3 — LOW · Task chưa đủ parity trên GraphQL/MCP (gap có chủ đích, đã ghi nhận)

- GraphQL không có mutation nào cho tasks; MCP chỉ `create_task`/`list_tasks`, không complete/update. Được chính suite ghi nhận bằng 2 test skip ([surface-parity.test.ts:382-384](tests/surface-parity.test.ts), "backlog #10"). Claim "every object accessible from every surface" cần caveat này.

### F4 — LOW · Cụm tính năng quản trị "API-only" (không có UI): (a) audit log viewer, (b) field-permissions, (c) webhook signing secret

- `/api/audit`, `/api/field-permissions`, `/api/webhooks/secret` đều hoạt động, có test; không component nào gọi chúng. Chấp nhận được với sản phẩm self-host API-first, nhưng nên ghi rõ trong docs từng tính năng là API-only để khỏi lệch kỳ vọng.

### F5 — LOW · Deal score tính và lưu nhưng không hiển thị đâu cả trong web UI

- [deal-score.ts](src/lib/services/deal-score.ts) recompute mỗi lần ghi deal, lộ qua REST/MCP; UI deals (list, kanban, detail) không render. Hoặc hiển thị (1 badge như contact), hoặc đừng tính để đỡ tốn write — hiện tại là "tính năng vô hình".

## 5. Observations (không phải bug — quyết định có chủ đích hoặc nits)

- **O1** · `/api/metrics` công khai là quyết định ghi rõ trong code ([metrics/route.ts:6-9](src/app/api/metrics/route.ts)): chỉ counter/histogram tổng hợp + pool/queue gauge, không PII — đã xác nhận trên live. Khuyến nghị: chặn ở tầng Cloudflare/nginx nếu không muốn lộ tên route + nhịp traffic.
- **O2** · Chuỗi copy [workflows-client.tsx:73](src/app/(app)/workflows/workflows-client.tsx) "*runs instantly in-process*" mâu thuẫn nhẹ với thực tế production (pg-boss + worker riêng; inline chỉ là driver dev/test).
- **O3** · Tỷ giá 12 currency là hằng số tĩnh trong code — "auto-USD" nghĩa là quy đổi theo tham chiếu cố định, không phải tỷ giá sống.
- **O4** · `stats.ts` load nguyên bảng vào memory để tính — đúng với scale benchmark 10k rows đã công bố; cần xem lại nếu vượt xa mốc đó.
- **O5** · Suite vitest phụ thuộc port 5432 mặc định cho test reversibility (`REVTEST_DATABASE_URL` phải set riêng khi 5432 bận) — nit DX, đã có escape hatch.

## 6. Việc người vận hành cần tự xác minh trên live (ngoài tầm review từ bên ngoài)

1. **Container `worker` có đang chạy?** Invite email, forgot-password email, webhook, workflow action, research pass đều đi qua pg-boss — app không có worker thì job nằm queue vĩnh viễn. Check: `docker compose ps`, hoặc sau 1 thao tác tạo invite xem `/api/metrics` có `fourty_queue_depth` tăng rồi về 0 không.
2. **SMTP/MAIL đã cấu hình?** (`SMTP_HOST`… hoặc HTTPS transport) — không có thì mail âm thầm no-op.
3. **`FOURTY_SECRET_KEY` đã set?** — bắt buộc để connect mailbox (v2.0 breaking change).
4. Các tích hợp ngoài (Gmail/Microsoft OAuth, AI provider, IdP OIDC) hoạt động với credential thật — test trong repo dùng fake injection (đúng chuẩn), review này không thể xác minh hộ.

## 7. Key Takeaways

- **Đây là codebase "thật":** mọi claim marketing lớn đều truy được xuống code chạy được, với 720 test tự động pass trên hạ tầng thật (Postgres RLS + Chromium). Điều hiếm: các giới hạn được chính tác giả ghi thẳng vào code/ADR/test-skip thay vì giấu.
- **Khoảng cách còn lại không phải "code dở" mà là "UI chưa theo kịp backend"** ở nhóm tính năng enterprise: 2FA (nặng nhất), custom objects, audit viewer, field-permissions, webhook secret, deal score.
- **Bản live = main mới nhất** và khỏe (health, auth, đủ route). Rủi ro live còn lại nằm ở cấu hình vận hành (worker/SMTP/secret key) — không kiểm được từ ngoài, có checklist ở mục 6.
- Bài học tái dùng: khi review "tính năng đã xong chưa", đừng tin diff/README — chạy build + suite trên hạ tầng thật, đối chiếu từng claim với UI wiring, và grep những API không có ai gọi.

## Câu hỏi chưa giải quyết

1. Live có đang chạy container `worker` + SMTP không? (cần quyền vận hành để trả lời — mục 6)
2. 2FA và custom objects: chủ đích của anh là "API-first, UI sau" hay muốn bổ sung UI ngay? Quyết định này đổi hướng xử lý F1/F2 (sửa docs vs. build UI).
3. `/api/metrics` công khai giữ nguyên hay chặn ở Cloudflare?

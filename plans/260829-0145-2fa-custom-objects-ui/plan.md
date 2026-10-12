# Plan: UI cho 2FA và Custom Objects

Trạng thái: review-applied · Nguồn: findings F1/F2 của báo cáo `plans/reports/code-review-260829-0125-codebase-feature-completeness.md`, user chấp thuận hướng "build UI".

## Code-reviewer findings đã xử lý (subagent độc lập, effort max)
- [x] #1 CRITICAL stored-XSS: url field render `<a href>` không kiểm scheme (đường tấn công: member đổi type field text→url qua API, record cũ không revalidate). Fix: `isSafeHttpUrl()` guard tại render trong records-client (defense-in-depth, không tin field type).
- [x] #2 IMPORTANT date off-by-one (UTC âm): fix gọn trong records-client `save()` — convert YYYY-MM-DD→epoch bằng `fromDateInputValue` (noon-local). Không đụng shared `CustomFieldsInputs` → contacts không ảnh hưởng. Thêm e2e assert round-trip `toHaveValue("2026-08-29")`.
- [x] #3 IMPORTANT stale error rò ra ngoài modal 2FA: clear `error` ở mọi handler đóng (enroll onClose/Cancel, disable onClose/Cancel).
- [x] #4 MINOR qrMatrix throw (email dài) crash Settings: try/catch trong QrCode → fallback text "add key by hand".
- [x] #6 MINOR beginEnroll thiếu busy-guard: thêm guard + `disabled={busy}`.
- [x] #5 MINOR (không sửa code, chỉ đúng lại comment): budget POST login e2e 8/10; ghi rõ caveat CI-retry.
- [x] #7 MINOR (không sửa, có lý do): custom-objects thiếu busy-guard/res.ok — giống hệt pattern sibling `custom-fields.tsx`, giữ để nhất quán convention.
- [x] Bonus: sửa latent strict-mode trong custom-objects.spec (2 nút "New …" khi list rỗng: header + EmptyState) → `.first()`.
- Backend gap ghi nhận (ngoài scope, không đụng): `PATCH /fields/{id}` đổi type không revalidate customRecords — fix render-time đã đóng XSS thực tế; revalidate backend là defense sâu hơn, để user quyết.

## Hợp đồng brainstorm

- **Outcome:** (1) 2FA dùng được trọn vẹn từ web UI — enroll trong Settings (QR + manual key → verify code đầu → hiện 10 backup codes một lần), disable bằng password; form đăng nhập hỏi mã khi tài khoản bật 2FA. (2) Custom objects dùng được từ web UI — định nghĩa object + fields trong Settings; trang records generic per-object (list + create/edit/delete); sidebar liệt kê objects đã định nghĩa.
- **Constraints:** không thêm runtime dependency (QR encoder tự viết, pure, có test đối chứng); chỉ dùng API sẵn có (UI thuần bổ sung, không đổi public contract); khớp convention repo (sections Card p-4, Modal/Field/useConfirm, English UI text, i18n key cho nav, data-testid cho e2e, a11y label mọi control); RBAC tôn trọng qua hành vi API sẵn (403 hiển thị lỗi).
- **Non-goals:** WebAuthn/SMS; icon picker cho object; detail page + timeline cho custom records; field-permissions/audit/webhook-secret UI; đổi backend.
- **Acceptance criteria:**
  1. Settings có "Two-factor authentication": enable flow ra QR quét được (encoder đối chứng bit-for-bit với thư viện tham chiếu) + key thủ công; mã đúng → 10 backup codes hiện đúng một lần; disable đòi password.
  2. Login với tài khoản bật 2FA: bước nhập mã xuất hiện; TOTP hợp lệ hoặc backup code vào được dashboard; mã sai báo "Invalid two-factor code".
  3. Settings có "Custom objects": tạo object (singular/plural/api name/description), thêm/xóa field (6 kiểu, options cho select, required), xóa object (confirm, nêu hệ quả xóa records).
  4. `/objects/{apiName}`: bảng records theo field defs; tạo/sửa/xóa record qua modal dùng lại `CustomFieldsInputs`; lỗi validation server hiển thị.
  5. Sidebar nhóm "Objects" liệt kê objects, cập nhật khi tạo/xóa (custom event), active-state đúng.
  6. Bằng chứng: `npm run build` PASS; vitest PASS (thêm `tests/qr.test.ts`, mở rộng `tests/a11y.test.ts`); e2e PASS (thêm `two-factor.spec.ts`, `custom-objects.spec.ts`); không regression suite cũ.

## Phases

- [x] P1 — `src/lib/qr.ts` + `tests/qr.test.ts` — 24/24 vector đối chứng python-qrcode khớp bit-for-bit (v1/v3/v8 × 8 mask); 1 bug RS (thứ tự hệ số generator poly) bị bắt bởi đối chứng và đã sửa
- [x] P2 — 2FA UI: `security.tsx` (enroll QR+key → verify → backup codes; disable bằng password) + đăng ký section + bước `Two-factor code` trong login-form (phân biệt requires2fa lần đầu vs mã sai)
- [x] P3 — `custom-objects.tsx`: list/create/delete object + modal fields (add/required/select options/delete, nút Done) + event `fourty:objects-changed`
- [x] P4 — `/objects/[object]` page + records-client (bảng theo field defs, tái dùng `CustomFieldsInputs`, date epoch↔YYYY-MM-DD, lỗi validate server hiển thị) + `NavObjects` sidebar + i18n `nav.objects` en/vi
- [x] P5 — a11y: +3 render tests (bắt 1 lỗi thật: chữ `<input` trong comment bị scanner quét — đổi từ ngữ); e2e `two-factor.spec.ts` (3 test: enroll/login TOTP+backup/spent-code+disable) + `custom-objects.spec.ts` (1 flow trọn: define→fields→sidebar→records CRUD→cleanup)
- [x] P6 — CHANGELOG [Unreleased] 2 mục Added; operations.md ghi nơi enroll 2FA; guide custom-objects thêm "A page of its own"
- [x] P7 — Verify: build ✅; full vitest **711 pass/0 fail**; full e2e **47/47 pass** (42 cũ + 5 mới). Debug đáng ghi: 2 test 2FA fail vì `browser.newContext()` trong @playwright/test **thừa hưởng `use.storageState` của project** → context "sạch" vẫn mang session admin → /login redirect dashboard (chứng minh bằng network trace: GET /login đầu tiên đã mang cookie `fourty_session`); fix bằng `test.use({ storageState: {cookies:[],origins:[]} })`; đồng thời cắt ngân sách POST login còn 6 để nằm dưới rate-limit 10/IP/15'. Custom-objects fail strict-mode `getByLabel("Label")` (đụng "Key (…from label)") → exact:true. Code-reviewer subagent: đang chạy.

## Rủi ro & rollback

- QR sai → không quét được: chặn bằng fixture đối chứng bit-for-bit; nếu không dựng được venv tham chiếu thì dùng vector công khai (thonky) + kiểm bất biến; manual key luôn là đường dự phòng trong UI.
- e2e 2FA làm bẩn state user chung: spec tự bật rồi tắt 2FA trong cùng file (workers=1, tuần tự) — kết thúc file trạng thái trở về ban đầu.
- Sidebar fetch thêm 1 request/lần mount: chấp nhận (nhẹ, cache trình duyệt không cần) — event `fourty:objects-changed` tránh stale sau CRUD.
- Rollback: các file mới độc lập; revert = xóa file mới + 3 diff nhỏ (settings-client, login-form, app-sidebar, i18n).

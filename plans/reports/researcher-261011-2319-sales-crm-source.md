# Nghiên cứu nguồn `kargulstudio/sales-crm`

Ngày khảo sát: 2026-10-11 (Asia/Saigon). Phạm vi là GitHub API và các trang/raw file GitHub ở chế độ đọc; không clone, cài dependency, chạy mã hay build repository. Mọi kết luận về `main` dưới đây đều ghim tại commit `2bb85561794d21d2af67aa7c366f40ec1ef961ee`.

## Kết luận dùng cho Fourty

`sales-crm` trên `main` là một frontend CRM demo/prototype có giá trị tham khảo về bố cục, bảng dữ liệu và tương tác UI. Nó chưa phải backend CRM dùng chung: dữ liệu công ty được seed trong TypeScript, Zustand giữ state trong browser memory, và cây `app/` không có API route, schema, migration hay adapter database. Vì vậy nên học các pattern UI và cách tổ chức feature, còn Fourty cần giữ Postgres/Drizzle, RLS/RBAC và field permissions của chính mình.

## Manifest và provenance

| Mục | Bằng chứng tại SHA ghim |
|---|---|
| Repo/nhánh | [`kargulstudio/sales-crm`](https://github.com/kargulstudio/sales-crm/tree/2bb85561794d21d2af67aa7c366f40ec1ef961ee), default branch `main` |
| HEAD | [`2bb85561794d21d2af67aa7c366f40ec1ef961ee`](https://github.com/kargulstudio/sales-crm/commit/2bb85561794d21d2af67aa7c366f40ec1ef961ee), commit ngày 2026-10-06 06:41:53Z |
| HEAD thay đổi gì | Chỉ thêm `LICENSE` và đổi `package.json` từ tên `kargul-starter` sang `sales-crm`, thêm license; commit API xác nhận chỉ có 2 file thay đổi |
| Lịch sử | Initial commit ngày 2026-09-13 có 12,673 dòng; HEAD có 20 commits theo GitHub UI. Repo được tạo 2026-10-04 theo API |
| Releases/tags | GitHub Releases API trả danh sách rỗng; branch `main` không protected và không có tag/release được khảo sát |
| Cây nguồn | 369 entry (301 blob, 68 tree), không bị tree API truncate. Root gồm `app/`, `components/`, `data/`, `hooks/`, `lib/`, `stores/`, `public/`, `scripts/` và nhiều tài liệu/skill build |

## Mục đích và stack thực tế

README tự mô tả đây là “Kargul Starter”, một boilerplate Next.js 16 + React 19 + Tailwind CSS 4, với lệnh dev/build/start/lint và các script xử lý AVIF/Rive. [`package.json`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/package.json) xác nhận `next ^16.3.0`, `react ^19.2.8`, Tailwind 4, Zustand, Radix UI, cmdk, Motion, Rive, Lottie, PhotoSwipe, Swiper và các thư viện hiển thị khác; có 17 runtime dependencies và 13 dev dependencies. Đây là stack UI giàu tương tác hơn một CRM backend tối giản.

Cây file có 86 entry dưới `public/`, gồm avatar và logo công ty SVG, cùng nhiều component UI trong `components/_ui/`. [`next.config.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/next.config.ts) chỉ cấu hình ảnh (có remote host `api.builder.io`) và SVGR/Turbopack cho SVG; không cấu hình database, auth, runtime server hay worker. Các script trong `scripts/` chỉ phục vụ poster/AVIF/Rive.

README/metadata còn dấu vết starter rõ ràng: README nói phải đọc `CONVENTIONS.md` và `OPTIMIZATION.md`, `CLAUDE.md` cũng tham chiếu `CONVENTIONS.md`, nhưng các file đó không có trong cây tại SHA này. README vẫn ghi “Kargul Starter”, trong khi package đã đổi tên thành `sales-crm`. [`lib/seo.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/lib/seo.ts) dùng fallback `https://example.com`, route duy nhất là `/`, và description là “Company pipeline for the sales team.” Đây là setup demo/starter cần thay trước khi coi là sản phẩm triển khai.

## Bằng chứng prototype frontend, không phải CRM backend

1. [`app/page.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/app/page.tsx) chỉ render `Sidebar` và `Companies`; [`app/`](https://github.com/kargulstudio/sales-crm/tree/2bb85561794d21d2af67aa7c366f40ec1ef961ee/app) chỉ có page/layout và các route SEO (`robots`, `sitemap`, `llms.txt`), không có `/api`.
2. [`data/companies.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/data/companies.ts) định nghĩa toàn bộ owner, segment, stage, trend, 18 company records, pipeline value và interaction dates dưới dạng hằng TypeScript. Các tên như LVMH, Disney, Apple, Microsoft… là demo data; không có truy vấn hoặc client database.
3. [`stores/companies-store.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/stores/companies-store.ts) khởi tạo `companies: COMPANIES`, state bằng Zustand; `addCompany` chỉ prepend vào state rồi đóng dialog. Không có persistence, request, transaction, tenant/account boundary hay audit log.
4. [`components/companies/new-company/new-company-dialog.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/components/companies/new-company/new-company-dialog.tsx) tạo `id` bằng `Date.now()`, tính các giá trị ở client rồi gọi `addCompany`. Refresh hoặc mở browser khác sẽ không thấy bản ghi mới.
5. [`lib/companies.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/lib/companies.ts) lọc/sort/CSV bằng hàm thuần trên mảng và đặt `TODAY = "2026-09-14"`; các health/activity score là công thức demo từ `winProbability`/`openDeals`, không phải dữ liệu event-sourced hay số liệu database.
6. Vấn đề này đã được cộng đồng nêu trực tiếp trong [Issue #2 “Real Database Integration”](https://github.com/kargulstudio/sales-crm/issues/2), yêu cầu PostgreSQL, self-hosting/Dockerfile và env vars. [PR #5](https://github.com/kargulstudio/sales-crm/pull/5) mô tả một nhánh Cloudflare D1 backend nhưng vẫn đang mở, nên không phải behavior của `main`.

Hai PR khác củng cố cách đọc này nhưng phải giữ đúng provenance: [PR #4](https://github.com/kargulstudio/sales-crm/pull/4) là nhánh mở mở rộng Deals/Forecast/Contacts/Sequences/Teams/Reports/Pipelines với “demo data” và checks được tác giả mô tả; [PR #13](https://github.com/kargulstudio/sales-crm/pull/13) là nhánh mở thêm MCP/CLI/HTTP API và file store. Cả hai chưa được merge vào SHA khảo sát, nên không được xem là tính năng sẵn có của `main`.

## Độ chín và hoạt động cộng đồng

GitHub API tại thời điểm khảo sát trả 1,696 stars, 372 forks, 12 open issues, TypeScript là ngôn ngữ chính; GitHub page hiển thị 3 issues và 9 pull requests đang mở. Các con số này chỉ cho thấy mức chú ý, không chứng minh chất lượng hay production readiness. Lịch sử rất ngắn (repo tạo 2026-10-04, HEAD 2026-10-06), API contributors liệt kê `vipulkumar-dev` 19 contributions và `kargulstudio` 1. Không có release/tag để làm mốc ổn định.

Audit coverage ở SHA ghim còn mỏng:

- Không tìm thấy file test/spec, Playwright/Cypress/Vitest/Jest, thư mục `tests`/`__tests__` hay test script trong `package.json`.
- Không có `.github/` hoặc workflow CI; README chỉ liệt kê lệnh lint/build, không có kết quả CI có thể kiểm chứng trên `main`.
- Branch `main` không protected theo branch API.
- Có `.gitignore` cho `node_modules`, build output, env files và Vercel; đây là hygiene cơ bản, không phải cơ chế vận hành production.
- [`.mcp.json`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/.mcp.json) chỉ khai báo Supabase MCP endpoint theo `project_ref`; việc có cấu hình MCP/skill Supabase không đồng nghĩa app đã có Supabase/Postgres integration.

Những tín hiệu tích cực là code TypeScript strict, có lint script, component boundaries khá rõ (`app`, `components`, `data`, `lib`, `stores`) và commit history cho thấy nhiều vòng tinh chỉnh UI (filter, command menu, responsive table, accessibility). Những tín hiệu rủi ro là starter leftovers, thiếu test/CI/release, chỉ có state client, và nhịp phát triển còn quá mới để đánh giá độ ổn định hoặc compatibility.

## License và attribution

[`LICENSE`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/LICENSE) là MIT, copyright `(c) 2026 Kargul Studio`; `package.json` cũng ghi `"license": "MIT"`. Khi adapt code từ SHA này, giữ file LICENSE và copyright notice trong bản phân phối theo điều kiện MIT. Đây là ghi nhận provenance cụ thể, không phải tư vấn pháp lý.

Không thấy attribution của bên thứ ba trong README tại SHA ghim. PR #4 nói các contact icons trên nhánh của PR lấy từ Solar Icons (CC BY 4.0) và được credit trong README của nhánh đó; vì PR chưa merge và các file đó không thuộc `main` hiện tại, nếu lấy code/assets từ PR thì cần kiểm tra đúng branch và giữ attribution tương ứng. Logo/avatar trong `public/` và các package asset không có bảng license riêng trong root; Fourty nên lập inventory license riêng khi sao chép asset, không suy ra rằng MIT của repo bao phủ tài sản bên thứ ba.

## Điều đáng học cho Fourty

| Xếp hạng | Pattern có thể adapt | Lợi ích cho Fourty | Điều kiện/giới hạn |
|---|---|---|---|
| 1 | Tách `data`/`lib`/`stores` khỏi component UI; `filterCompanies`, `companiesCsvRows`, `splitTags` là helper nhỏ, dễ đọc | Giữ được UI logic có thể kiểm thử và thay data source sau này | Chuyển helper sang domain/server boundary; không để client state là source of truth |
| 2 | Bảng Companies: filter/sort, selection, detail/profile drawer, command menu, CSV export | Tốt cho trải nghiệm account list và thao tác nhanh | Fourty cần server pagination, authorization và query có index; không dùng mảng client để thay RLS |
| 3 | Form New Company với validation, accessible labels, focus lỗi, typed enums cho segment/stage | Làm cơ sở cho form CRM nhất quán | Validation và permission phải lặp lại ở server; `Date.now()` client không đủ làm identity |
| 4 | Component primitives nhỏ và token hóa Tailwind (`Button`, `Dialog`, `Table`, `Field`, `Select`) | Phù hợp bối cảnh Fourty không dùng component library ngoài | Cần rà soát bundle/runtime deps; repo này có tới 17 runtime deps và dùng nhiều asset animation |
| 5 | Từ các PR chưa merge: operation registry/API hoặc D1 adapter cho persistence | Gợi ý hướng mở rộng agent/API và adapter store | Chỉ xem như design input; PR mở chưa review/merge, chưa phù hợp để bê nguyên vào Postgres + RLS/RBAC |

Về kiến trúc Fourty, lựa chọn xếp hạng là **adapt UI/domain presentation, giữ nguyên backend Fourty**. Không nên đưa `COMPANIES`/Zustand làm nguồn dữ liệu thật; dùng Drizzle repository/server actions hoặc route handlers, kiểm tra workspace/role/field permissions tại server và để client store chỉ giữ view state (selection, open panel, filter draft). Đây là kết luận từ bằng chứng nguồn và bối cảnh Fourty, không phải tuyên bố rằng mọi UI pattern trong repo đã production-proven.

## Giới hạn khảo sát

- Không chạy app, build, lint, browser demo, dependency audit hay benchmark; các claim “tsc/eslint clean”, mobile checked và validation trong PR chỉ là nội dung do tác giả PR tự khai báo.
- Không tải/đọc toàn bộ repository; cây file được lấy qua Git tree API và chỉ đọc các file đại diện, manifest, metadata, issues/PR.
- GitHub web/API có thể thay đổi sau thời điểm khảo sát; các file code chính được ghim bằng SHA, còn issue/PR/community counters là snapshot tại 2026-10-11.
- Không đánh giá chất lượng trực quan pixel-level, accessibility runtime, security posture thực tế, dependency vulnerabilities hay legal status của logo/avatar/third-party assets.
- Không xem các PR mở (#4, #5, #13) là code hiện hành; chúng chỉ được dùng để đối chiếu hướng phát triển và các giới hạn mà cộng đồng/tác giả đã nêu.

## Nguồn chính đã dùng

- [GitHub repository page](https://github.com/kargulstudio/sales-crm) và [pinned commit `2bb8556`](https://github.com/kargulstudio/sales-crm/commit/2bb85561794d21d2af67aa7c366f40ec1ef961ee).
- [Pinned README](https://raw.githubusercontent.com/kargulstudio/sales-crm/2bb85561794d21d2af67aa7c366f40ec1ef961ee/README.md), [pinned package.json](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/package.json), [pinned LICENSE](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/LICENSE).
- [Git tree API at pinned SHA](https://api.github.com/repos/kargulstudio/sales-crm/git/trees/2bb85561794d21d2af67aa7c366f40ec1ef961ee?recursive=1) để kiểm tra cấu trúc, test/CI/backend absence.
- Pinned source files: [`data/companies.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/data/companies.ts), [`stores/companies-store.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/stores/companies-store.ts), [`lib/companies.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/lib/companies.ts), [`app/page.tsx`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/app/page.tsx), [`lib/seo.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/lib/seo.ts), [`next.config.ts`](https://github.com/kargulstudio/sales-crm/blob/2bb85561794d21d2af67aa7c366f40ec1ef961ee/next.config.ts).
- [Issue #2](https://github.com/kargulstudio/sales-crm/issues/2), [PR #4](https://github.com/kargulstudio/sales-crm/pull/4), [PR #5](https://github.com/kargulstudio/sales-crm/pull/5), [PR #13](https://github.com/kargulstudio/sales-crm/pull/13) cho maturity và roadmap chưa merge.

Status: DONE
Summary: Đã xác minh `main` tại SHA `2bb85561794d21d2af67aa7c366f40ec1ef961ee` là frontend CRM demo/starter với state client và static data, chưa có backend CRM thật; đã ghi provenance, MIT attribution, maturity, audit coverage, trade-offs, điểm học được và giới hạn khảo sát.
Concerns/Blockers: Không có blocker; các counter GitHub và issue/PR có thể thay đổi sau ngày khảo sát, còn code links chính đã ghim SHA.

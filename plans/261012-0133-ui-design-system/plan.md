---
title: "UI/UX và design system cho Fourty"
description: "Chuẩn hóa semantic tokens, control/field/surface contracts và áp dụng chúng cho toolbar, record list, Company Preview và AI chat bằng dữ liệu thật của Fourty."
status: completed
priority: P1
effort: 28h
branch: codex/sales-crm-improvements
tags: [frontend, refactor, accessibility]
blockedBy: []
blocks: []
created: 2026-10-12
completed: 2026-10-12
---

# Kế hoạch UI/UX và design system cho Fourty

## Outcome

Fourty có một design system nhỏ, sâu và có thể kiểm thử: semantic tokens dùng được ở light/dark; `Button`/`IconButton`, `Field`, surface recipes và dialog focus có contract rõ; Companies, Contacts và Deals dùng một contextual toolbar gọn; Company Preview trình bày dữ liệu thật theo cấu trúc dễ quét; record và AI chat có đường keyboard/focus hoàn chỉnh.

Kế hoạch học mật độ, hierarchy, side preview và contextual controls từ `kargulstudio/sales-crm` tại SHA `2bb85561794d21d2af67aa7c366f40ec1ef961ee`, nhưng giữ nguyên nguồn dữ liệu, API, quyền và nhận diện Fourty. Nguồn có compact CRM UI và primitive boundaries đáng học (`plans/reports/researcher-261012-0133-sales-crm-design-system.md:5-11`, `plans/reports/researcher-261012-0133-sales-crm-design-system.md:47-54`), nhưng vẫn là frontend demo dùng fixture/Zustand, không phải kiến trúc runtime để chuyển sang Fourty (`plans/reports/researcher-261011-2319-sales-crm-source.md:28-37`, `plans/reports/xia-261011-2319-sales-crm-improvements.md:70-84`).

## Constraints

- Giữ Next.js 15, React 19, Tailwind 4 và các Radix wrapper hiện có; kiến trúc dự án chủ trương Tailwind cho visual language và Radix tập trung cho shared controls (`docs/architecture.md:51-62`, `package.json:24-51`).
- Giữ API, Postgres/Drizzle, RLS/RBAC, field permissions, URL query, saved views và AI confirmation flow hiện hành.
- Dữ liệu nghiệp vụ tiếp tục đi từ API Fourty. React/URL chỉ giữ view state; không thêm Zustand, client fixture hoặc source of truth thứ hai.
- TDD trong từng phase: thêm hoặc mở rộng test để thấy failure trước khi đổi source, sau đó mới triển khai đến khi gate xanh.
- Không thêm runtime dependency nếu behavior hiện có có thể được deepening bằng React, CSS và hai Radix package đang cài.
- Giữ tương thích các class `.btn-*`, `.input`, `.card`, `.th`, `.td` trong thời gian migrate để call site ngoài phạm vi không vỡ.
- Nếu sao chép một phần code đáng kể từ repo tham khảo, phải giữ notice MIT của Kargul Studio; hướng mặc định của kế hoạch là học pattern, không copy code/assets (`plans/reports/researcher-261011-2319-sales-crm-source.md:53-57`).

## Non-goals

- Không redesign dark-only hoặc thay wholesale palette/brand của Fourty.
- Không copy logo, avatar, font, animation, fixture, metric hoặc heuristic từ Sales CRM.
- Không tạo fake KPI, company health, activity score hoặc summary không có trong response thật.
- Không đổi backend, schema, migration, API shape, tenant boundary, RBAC hay field-level permission.
- Không đổi năm route chính của bottom navigation, default mobile Kanban hay policy table-vs-card. Bổ sung một mobile navigation drawer dùng cùng route tree để Reports, Workflows và Settings luôn discoverable, cùng overflow cue cho table/Kanban hiện hữu.
- Không redesign domain layout, chart hay information architecture của Dashboard, Tasks, Reports, Workflows hoặc Settings. Dashboard/Tasks chỉ nhận shared loading/error/retry state; Settings chỉ sửa accessible name và plural copy đã được audit.
- Không xây Storybook, package design-system riêng, theme editor hay framework component mới.

## Acceptance criteria

1. Mọi semantic utility mới được khai báo cho cả light và dark; không còn reference `danger` không có token trên các surface được chạm. Build CSS thành công và test contract xác nhận token/state mapping.
2. `Button`/`IconButton` hỗ trợ intent, size, disabled/loading và accessible name; `Field` nối label, description, required và error bằng `id`/`aria-describedby`/`aria-invalid`; các surface recipes cung cấp boundary cho card/panel/dialog mà không thêm React wrapper chỉ để đổi tên.
3. Class cũ `.btn-*`, `.input`, `.card`, `.th`, `.td` vẫn render hợp lệ trong các caller chưa migrate.
4. Companies, Contacts và Deals dùng cùng contract contextual toolbar. Ở `1440×900`, search/filter/view/action nằm gọn theo ngữ cảnh; ở `390×844`, toolbar wrap/overflow mà không làm body overflow và hit area trên coarse pointer đạt tối thiểu 44px.
5. Contact row, Deal list row và Deal Kanban card có một link/button thật trong tab order; Enter kích hoạt record. Drag chuột hiện có vẫn hoạt động.
6. Company Preview tiếp tục đọc `/api/companies/:id`, hiển thị loading/not-found/error/retry riêng và chỉ trình bày field thực sự có trong response; field vắng theo ADR redaction bị ẩn, không được tái tạo từ cache, đổi thành `0` hay metric suy diễn.
7. Company Preview và AI chat trap Tab, đóng Escape đúng surface trên cùng, restore focus về trigger, và giữ behavior nested dialog hiện có.
8. Các form Companies/Contacts/Deals được migrate mẫu sang `Field`/control contract; error được announce và dữ liệu nhập không mất khi submit thất bại. Contacts/Deals list có loading/error/retry/empty/success phân biệt, không còn spinner vô hạn khi request lỗi.
9. Focus-visible, reduced motion, URL/query, selection, export, saved view, preview, deal drag và AI confirm/cancel không regression.
10. Dashboard, Contacts, Deals và Tasks phân biệt loading với fetch failure, lỗi có `role="alert"` và Retry giữ route/filter hiện tại; Spinner có status/name truy cập được.
11. Mobile shell có menu dùng cùng route tree desktop, mở được Reports/Workflows/Settings mà không bỏ bottom navigation chính; mobile table/Kanban có cue ngang và không làm tràn body.
12. Focused Vitest, Playwright ở `1440×900` và `390×844`, typecheck và production build đều xanh; docs maintainer mô tả đúng contract đã ship.

## Evidence và RAT: facts trước, assumptions sau

### Facts đã xác minh, xếp theo risk

| Risk | Fact | Hệ quả thiết kế |
|---|---|---|
| High | `globals.css` có semantic nền/chữ nhưng chỉ expose `bg/surface/line/ink`; `--color-danger` không tồn tại (`src/app/globals.css:21-56`), trong khi Companies dùng `border-danger/30 bg-danger/5` (`src/app/(app)/companies/companies-client.tsx:400-407`). | Sửa token contract trước mọi migration visual; test CSS contract trước implementation. |
| High | Modal/Drawer dùng shared focus trap và restore stack (`src/components/ui.tsx:79-174`, `src/components/ui.tsx:196-292`), nhưng AI chat tự dựng dialog và chỉ bắt Escape tại panel (`src/components/ai-chat.tsx:174-245`). | Reuse focus boundary hiện có; không tạo focus manager thứ hai. |
| High | Contacts và Deals vẫn dùng click-only `<tr>`; Deal Kanban dùng click-only `<div draggable>` (`src/app/(app)/contacts/contacts-client.tsx:140-176`, `src/app/(app)/deals/deals-client.tsx:182-215`, `src/app/(app)/deals/deals-client.tsx:223-264`). Live audit xác nhận các record không vào tab order (`plans/reports/ui-ux-261012-0133-live-fourty-audit.md:45-51`). | Giữ row/card presentation nhưng đặt primary semantic link/button thật; test keyboard và drag riêng. |
| Medium | Button chỉ tồn tại dưới dạng `.btn-primary/.btn-ghost/.btn-danger`; `Field` chỉ implicit-wrap control và không có description/error contract (`src/app/globals.css:242-258`, `src/components/ui.tsx:294-313`). | Deepen interface tại seam hiện có, giữ CSS aliases cho caller cũ. |
| Medium | Select có visual contract riêng nhưng caller còn ghép thêm `.input`, ví dụ Companies (`src/app/globals.css:143-170`, `src/app/(app)/companies/companies-client.tsx:358-380`). | Một source cho control size/state; tránh class-order dependency. |
| Medium | Company Preview đã có state machine, abort, retry và dữ liệu `CompanyRead` thật (`src/components/company-preview.tsx:10-80`); nội dung hiện là danh sách field phẳng (`src/components/company-preview.tsx:119-160`). | Chỉ cải thiện hierarchy/structure, không thêm fetch, schema hay metric. |
| Medium | Companies có toolbar tương đối hoàn chỉnh (`src/app/(app)/companies/companies-client.tsx:301-398`), còn Contacts làm Select full width theo layout hiện tại và live audit thấy controls bị tách thành hàng lớn (`plans/reports/ui-ux-261012-0133-live-fourty-audit.md:87-93`). | Trích interface từ implementation Companies đang chạy, sau đó đưa Contacts/Deals vào cùng boundary. |
| Medium | E2E Companies đã khóa query/selection/preview/focus restore (`e2e/companies.spec.ts:190-236`) và Kanban chỉ khóa drag chuột (`e2e/kanban.spec.ts:11-58`). | Mở rộng test quanh seam, không thay thế các regression hiện có. |
| Low | Focus-visible và reduced-motion đã có global contract (`src/app/globals.css:127-130`, `src/app/globals.css:300-308`). | Giữ invariant; visual polish không được vô hiệu hóa chúng. |

### Assumptions cần retire bằng test

| Risk | Assumption | Signal assumption sai | Phản ứng đã chốt |
|---|---|---|---|
| High | Giữ CSS aliases trong cùng stylesheet đủ để migration dần mà không đổi layout ngoài phạm vi. | Visual diff hoặc E2E ngoài Companies/Contacts/Deals đổi control height/spacing. | Dừng rollout consumer; tách recipe component khỏi legacy classes và giữ computed style legacy như baseline. |
| High | Response hiện tại đủ cho structured preview có ích mà không cần aggregate/API mới. | Preview có section rỗng hoặc field quan trọng vắng ở đa số fixture/role. | Giảm section về identity + facts được trả về; không mở rộng API trong plan này. |
| Medium | Một semantic primary link trong row/card đáp ứng keyboard navigation mà vẫn giữ click/drag contract cho pointer. | E2E cho thấy nested interaction kích hoạt hai lần hoặc drag bị điều hướng. | Tách drag handle/card link, chặn activation theo event target và giữ pointer path hiện tại. |
| Medium | `DialogFocusScope` có thể bọc AI chat streaming mà không làm input mất focus khi item append. | Trong E2E, stream render làm focus nhảy hoặc nested Escape đóng sai surface. | Giữ focus scope chỉ quản lý mount/unmount/Tab/Escape; không autofocus theo từng render. |
| Medium | Shared toolbar slots đủ cho ba screen mà không cần generic schema-driven toolbar. | Deals cần interaction không biểu diễn được bằng slots hoặc prop flags tăng nhanh. | Giữ toolbar là layout primitive với `search/filters/view/actions`; page giữ logic và data riêng. |

## Quyết định kiến trúc

Chọn **deepen existing seams**. Không port component tree hoặc state store của Sales CRM, và không chỉ đổi màu/CSS. Đây là phương án KISS/DRY phù hợp với source hiện tại: shared behavior nằm ở primitive nhỏ, còn data fetching và nghiệp vụ tiếp tục ở feature.

### Interface mục tiêu

- `Button`: `intent = primary | neutral | danger`, `size = compact | default`, `loading`, native button/anchor composition, icon decorative mặc định.
- `IconButton`: yêu cầu accessible label, dùng chung intent/size recipe, visual icon giữ 16–20px nhưng coarse-pointer hit area tối thiểu 44px.
- `Field`: `label`, `description`, `error`, `required`, optional explicit `id`; clone/compose control để nối `aria-*` mà vẫn hỗ trợ implicit-label caller cũ trong giai đoạn migrate.
- Surface recipes: `.surface`, `.surface-subtle`, `.surface-danger`, `.surface-compact` dùng cho card/panel state. Chỉ materialize thành React `Surface` ở Phase 2 nếu có ít nhất hai consumer chia sẻ behavior ngoài styling; không sinh các wrapper `CardHeader/CardBody` không mang behavior.
- `AsyncState`: presentation contract cho loading/error/retry/empty; page vẫn sở hữu fetch, request guard và dữ liệu.
- `DialogFocusScope`: tiếp tục là core; Modal, Drawer và AI adapter dùng cùng stack. Không đưa visual variant vào focus hook.
- `ContextToolbar`: layout slots `search`, `filters`, `view`, `actions`, `meta`; page sở hữu query/state/API. Compact ở desktop, wrap/scroll có cue ở viewport hẹp; không sở hữu mobile navigation.

### Data flows

```text
semantic CSS tokens
  -> control/surface recipes
  -> Button | IconButton | Field | Select | surface recipes | ContextToolbar
  -> Companies | Contacts | Deals | Company Preview | AI chat

URL/query + local view state
  -> page-owned existing fetch/API
  -> permission-filtered response
  -> contextual toolbar + list/preview rendering

preview query id
  -> GET /api/companies/:id
  -> loading | ready | not-found | error
  -> structured CompanyRead fields
  -> full-detail link using existing route

AI chat trigger
  -> shared dialog focus stack
  -> existing restore/stream/send/confirm logic
  -> close
  -> focus restored to trigger
```

Không có data flow mới qua database. Mọi response vẫn đi qua route/API và permission hiện hành; visual layer không cache hay suy diễn dữ liệu CRM.

## Backwards compatibility và migration

- Giữ legacy CSS classes làm aliases của cùng token/recipe cho đến khi toàn repo được migrate ở một plan khác.
- Props hiện có của `Modal`, `Drawer`, `PageHeader`, `Field`, `Select` và `DropdownMenu` vẫn hợp lệ. Props mới là additive trong phase đầu.
- Giữ URL `/companies?preview=`, query/filter/saved-view behavior, full-detail links và export endpoints.
- Giữ HTML native table, Radix Select/Dropdown hidden-input behavior, Deal optimistic move/rollback và AI SSE/confirmation contract.
- Không migration DB, backfill, feature flag hay dual-write. Rollback là revert file-level theo phase.

## Dependency graph và file ownership

Các phase chạy tuần tự vì consumers phụ thuộc shared contracts. Không phase nào được chạy song song trên cùng file.

```text
Phase 1: tokens + primitives + contract tests
  -> Phase 2: contextual toolbar + forms + keyboard records
      -> Phase 3: structured preview + AI dialog focus
          -> Phase 4: full verification + maintainer docs
```

| Phase | Owner files độc quyền trong phase | Blocker |
|---|---|---|
| 1 | `src/app/globals.css`; `src/components/ui.tsx`; tạo `src/components/button.tsx`, `src/components/async-state.tsx`, `src/components/context-toolbar.tsx`; `src/components/select.tsx`; `src/components/dropdown-menu.tsx`; `tests/design-system.test.ts` | Không |
| 2 | `src/app/(app)/companies/companies-client.tsx`; `src/app/(app)/companies/companies-table.tsx`; `src/app/(app)/contacts/contacts-client.tsx`; `src/app/(app)/deals/deals-client.tsx`; `src/app/(app)/dashboard/dashboard-client.tsx`; `src/app/(app)/tasks/tasks-client.tsx`; `src/components/shell.tsx`; `src/app/(app)/settings/settings-client.tsx`; `e2e/design-system.spec.ts` | Phase 1 |
| 3 | `src/components/company-preview.tsx`; `src/components/ai-chat.tsx`; locale catalogs only when preview section copy requires them | Phase 1–2 |
| 4 | tạo `docs/design-system.md`; `docs/architecture.md`; `docs/README.md` | Phase 1–3 xanh |

Nếu implementation phát hiện cần sửa file ngoài inventory, executor phải ghi lý do và kiểm tra owner trước khi tiếp tục; không gom opportunistic cleanup vào phase.

## Phase 1 — Semantic foundations và reusable interfaces

**Priority:** P1 · **Effort:** 8h · **Depends on:** none

### Tests Before

1. Tạo `tests/design-system.test.ts` và viết failing tests cho:
   - ma trận hữu hạn `danger/success/warning/info × light/dark × text/background/border`, cùng control/focus ở `:root` và `.dark`;
   - `Button` intent/size/loading/disabled semantics;
   - `IconButton` accessible name;
   - `Field` label/description/error/required wiring;
   - compatibility markup/class cho caller cũ;
   - CSS surface recipe và legacy alias; React `Surface` chờ consumer thật ở Phase 2.
2. Mở rộng test Select/Dropdown bằng rendered DOM/source assertions tối thiểu cho `aria-invalid`, disabled, label và không còn ghép hai base visual classes.
3. Chạy test mới và lưu failure kỳ vọng trước implementation.

### Implementation

1. Bổ sung semantic state tokens và CSS aliases vào `globals.css`; chọn màu từ palette Fourty hiện có, không đổi accent/brand. Khai báo light/dark cùng lúc.
2. Gom control height, radius, border, hover, focus, disabled, loading và coarse-pointer target thành recipe nhỏ trong CSS/`ui.tsx`; bổ sung vocabulary type `body/caption/eyebrow` và spacing 4/8 chỉ tại các consumer dense đã xác minh. Nguồn tham khảo dùng type scale nhỏ và nhịp 4/8 hiệu quả cho scan CRM (`plans/reports/researcher-261012-0133-sales-crm-design-system.md:29-37`), nhưng không copy font, shadow hay dark palette của nguồn.
3. Thêm `Button`/`IconButton`; giữ `.btn-*` trỏ vào cùng recipe để caller ngoài scope không đổi.
4. Mở rộng `Field` theo interface mục tiêu, giữ implicit label path tương thích. Error dùng semantic token và live/alert behavior phù hợp; description và error có stable IDs.
5. Làm `Select`/`Dropdown` dùng cùng control state/size contract; bỏ nhu cầu truyền `.input` ở consumer mới nhưng không phá prop/className hiện hữu.
6. Chỉ chuẩn bị CSS surface recipe và legacy alias. Export đầy đủ `DialogFocusScope`/adapter props cần cho AI ở Phase 3, kèm contract test; Phase 3 không được mở lại focus core.

### Tests After / gate

```bash
npx vitest run tests/design-system.test.ts tests/a11y.test.ts --reporter=dot
npx tsc --noEmit --pretty false
```

Pass khi test semantic/a11y xanh, legacy primitive tests vẫn xanh, token matrix có đủ light/dark resolved values và không có utility semantic được tham chiếu nhưng chưa khai báo trong touched files.

### Risk và mitigation

- **High likelihood × High impact:** token/control migration đổi layout toàn app. Mitigation: CSS aliases, computed-style fixtures light/dark, migrate consumer ở phase sau.
- **Medium × High:** Field clone/composition làm hỏng custom control. Mitigation: giữ implicit label fallback và test native input + Radix Select.
- **Medium × Medium:** generic `Surface` thành wrapper mỏng. Mitigation: gate hai adapter có behavior/tone thật; không đạt thì không tạo.

### Rollback

Revert bốn shared files và test mới cùng nhau. Vì phase không xoá class cũ hoặc đổi consumer, rollback không cần sửa feature files.

## Phase 2 — Contextual toolbar, forms và keyboard record access

**Priority:** P1 · **Effort:** 10h · **Depends on:** Phase 1

### Tests Before

1. Tạo `e2e/design-system.spec.ts` với failure đầu tiên cho:
   - Companies/Contacts/Deals toolbar hierarchy ở desktop và mobile;
   - không body overflow ở 390px; coarse-pointer action target >= 44px;
   - Contact primary link, Deal list link và Kanban link vào tab order, Enter mở đúng route;
   - drag Deal card vẫn hoạt động sau khi thêm semantic link; PATCH thất bại phải rollback card/count/total;
   - filter/view/action giữ accessible name và focus-visible.
2. Thêm render test cho form error/description wiring và dữ liệu input còn nguyên sau failed submit ở ba form trong scope.
3. Fault-inject GET Contacts/Deals để khóa `loading → error → retry → success`, đồng thời phân biệt empty thật với error.
4. Chạy focused specs để ghi nhận failure hiện tại trước source edit.

### Implementation

1. Materialize `Surface` và `AsyncState` trong `ui.tsx` với Companies + Contacts/Deals làm adapters thật; nếu hai consumers không chia sẻ behavior, giữ CSS recipe và component state riêng.
2. Tạo `ContextToolbar` chỉ làm layout/semantics. Dùng slots thay vì schema/config object; không chuyển query/fetch/state ra khỏi page.
3. Dùng Companies toolbar hiện tại làm adapter đầu tiên, giữ search/query debounce, filters, saved views, export và actions (`src/app/(app)/companies/companies-client.tsx:285-398`).
4. Chuyển Contacts và Deals vào cùng toolbar, giới hạn width của Select ở desktop và cho wrap có chủ đích ở mobile. Không đổi table-to-card hay default Kanban.
5. Bổ sung request guard và `AsyncState` cho Contacts/Deals; Retry giữ filter/view và error không render như empty.
6. Migrate controls trong ba toolbar và ba create/edit form sang `Button`/`IconButton`/`Field`; error announce bằng contract chung, giữ busy guard và entered values.
7. Thêm semantic primary link trong Contact row và Deal list row; giữ row hover/pointer behavior nếu E2E xác nhận không double activation.
8. Với Kanban, giữ draggable container và đặt record link/activation rõ trong card. Nếu nested drag/link xung đột, tách drag handle; không giả lập keyboard drag trong scope này.
9. Dùng `aria-pressed`/`aria-current` đúng cho view toggles; icon chỉ trang trí phải `aria-hidden`, icon-only action phải có name.
10. Dùng shared async feedback cho Dashboard, Contacts, Deals và Tasks: fetch/network/non-2xx rời spinner, hiển thị alert + Retry và giữ state view/filter hiện tại.
11. Thêm mobile navigation drawer dùng cùng `NAV` source với desktop, giữ bottom nav hiện hữu; thêm cue ngang cho table/Kanban thay vì tự ý đổi sang card/list.
12. Sửa accessible name có identity cho action xóa member và plural `company → companies` trong Settings.

### Tests After / gate

```bash
npx playwright test e2e/design-system.spec.ts e2e/companies.spec.ts e2e/deal-form.spec.ts e2e/kanban.spec.ts --project=smoke
npx vitest run tests/design-system.test.ts tests/a11y.test.ts --reporter=dot
npx tsc --noEmit --pretty false
```

Pass khi desktop toolbar không còn Select full-width ngoài ý muốn, mobile/touch context (`viewport 390×844`, `hasTouch: true`, `isMobile: true`) không body overflow và có hit box >=44px, ba record types mở được bằng keyboard, async retry xanh và drag success/rollback đều xanh.

### Risk và mitigation

- **High × High:** shared toolbar làm mất query/selection/export semantics. Mitigation: layout-only slots; E2E Companies cũ là regression gate.
- **Medium × High:** anchor trong draggable card điều hướng khi drag. Mitigation: dedicated drag handle hoặc threshold/event guard; test click, Enter và drag riêng.
- **Medium × Medium:** compact desktop controls làm touch target nhỏ. Mitigation: coarse-pointer media rule tách hit area khỏi icon size.

### Rollback

Revert feature files và xóa `context-toolbar.tsx`/spec mới. Shared primitives phase 1 vẫn dùng được qua legacy classes; API/URL không cần rollback.

## Phase 3 — Structured Company Preview và dialog focus thống nhất

**Priority:** P1 · **Effort:** 6h · **Depends on:** Phase 1–2

### Tests Before

1. Mở rộng `tests/design-system.test.ts` cho render/source contract; tương tác focus thật nằm ở Playwright.
2. Mở rộng `e2e/design-system.spec.ts` cho:
   - preview loading/ready/not-found/error/retry;
   - field thật và redacted/missing field; không có fixture metric;
   - URL query/selection không mất khi mở/đóng preview;
   - AI trigger → input focus → Tab loop → Escape → trigger restore;
   - preview + palette/AI nested surface đóng theo LIFO;
   - streaming/item append không làm focus rời input hiện tại;
   - confirm/cancel vẫn giữ nguyên payload và behavior hiện hữu.
3. Reuse assertions hiện có ở `e2e/companies.spec.ts:190-236`; không duplicate toàn bộ journey.

### Implementation

1. Trước khi sửa preview, chạy security precondition: role không có `companies.read` phải bị từ chối khi deep-link ID trực tiếp. Nếu `GET /api/companies/:id` không enforce object-level read, dừng Phase 3 và mở backend/RBAC fix riêng; plan này không được che lỗi bằng UI.
2. Giữ state machine và AbortController của Company Preview (`src/components/company-preview.tsx:10-80`). Chỉ đổi presentation thành các section có heading rõ: identity, business facts, location/contact và recency khi field tương ứng tồn tại.
3. Chỉ dùng `name`, `domain`, `industry`, `size`, `city`, `country`, `annualRevenue`, `website`, `updatedAt`, `id` đang được render (`src/components/company-preview.tsx:82-160`). Không gọi endpoint aggregate và không tính health/activity.
4. Dùng surface recipes, semantic status và shared controls cho loading/error/retry/action. Field vắng khỏi JSON theo `docs/adr/011-field-level-permissions.md:32-34` phải bị ẩn và state cũ phải bị xóa khi ID đổi.
5. Bọc AI panel bằng `DialogFocusScope` đã export từ Phase 1; thêm `tabIndex=-1`, labelled title và restore trigger. Giữ nguyên SSE parsing, restored conversation, payload và decision lifecycle (`src/components/ai-chat.tsx:77-171`).
6. Không autofocus lại khi stream append. Close outside/Escape tuân theo behavior Drawer hiện có; nested surface chỉ surface trên cùng nhận phím.

### Tests After / gate

```bash
npx vitest run tests/design-system.test.ts tests/a11y.test.ts --reporter=dot
npx playwright test e2e/design-system.spec.ts e2e/companies.spec.ts e2e/command-palette.spec.ts --project=smoke
npx tsc --noEmit --pretty false
```

Pass khi preview chỉ hiển thị dữ liệu API, mọi state phân biệt được, AI trap/restore focus và nested dialog đóng đúng thứ tự.

### Risk và mitigation

- **Medium × High:** nested focus stack regression. Mitigation: reuse core hiện hữu và chạy Companies + Command Palette specs cùng AI spec.
- **Medium × Medium:** permission-redacted response làm section trống. Mitigation: conditional section rendering và test restricted fixture.
- **Low × High:** thay presentation vô tình chạm AI write confirmation. Mitigation: không sửa event types/send/decide; giữ các regression hiện hữu.

### Rollback

Revert các hunk production của phase; giữ regression tests dùng chung với các phase trước. Preview/API/AI data contract không đổi nên không có cleanup persistence.

## Phase 4 — System gate và docs impact

**Priority:** P2 · **Effort:** 4h · **Depends on:** Phase 1–3

### Verification

1. Chạy visual/a11y smoke light và dark ở `1440×900` và `390×844` cho Companies, Contacts, Deals, Company Preview và AI chat.
2. Kiểm tra keyboard-only: skip/focus, toolbar, record activation, modal/Drawer/AI nesting, restore trigger.
3. Chạy full gates:

```bash
npm test
npm run test:e2e
npx tsc --noEmit --pretty false
npm run build
git diff --check
```

4. Chụp/ghi baseline chỉ làm review artifact; không commit ảnh nếu repo không có convention snapshot.

### Docs impact

- Tạo `docs/design-system.md` mô tả semantic token naming, control/Field/surface recipe/Dialog/ContextToolbar contracts, migration aliases, a11y invariants và ví dụ ngắn.
- Cập nhật `docs/architecture.md` tại phần focused UI primitives (`docs/architecture.md:51-62`) để link tới contract mới.
- Cập nhật `docs/README.md` trong Architecture/Reference navigation (`docs/README.md:64-80`) để maintainer tìm thấy tài liệu.
- Không cập nhật user guides chỉ để ghi phase hoàn tất. Chỉ thêm user-facing copy nếu behavior thao tác thực sự đổi và đã được test.

### Success gate

- Full tests/build xanh.
- Không có thay đổi backend/schema/API/RBAC.
- Docs mô tả source đã ship, không mô tả phase plan hay behavior chưa triển khai.
- Review diff xác nhận không copy asset/source đáng kể từ Sales CRM; nếu có, notice MIT được giữ.

### Risk và rollback

- **Low × Medium:** docs lệch implementation sau chỉnh cuối. Mitigation: viết docs sau full gate và re-grep symbol/props.
- Rollback docs cùng contract tương ứng; không giữ docs cho interface đã revert.

## Test matrix

| Layer | Contract | Cases bắt buộc |
|---|---|---|
| Unit/render | Tokens/primitives | light/dark semantic states; Button intents/sizes/loading; IconButton name; Field IDs/error/description; legacy aliases |
| Unit/render | Dialog markup | role/name/focus-scope source contract |
| Integration/E2E | Toolbar | Companies/Contacts/Deals slots, query preserved, Select width, view toggle, export/action names, desktop/mobile layout |
| Integration/E2E | Forms | required/error announcement, disabled/loading, failed submit preserves values, Radix Select submission |
| Integration/E2E | Records | Contact/Deal list/Kanban keyboard activation; pointer click; Deal drag and rollback unchanged |
| Integration/E2E | Preview | ready/loading/not-found/error/retry, abort stale request, restricted/missing fields, URL/selection preserve, full-detail link |
| Integration/E2E | Dialog focus | first focus, Tab/Shift+Tab loop, top-stack Escape, trigger/fallback restore, nested dialog LIFO |
| Visual/manual | Theme/responsive | 1440×900 + 390×844, light/dark, contrast, no body overflow, coarse pointer target, reduced motion |
| Regression | Existing contracts | Companies, Command Palette, Deal form, Kanban, a11y, typecheck, production build |

## Cross-phase failure modes

| Failure mode | Likelihood × impact | Detection | Mitigation/stop condition |
|---|---|---|---|
| Legacy class và component recipe drift | High × High | Visual diff/E2E ngoài scope | Dừng consumer rollout; một CSS recipe phải phục vụ cả alias và component. |
| Semantic colors đủ tên nhưng thiếu contrast light/dark | Medium × High | Computed style + manual contrast review | Chỉnh token trước khi migrate status/error call sites. |
| Field composition phá native/Radix form semantics | Medium × High | Render + Deal form E2E | Giữ fallback implicit label, tránh clone unsupported child. |
| Toolbar abstraction hút page state vào shared component | Medium × Medium | Review thấy fetch/query logic trong toolbar | Reject change; toolbar chỉ nhận slots/layout props. |
| Keyboard fix phá pointer/drag | Medium × High | Combined click/Enter/drag E2E | Tách primary link và drag handle; không dùng `role` giả trên `<tr>/<div>` khi semantic element dùng được. |
| Preview lộ/giả dữ liệu bị redaction | Low × High | Restricted fixture E2E | Render only response fields; không fallback từ list cache hoặc aggregate client-side. |
| AI focus fix ảnh hưởng write confirmation | Low × High | AI confirm/cancel E2E | Không sửa send/decide/SSE logic; revert adapter-only change. |

## Measurable definition of done

- 100% touched icon-only actions có accessible name.
- 100% touched form errors nối với control và được announce.
- 3/3 list screens trong scope dùng `ContextToolbar`; Contacts và cả hai Deals views có keyboard record path.
- 4/4 data screens trong scope có recoverable fetch error state; mobile shell mở được toàn bộ route tree.
- 2/2 themes pass visual/state checks trên 2 viewport mục tiêu.
- Company Preview dùng đúng một nguồn dữ liệu API hiện có và có 4 state rõ ràng.
- AI chat và Company Preview pass Tab/Escape/restore/nested focus tests.
- Không file DB/migration/API/auth/permission nào thay đổi.
- Focused và full validation commands đều exit 0.

## Kết quả triển khai

- Hoàn tất ngày 2026-10-12 trên `codex/sales-crm-improvements`, tham chiếu `kargulstudio/sales-crm` tại SHA `2bb85561794d21d2af67aa7c366f40ec1ef961ee`. Chỉ học và điều chỉnh pattern UI/UX; không copy fixture, asset hoặc backend runtime từ repo tham khảo.
- Ship semantic light/dark tokens, shared Button/IconButton/Field/Spinner/AsyncError/ContextToolbar/DialogFocusScope contracts và surface CSS recipes. React `Surface` không được tạo vì không có hai consumer chia sẻ behavior ngoài styling, đúng gate của Phase 2.
- Áp dụng contextual toolbar, keyboard record path, async recovery, structured Company Preview, mobile navigation, responsive overflow cue và form error/busy behavior cho các surface trong scope. Không đổi database, migration, API, auth, RBAC hoặc field-permission contract.
- Validation: focused Vitest `33/33`; full Vitest `323/323` trong 45 files; Playwright `55/55`; TypeScript, production build và `git diff --check` đều đạt. Production build giữ cảnh báo dynamic dependency có sẵn từ `src/lib/otel.ts`.
- `npm run lint` không phải gate tự động khả dụng ở baseline hiện tại: script gọi `next lint`, nhưng repository chưa có cấu hình ESLint nên Next.js mở prompt cấu hình tương tác và command thoát `1` trong runner không tương tác. Lỗi baseline này không bị ẩn và không phát sinh từ thay đổi UI.

## Câu hỏi còn mở

Không có câu hỏi chặn kế hoạch. Bottom-nav composition, mobile table/card policy và default Kanban vẫn ngoài phạm vi; drawer và overflow cue chỉ khôi phục discoverability/accessibility mà không thay các quyết định đó.

# Audit design system và UI architecture của Fourty sau `d721238`

Ngày audit: 2026-10-12
Phạm vi: `src/app/globals.css`, `src/components/`, `src/app/(app)/`, `tests/a11y.test.ts`, `e2e/`
Mục tiêu: lập inventory hệ thống giao diện hiện tại, xác định lệch chuẩn/lặp pattern và các seam có đủ adapter để deepening theo codebase-design. Audit này chỉ đọc, không sửa source.

## Kết luận điều hành

Fourty đã có một nền tảng giao diện dùng được: CSS semantic cho nền/bề mặt/chữ/viền, wrapper Radix cho Select/Dropdown, focus scope dùng chung cho Modal/Drawer/Command Palette, shell desktop/mobile có skip link và trạng thái điều hướng, cùng một số màn hình có state loading/error/empty khá đầy đủ. `tests/a11y.test.ts` và các E2E của Companies/Pipeline đã kiểm tra các seam quan trọng.

Điểm yếu chính nằm ở contract chưa được gom thành primitive/interface ổn định. CSS mới chỉ token hóa một phần màu; spacing, typography, radius, shadow và state màu vẫn chủ yếu là utility rời rạc. `danger` được dùng nhưng không có token tương ứng. Nhiều nơi tự dựng dialog, header, table row, form error và async state. Điều này tạo drift giữa các màn hình và làm các bề mặt chưa được E2E kiểm tra (Contacts, Deals, Tasks, Workflows, detail pages và AI chat) có rủi ro cao hơn.

Các seam có leverage cao nhất là: semantic state/control tokens; control và Field contract; dialog surface; async feedback; list/table; record shell và activity panels. Đây là các seam đã có từ hai adapter trở lên, nên có thể deepening với interface nhỏ và test qua interface thay vì thêm một lớp wrapper chỉ đổi tên.

## Inventory

### Tokens và base styles

| Khu vực | Hiện trạng và evidence |
|---|---|
| Palette | Accent có scale `--color-accent-50..900` và semantic tokens gồm `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--focus-ring`, `--state-error`, `--state-selected`, `--state-selected-text`, `--state-panel` tại `src/app/globals.css:1-56`. `.dark` override cùng nhóm ở `:35-47`. Đây là nền tảng tốt cho nền/bề mặt/chữ, nhưng thiếu semantic `danger`, `success`, `warning`, `info`, và không có state token cho control/overlay/table. |
| Typography | `--font-sans` là system stack tại `src/app/globals.css:16-19`; `layout.tsx` chỉ thêm `antialiased` cho body tại `src/app/layout.tsx:27-35`, không áp dụng rõ `font-sans` ở body. Các cấp chữ được quyết định bởi utility: PageHeader dùng `text-xl md:text-2xl font-bold tracking-tight` (`src/components/ui.tsx:176-194`), Field dùng `text-xs uppercase tracking-wide` (`ui.tsx:294-313`), table header dùng `text-xs uppercase tracking-wide`, cell dùng `text-sm` (`globals.css:277-283`). Chưa có type scale semantic hoặc line-height contract. |
| Spacing | Không có token spacing trong `@theme`; component dùng utility trực tiếp: control `px-3 py-2`, button `px-3.5 py-2`, card `p-4`, modal/drawer `p-5`, empty state `px-6 py-14` (`globals.css:143-146,242-258`; `ui.tsx:196-239,245-292,368-383`). Các giá trị này lặp lại nhiều nhưng chưa có interface size/density. |
| Radius | Chưa có radius token. Pattern phổ biến là `rounded-lg` cho control, `rounded-xl` cho card/dialog, `rounded-full` cho chip, nhưng có ngoại lệ `rounded-2xl` trong AI chat, `rounded-b-none` cho modal mobile và `rounded` cho color input (`globals.css:143-146,242-275`; `src/components/ai-chat.tsx:186-203`; `src/app/(app)/settings/pipeline-settings.tsx:656`). |
| Shadow/elevation | Chưa có elevation token. `shadow-sm`, `shadow-lg`, `shadow-xl`, `shadow-2xl` được chọn trực tiếp ở card/overlay/popover (`globals.css:173-239`; `ui.tsx:196-292`; `src/components/command-palette.tsx:212-307`). Z-index cũng phân tán (`z-30` mobile nav, `z-40` dialog/AI, `z-50` command palette, `z-60` Select/Dropdown). |
| Focus/motion | Global focus ring có `outline: 2px solid var(--focus-ring)` và `outline-offset: 2px` tại `src/app/globals.css:123-130`; reduced motion tắt animation/transition/scroll tại `:300-308`. Đây là contract tốt. `fade-up` chỉ là một animation dùng chung tại `:285-298`; các surface khác vẫn tự chọn transition/animation. |
| Semantic state | `.state-error` chỉ đặt màu tại `src/app/globals.css:123-126`; `.btn-danger` dùng raw `red-600/700` tại `:242-258`. `companies-client.tsx:400-407` dùng `border-danger/30 bg-danger/5` và `saved-views.tsx:96-103` dùng `hover:text-danger`, nhưng không có `--color-danger` trong globals. Nếu không có nguồn token khác, hai utility này sẽ không tạo giá trị CSS, làm error/delete affordance mất styling. |

### Primitives và component interfaces

| Primitive/surface | Hiện trạng |
|---|---|
| Button | Chỉ có các CSS class `.btn-primary`, `.btn-ghost`, `.btn-danger` tại `src/app/globals.css:242-258`; chưa có React `Button`/`IconButton` nhận `intent`, `size`, `loading` và contract accessible name. Nhiều call site phải override `!px-2`, `!border-0`, `h-9`, `py-1` (`src/components/shell.tsx:51-71`; `src/app/(app)/companies/companies-client.tsx:355-379`). |
| Input/Field | `.input` thống nhất được border, surface, radius, focus tại `globals.css:143-146`. `Field` dùng implicit label wrapping tại `src/components/ui.tsx:294-313`, phù hợp native input nhưng không có `id`, `description`, `error`, `required`, `aria-describedby` hoặc `aria-invalid`. Các form có thể tự render lỗi theo nhiều kiểu. |
| Select | `src/components/select.tsx:1-118` là wrapper Radix có controlled/uncontrolled value, portal content, viewport/item, disabled/required/name và hidden input. Đây là seam thật vì được dùng trong filters, forms và settings. Tuy nhiên nhiều call site truyền `className="input"` cùng wrapper `select-trigger` (`src/app/(app)/companies/companies-client.tsx:361-379`; `src/components/custom-fields.tsx:38-43`), tạo hai nguồn control styling và phụ thuộc thứ tự CSS. |
| Dropdown | `src/components/dropdown-menu.tsx:1-76` bọc Root/Trigger/Content/Item/Label/Separator, Content có collision padding và portal. Visual contract vẫn do call site tự quyết vì Trigger chỉ forward className. Hiện dùng rõ nhất trong export menu của Companies (`src/app/(app)/companies/companies-client.tsx:308-335`), nên phần styling adapter còn mỏng. |
| Modal/Drawer | `Modal` và `Drawer` có `role=dialog`, `aria-modal`, labelled title, overlay, click-outside và dùng `useDialogFocusTrap` tại `src/components/ui.tsx:79-150,196-292`. Modal chuyển thành bottom sheet trên mobile; Drawer full-width mobile. Đây là seam tốt, nhưng form dirty-state chưa có policy confirm khi đóng. |
| Dialog focus | `DialogFocusScope` quản lý stack, Escape, Tab wrap, focus initial/restore và nested surface tại `src/components/ui.tsx:79-174`. Command Palette dùng cùng cơ chế và có combobox/listbox semantics (`src/components/command-palette.tsx:212-307`). AI chat tự dựng drawer/overlay ở `src/components/ai-chat.tsx:174-245`, chỉ bắt Escape, không dùng focus scope và không restore focus. |
| Table/list | CSS `.th/.td` chỉ định typography/padding tại `globals.css:277-283`; chưa có React DataTable/list surface. Companies, Contacts, Deals, Reports tự dựng table với min-width và row action (`src/app/(app)/companies/companies-table.tsx:43-127`; `contacts/contacts-client.tsx:124-176`; `deals/deals-client.tsx:222-265`; `reports/reports-client.tsx:39-86`). |
| Feedback | `EmptyState` và `Spinner` có ở `src/components/ui.tsx:368-392`; Spinner chưa tự có `role=status`/accessible label. Companies/Preview/Pipeline có state rõ hơn, còn nhiều page bỏ qua lỗi fetch hoặc render spinner/null mãi. |
| Status/chips | `StatusChip`, `ScoreBadge`, `PriorityChip` tại `src/components/ui.tsx:315-355` và activity dots tại `src/components/record-panels.tsx:23-32` map trực tiếp raw Tailwind palette. Stage color còn inline hex ở detail pages và Pipeline (`company-detail.tsx:158`, `contact-detail.tsx:153`, `deal-detail.tsx:121`, `deals-client.tsx:170,250`, `settings/pipeline-settings.tsx:44-46,582`). |

### Shell, sidebar và mobile navigation

`AppShell` có một nguồn NAV gồm Dashboard, Contacts, Companies, Deals, Tasks, Reports, Workflows, Settings tại `src/components/shell.tsx:25-34`. Sidebar desktop có resize bằng pointer/keyboard, giới hạn 224–360px, lưu localStorage và có separator focusable (`shell.tsx:41-49,74-187,266-282`). Main dùng CSS variable để đồng bộ sidebar width (`shell.tsx:189-200`; `globals.css:64-74,132-136`). Skip link, `aria-label`, `aria-current`, logout/theme controls được đặt tại `shell.tsx:195-264`.

`MOBILE_NAV` chỉ lấy Dashboard, Contacts, Companies, Deals, Tasks tại `shell.tsx:36-39,308-329`. Reports, Workflows và Settings không có đường dẫn hiển thị trong mobile shell; người dùng phải biết dùng search/command palette. Đây có thể là chủ trương sản phẩm hoặc một gap discoverability, cần quyết định rõ. Bottom nav có safe-area padding, nhưng `app-main` chỉ có `pt-16 pb-24` tại `shell.tsx:331-345`; nội dung chính chưa có safe-area inset tương ứng.

Theme toggle đọc DOM/localStorage sau mount (`shell.tsx:51-71`), còn `layout.tsx:11-25` set themeColor và theme init. HTML luôn `lang="en"` tại `src/app/layout.tsx:27-35` dù app có LocaleProvider và lựa chọn ngôn ngữ ở settings.

### Page headers, toolbars và forms

`PageHeader` dùng chung title/subtitle/actions ở `src/components/ui.tsx:176-194`; hiện được dùng bởi Companies, Contacts, Deals, Reports, Settings, Tasks, Workflows và Import (`src/app/(app)/*`). Dashboard tự dựng header (`dashboard-client.tsx:69-75`). Ba detail page cũng tự dựng h1/action/layout, với cùng pattern `text-xl md:text-2xl`, action button và card section (`companies/company-detail.tsx:73-99`, `contacts/contact-detail.tsx:71-103`, `deals/deal-detail.tsx:80-129`). Điều này tạo seam rõ cho `RecordHeader`/`RecordLayout`.

Companies có toolbar khá đầy đủ: search, desktop Select filters, mobile filter Modal, export Dropdown, loading/error/empty/table/pagination (`src/app/(app)/companies/companies-client.tsx:301-520`). Pipeline settings có một pattern responsive có chủ đích: desktop list và mobile Select, cùng selected editor, load/error/empty/retry và mutation guards (`src/app/(app)/settings/pipeline-settings.tsx:268-497`). Đây là hai implementation tốt để làm reference cho các page khác.

Forms dùng `Field`, `.input` và `Select` nhưng error semantics không đồng nhất. Deal form có busy guard và `role="alert"` (`src/app/(app)/deals/deal-form.tsx:70-127,203-206`); Contact/Company form render error text thường (`contacts/contact-form.tsx:23-127`; `companies/company-form.tsx:47-95`). Workflow builder và Import cũng render lỗi không có `role=alert` (`workflows/workflow-builder.tsx:126-343`; `settings/import/import-client.tsx:31-99`). Custom fields dùng chung registry nhưng hook fetch bỏ qua lỗi và checkbox dùng raw `accent-indigo-600` (`src/components/custom-fields.tsx:8-71`).

Saved views là toolbar có contract tốt ở mức local: role toolbar, `aria-pressed` cho view toggle và input save tại `src/components/saved-views.tsx:75-118`; tuy nhiên copy `All`, `shared`, `Save` còn hardcode và delete hover dùng token `danger` chưa định nghĩa.

### Loading, error, empty và async state

- Companies có AbortController/request generation, error retry, loading, empty/no-results và redaction path (`src/app/(app)/companies/companies-client.tsx:164-215,400-430`); Company Preview có loading `role=status`, not-found/error `role=alert`, retry (`src/components/company-preview.tsx:47-116`).
- Pipeline settings có `aria-busy`, `role=status`, `role=alert`, EmptyState và modal error (`src/app/(app)/settings/pipeline-settings.tsx:268-334,671-676`); Command Palette có combobox `aria-busy`, error alert và no-result state (`src/components/command-palette.tsx:234-307`).
- Contacts, Deals, Tasks và Workflows có loading/no-data nhưng không có UI error path rõ ràng; các load error bị bỏ qua hoặc để state mặc định (`src/app/(app)/contacts/contacts-client.tsx:55-189`; `deals/deals-client.tsx:75-137`; `tasks/tasks-client.tsx:66-177`; `workflows/workflows-client.tsx:62-190`).
- Record panels bỏ qua lỗi fetch cho Timeline, Notes và Tasks; Timeline chỉ hiển thị `No activity yet`, Notes có thể để trống, mutation errors không báo cho người dùng (`src/components/record-panels.tsx:53-166,168-245`). Đây là ba adapter của cùng một entity-side-panel surface nhưng hiện chưa chia sẻ async contract.

### Responsive và mobile behavior

Breakpoint desktop shell chính là `48rem` tại `src/app/globals.css:132-136`; component còn dùng `sm`, `md`, `lg`. Modal bottom-sheet, Drawer full-width và detail pages chuyển 1→3 cột ở `lg` (`src/components/ui.tsx:196-292`; `companies/company-detail.tsx:97-186`; `contacts/contact-detail.tsx:105-193`; `deals/deal-detail.tsx:131-185`).

Table surfaces hiện xử lý bằng horizontal overflow và min-width riêng: Companies 760, Contacts 720, Deals 720, Reports khoảng 380/640 (`companies/companies-table.tsx:43-127`; `contacts/contacts-client.tsx:124-176`; `deals/deals-client.tsx:222-265`; `reports/reports-client.tsx:39-86`). Chỉ Companies có mobile filter Modal; Deals Kanban vẫn scroll ngang (`deals/deals-client.tsx:138-221`), và không có policy chung về khi nào đổi sang card/list.

### Accessibility và test coverage hiện tại

`tests/a11y.test.ts:1-66` render-test implicit Field label, Modal/Drawer attributes/close, decorative icon hiding và SavedViews toolbar/aria-pressed. `tests/a11y.test.ts:69-114` source-test shell skip link/nav/aria-current/separator/storage/fallback, Command Palette semantics và focus scope. Chạy hiện tại: `npx vitest run tests/a11y.test.ts --reporter=dot` pass 8/8; `npx tsc --noEmit --pretty false` pass; `git diff --check` pass.

E2E hiện bao phủ login/logout, Command Palette, Companies (bao gồm mobile filters, export menu keyboard/focus, stale/retry, preview nested focus, sidebar resize), Deal form, Kanban drag và Pipeline settings desktop/mobile/retry/empty/read-only. Chưa có E2E tương đương cho Contacts, Tasks, Reports, Workflows, detail pages hoặc AI chat. Chưa có test chung cho Select/Dropdown keyboard contract, icon-only accessible names, row/card keyboard activation, form error announcement, dark-mode native controls hoặc toàn bộ mobile route discoverability.

## Findings ưu tiên

| Mức | Finding và evidence | Tác động |
|---|---|---|
| High | **Semantic token contract bị đứt.** `--color-danger` không tồn tại (`src/app/globals.css:49-56`), nhưng Companies dùng `border-danger/30 bg-danger/5` (`src/app/(app)/companies/companies-client.tsx:400-407`) và Saved Views dùng `hover:text-danger` (`src/components/saved-views.tsx:96-103`). Status/charts/stages cũng dùng raw palette/hex ở `src/components/ui.tsx:315-355`, `src/components/charts.tsx:18-42`, `src/app/(app)/settings/pipeline-settings.tsx:44-46,582`. | Error/delete/state có thể không có màu hoặc lệch light/dark; thay đổi palette sẽ phải sửa nhiều call site. Cần xác nhận utility không được sinh trước khi migration, nhưng source hiện không có token tương ứng. |
| High | **AI assistant bypasses dialog focus seam.** Modal, Drawer và Command Palette dùng `DialogFocusScope` (`src/components/ui.tsx:79-174`), còn AI chat tự dựng overlay `role=dialog` và chỉ bắt Escape (`src/components/ai-chat.tsx:174-245`). | Keyboard/screen-reader focus có thể thoát khỏi panel, không quay lại trigger; nested dialog contract không nhất quán. Chưa có a11y/E2E test cho surface này. |
| High | **Async failure không được đưa qua một interface.** Contacts/Deals/Tasks/Workflows không có error state hoặc bỏ qua fetch error (`src/app/(app)/contacts/contacts-client.tsx:55-189`; `deals/deals-client.tsx:75-137`; `tasks/tasks-client.tsx:66-177`; `workflows/workflows-client.tsx:62-190`); Record panels bỏ qua lỗi ở `src/components/record-panels.tsx:53-245`. | Người dùng có thể thấy spinner/null hoặc dữ liệu trống không phân biệt lỗi; retry và announcement không nhất quán. Đây là regression dễ xảy ra khi đổi API. |
| Medium | **Interactive row/card thiếu keyboard path.** Contacts và Deals list dùng `onClick` trên `<tr>` (`src/app/(app)/contacts/contacts-client.tsx:151-155`; `deals/deals-client.tsx:239-243`); Kanban card dùng `<div draggable onClick>` (`deals/deals-client.tsx:184-194`). | Người dùng keyboard/screen reader không có activation tương đương click/drag. E2E Kanban hiện chỉ kiểm tra drag chuột (`e2e/kanban.spec.ts`). |
| Medium | **Icon-only controls thiếu accessible name ở nhiều surface.** Trash actions trong detail pages (`companies/company-detail.tsx:91-93`; `contacts/contact-detail.tsx:99-101`; `deals/deal-detail.tsx:103-105`), settings (`settings/settings-client.tsx:215-217,342-344,475-477`), workflow list (`workflows/workflows-client.tsx:121-126`) và add-task plus (`src/components/record-panels.tsx:213-215`) không có `aria-label`/title. | Các thao tác không được đọc tên; lỗi thường không bị bắt vì tests chỉ kiểm tra một số surface. |
| Medium | **Control/Field interface phân mảnh.** Không có React Button/Control chung; `Field` chưa hỗ trợ error/description/IDs (`src/components/ui.tsx:294-313`), và Select nhận thêm `.input` ở nhiều nơi (`src/components/select.tsx:54-114`; `src/app/(app)/companies/companies-client.tsx:361-379`). | Variant, density, loading và invalid state drift theo call site; thay CSS có nguy cơ override chéo. |
| Medium | **Record pages và side panels lặp cấu trúc.** Company/Contact/Deal detail tự dựng header/3-column cards (`companies/company-detail.tsx:73-186`; `contacts/contact-detail.tsx:71-193`; `deals/deal-detail.tsx:80-185`); Timeline/Notes/Tasks dùng ở nhiều entity nhưng không có error/empty contract chung (`src/components/record-panels.tsx:53-245`). | Sửa interaction, responsive hoặc feedback phải nhân ba; các entity dễ có behavior khác nhau. |
| Medium | **Mobile navigation và table policy chưa rõ.** `MOBILE_NAV` loại Reports/Workflows/Settings (`src/components/shell.tsx:36-39,308-329`); table min-width/overflow khác nhau theo page (`companies/companies-table.tsx:43-127`; `contacts/contacts-client.tsx:124-176`; `deals/deals-client.tsx:222-265`). | Route discoverability và trải nghiệm 390px không nhất quán; thay đổi nav có thể che khuất nội dung hoặc phá deep-link. |
| Low | **Raw chart/stage geometry và localization.** Chart dùng hex/font/radius trực tiếp (`src/components/charts.tsx:18-42`), stage colors inline; `html lang="en"` và nhiều copy không qua i18n (`src/app/layout.tsx:27-35`; `src/components/saved-views.tsx:75-118`). | Dark mode/brand update cần sửa nhiều nơi; screen reader có thể chọn sai ngôn ngữ và text UI còn lệch giữa locale. |

## Seam/module đề xuất theo codebase-design

Ưu tiên theo leverage và locality; mỗi seam dưới đây có ít nhất hai adapter hiện hữu để tránh tạo abstraction cho một caller duy nhất.

| Ưu tiên | Seam và boundary đề xuất | Adapter hiện hữu / contract nên giữ | Test qua interface |
|---|---|---|---|
| 1 | **Semantic visual/state tokens** tại `globals.css` và một mapper trạng thái nhỏ gần `ui.tsx`. Bổ sung danger/success/warning/info, control/overlay/table tokens và radius/shadow/type density cần thiết. | Companies error, Saved Views delete, Status/Priority/Stage/Activity, chart palette là các adapter khác nhau (`companies-client.tsx:400-407`; `ui.tsx:315-355`; `record-panels.tsx:23-32`; `charts.tsx:18-42`). Giữ semantic name; thay raw palette ở boundary. | Light/dark computed styles, contrast cho state, không còn utility semantic chưa định nghĩa; snapshot/source check cho token map. |
| 2 | **Control + Field interface** ở `src/components/ui.tsx`, `select.tsx`, `dropdown-menu.tsx`. Tách `Button`/`IconButton` intent-size-loading và mở rộng `Field` bằng id/description/error/required; Select nhận size/intent thay vì ghép `.input`. | Primary/ghost/danger buttons; native input/textarea; Radix Select; icon-only actions là nhiều adapter đã có. Không cần thay mọi call site ngay; bắt đầu ở forms/toolbar. | Render từng intent/size; accessible name; disabled/loading; `aria-invalid` + `aria-describedby`; Select keyboard/Escape/disabled. |
| 3 | **Dialog surface** giữ `DialogFocusScope` làm core và gom Modal/Drawer/Command Palette/AI chat vào adapter `variant` hoặc hook chung. | Modal, Drawer, Command Palette hiện dùng focus scope; AI chat là bypass cần đưa vào cùng boundary (`ui.tsx:79-174`; `command-palette.tsx:212-307`; `ai-chat.tsx:174-245`). | Initial focus, Tab wrap, nested Escape, outside close, restore trigger, mobile variant; thêm AI chat E2E/a11y. |
| 4 | **Async feedback surface** (state machine/hook + `ErrorState`, `LoadingState`, `EmptyState`, `Retry`) ở `ui.tsx` hoặc module riêng. | Companies, Company Preview, Pipeline và Command Palette là implementations có đủ state; Contacts/Deals/Tasks/Workflows/Record panels là consumers thiếu state. | Mỗi adapter phải render loading/error/empty/success; `role=status`, `role=alert`, retry không mất request guard; test network failure cho ít nhất một list và một side panel. |
| 5 | **List/Table surface** với contract columns/row action/selection/empty/error/overflow, giữ page-specific data fetching bên ngoài. | Companies table, Contacts table, Deals list, Reports table (`companies-table.tsx:43-127`; `contacts-client.tsx:124-176`; `deals-client.tsx:222-265`; `reports-client.tsx:39-86`). | Selection/indeterminate, keyboard row action, no-results vs empty, horizontal overflow/mobile rendering, accessible headers. |
| 6 | **Record shell** gồm `RecordHeader`, `RecordLayout` và `RecordPanel` slots. | Company/Contact/Deal detail có cùng header/action/3-column structure; Timeline/Notes/Tasks cung cấp panel adapters. | Render ba entity qua cùng interface; responsive 1→3 columns; action names; error/empty/retry của từng panel. |
| 7 | **Navigation policy** tách `NAV` và mobile visibility thành một route registry có `mobileVisible`/overflow group rõ ràng. | Desktop sidebar và mobile bottom nav đã cùng nguồn NAV nhưng filter riêng (`shell.tsx:25-39,201-329`). | 390px kiểm tra route discoverability, active state, focus, safe-area; test policy cho Reports/Workflows/Settings trước khi đổi UI. |
| 8 | **Chart/status theme adapter** sau khi token seam ổn định. | `useChartColors`, StatusChip/PriorityChip, stage badges và activity dots đang là các color adapters riêng (`charts.tsx:18-42`; `ui.tsx:315-355`; `record-panels.tsx:23-32`). | Theme toggle cập nhật màu, contrast, stable mapping status/stage và không dùng hex ngoài token map. |

## Regression risks và test contract cần có

- Token migration có nguy cơ làm mất contrast, đổi màu trạng thái ở cả light/dark hoặc làm utility hiện tại không sinh CSS. Chạy CSS build/source scan cho các token được tham chiếu; kiểm tra visual smoke cho Companies error, Pipeline stage, chip và chart.
- Gom Button/Field/Select có nguy cơ phá kích thước toolbar, hidden input form submission và Radix focus behavior. Giữ test render cho native input và Radix Select, rồi chạy E2E Companies filters, Pipeline mobile Select và Deal form.
- Gom dialog có nguy cơ phá nested preview, Escape propagation và restore focus. Giữ các E2E Companies preview/keyboard và thêm Modal → Drawer/AI nested case với Tab/Escape/restore.
- Bổ sung async error state có nguy cơ đổi loading timing hoặc nuốt retry/request-generation guard. Test network failure, retry thành công, stale response và empty/no-results riêng; không coi empty là error.
- Đổi list/table surface có nguy cơ phá selection, row navigation và horizontal scroll. Test keyboard activation thay cho click-only row, selection indeterminate và viewport 390px/1280px.
- Mở rộng mobile nav có nguy cơ chồng bottom bar, safe-area và deep-link active state. Kiểm tra tất cả NAV route ở 390px và `pb`/inset của main content.
- Thêm accessible names và `role=alert/status` nên có test axe hoặc DOM assertion ở các surface mới; không dựa chỉ vào source scan.
- Nếu sửa `html lang`, cần test locale chuyển ngôn ngữ và hydrate/theme init để tránh mismatch; copy hardcode nên được rà qua LocaleProvider trước khi đổi hàng loạt.

## Unresolved questions

1. Reports, Workflows và Settings có cần xuất hiện trực tiếp trên mobile, hay sản phẩm chủ ý giữ chúng trong search/overflow? Nếu có overflow, vị trí và label của nó là gì?
2. Semantic palette chính thức cho `danger/success/warning/info` là gì, và có yêu cầu contrast cụ thể cho dark mode không?
3. AI assistant được xem là Drawer hay Modal về focus/outside-click/dirty-state? Có cho phép mở nested từ Company Preview/Command Palette không?
4. Row/card click trên Contacts, Deals và Kanban nên mở detail bằng keyboard như một link/button, hay cần thêm keyboard alternative cho drag-and-drop?
5. Mobile table policy là horizontal scroll thống nhất, card/list chuyển đổi, hay page-specific? Cần ưu tiên field nào khi viewport hẹp?
6. Form error contract mong muốn là inline theo Field, summary ở đầu form, toast, hay kết hợp; retry cho mutation có cần giữ dữ liệu nhập không?
7. Locale có cần cập nhật `html[lang]` theo LocaleProvider và chuyển toàn bộ copy hiện còn hardcode (`SavedViews`, status labels, empty text) trong cùng scope không?

## Validation

- `npx vitest run tests/a11y.test.ts --reporter=dot` — pass 8/8.
- `npx tsc --noEmit --pretty false` — pass.
- `git diff --check` — pass.

Status: DONE
Summary: Đã audit inventory token, primitive, shell/navigation, header/form, feedback/loading/error/empty, responsive và a11y sau d721238; ghi nhận evidence file:line, ưu tiên gap, seam/module deepening, regression risks/test contracts và unresolved questions trong báo cáo này. Không sửa code.
Concerns/Blockers: Browser E2E toàn bộ app chưa được chạy trong lượt audit; các kết luận về runtime CSS utility `danger` cần xác nhận thêm từ CSS build nếu token contract được sửa.

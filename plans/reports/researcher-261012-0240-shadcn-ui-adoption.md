# Nghiên cứu adoption shadcn/ui cho Fourty

Ngày kiểm tra: 12/10/2026 (Asia/Ho_Chi_Minh)

Phạm vi: tài liệu chính thức của shadcn/ui và Radix Primitives, cùng mã nguồn/cấu hình hiện có của Fourty. Không dùng blog hoặc nguồn thứ cấp. Nhận định về độ phức tạp, chi phí bảo trì và fit với Fourty là đánh giá kiến trúc dựa trên các nguồn này và repo hiện tại.

## Kết luận

Fourty phù hợp để adopt có chọn lọc shadcn/ui cho primitive mới và khu vực UI chưa có hợp đồng ổn định. Không có bằng chứng đủ để thay toàn bộ primitive hiện tại bằng mã sinh ra từ shadcn/ui.

Lý do:

- Nền tảng kỹ thuật đã khớp: Fourty dùng Next.js 15.3.4, React 19.1, Tailwind CSS 4.1.10 và Radix Select/Dropdown; tài liệu shadcn/ui xác nhận hỗ trợ Next.js 15/React 19 và Tailwind v4 trong bản latest.
- Mô hình shadcn/ui đưa source vào repo ứng dụng. Điều này phù hợp với UI dễ đọc, nhưng Fourty sẽ tự chịu trách nhiệm cho fork, regression, cập nhật dependency và accessibility sau khi tùy biến.
- Fourty đã có contract riêng cho Button, Field, Select, focus trap/dialog, token ngữ nghĩa và alias CSS. Rewrite toàn bộ sẽ thay đổi contract đã được ghi nhận trong docs/design-system.md mà chưa có lợi ích tương xứng.

### Xếp hạng lựa chọn

| Hạng | Lựa chọn | Fit | Nhận định |
| --- | --- | --- | --- |
| 1 | Adopt từng component, giữ contract Fourty và review source | Cao | Dùng CLI/registry làm điểm xuất phát; giữ tên, API, token và test của Fourty. |
| 2 | Dùng shadcn làm baseline cho khu vực UI mới hoặc major redesign có phạm vi rõ | Trung bình-cao | Hợp lý khi khu vực chưa có contract; phải chốt ownership và update process trước. |
| 3 | Rewrite toàn bộ src/components | Thấp | Diff lớn, phải chuyển mọi focus/ARIA/domain behavior; chưa có bằng chứng cần thiết. |
| 4 | Tiếp tục tự xây toàn bộ primitive | Trung bình | Tránh migration nhưng tiếp tục chịu chi phí thiết kế, test và bảo trì từng primitive. |

## 1. Mô hình source-owned components

Tài liệu giới thiệu chính thức mô tả shadcn/ui là tập component và nền tảng phân phối code, không phải library theo mô hình cài package rồi import. Trang tạo project nêu CLI đặt source trực tiếp dưới components/ui và người dùng sở hữu, tùy biến code.

Nguồn: [Introduction](https://ui.shadcn.com/docs), [Your project is ready](https://ui.shadcn.com/docs/new).

Hệ quả cho Fourty:

- Fourty có thể sửa source để khớp semantic tokens, API và layout; không bị khóa vào một runtime wrapper.
- Source trong tree thuận lợi cho review, static analysis, accessibility test và sửa bug theo contract nội bộ.
- Sau khi sửa, component là mã của Fourty về mặt bảo trì. Bản từ CLI/registry là upstream input, không phải bản update an toàn tự động.
- Tài liệu Tailwind v4 nói code nhận được gần như code team tự viết và dependency có thể nâng theo đường chính thức. Lợi thế này cũng chuyển trách nhiệm tích hợp về team.

Nguồn: [Tailwind v4 — Upgrade Your Project](https://ui.shadcn.com/docs/tailwind-v4#upgrade-your-project).

Fourty đã dùng mô hình tương tự ở mức nội bộ: src/components/button.tsx, src/components/select.tsx và src/components/ui.tsx là source-owned primitives với contract riêng. Adoption tự nhiên nhất là đưa source shadcn vào contract hiện có, không thay ownership bằng package khác.

### Bề mặt chuyển đổi đã kiểm tra trong Fourty

Đếm caller trực tiếp bằng `rg` cho thấy đây không phải thay đổi cục bộ:

| Contract hiện tại | Số file gọi | Số JSX usages | Ràng buộc đáng giữ |
| --- | ---: | ---: | --- |
| `Button` | 4 | 4 | `busy`/`loading`, link, `asChild`, safe button type |
| `Field` | 8 | 44 | required, hint/error IDs, `aria-describedby`, native `FormData` |
| `Modal` | 10 | 16 | nested focus stack, Escape LIFO, focus restore, mobile sheet layout |
| `Drawer` | 2 | 2 | shell và Company Preview behavior |
| `Select` | 11 | 30 | controlled/uncontrolled state, empty sentinel, hidden form input |

Ngoài ra, `.btn-primary` còn xuất hiện 29 lần trong 13 file TSX và `.btn-ghost` 53 lần trong 20 file TSX; các con số này gồm recipe mapping trong primitive hiện tại. `ContextToolbar`, `AsyncError`, `Spinner`, `EmptyState`, `PageHeader` và các CRM surfaces là contract sản phẩm không có bản thay thế trực tiếp từ shadcn/ui. Vì vậy, wholesale migration sẽ phải đổi API, CSS vocabulary, form submission và focus behavior ở nhiều flow; nó không chỉ thay component markup.

## 2. Dependencies, CLI và cấu hình

Tài liệu cài thủ công yêu cầu Tailwind CSS và liệt kê dependency nền cho setup mới: shadcn, class-variance-authority, cn, lucide-react và tw-animate-css. Component cụ thể có thể thêm Radix package hoặc dependency khác. Có thể copy/paste mà không cần components.json; file này cần khi dùng CLI add/update.

Nguồn: [Manual Installation](https://ui.shadcn.com/docs/installation/manual), [components.json](https://ui.shadcn.com/docs/components-json).

Fourty đã có Tailwind CSS, React 19, Radix Select/Dropdown, Zod và icon/module nội bộ, nhưng package.json hiện chưa có shadcn, class-variance-authority, cn, lucide-react hay tw-animate-css đồng bộ với setup manual. Nếu dùng CLI, đó là dependency và convention mới cần review; không nên cài cả bộ chỉ vì một component.

components.json là metadata cho CLI, không phải runtime contract. Các trường chính:

- style chọn style khởi tạo và không đổi sau initialization; style default đã deprecated, new-york được khuyến nghị.
- rsc quyết định CLI thêm use client cho client component hay không.
- tsx quyết định output .tsx hay .jsx.
- tailwind.config để trống với Tailwind v4; tailwind.css, baseColor, cssVariables mô tả stylesheet/theme.
- aliases quyết định nơi đặt components, ui, lib, hooks, utils và rewrite imports.
- Có thể dùng package.json#imports, nhưng TypeScript phải bật moduleResolution: bundler và resolvePackageJsonImports: true.

Nguồn: [components.json — configuration](https://ui.shadcn.com/docs/components-json#configuration), [components.json — aliases](https://ui.shadcn.com/docs/components-json#aliases).

Nếu Fourty adopt CLI, nên map alias/output vào cấu trúc src/components và src/lib hiện tại, rồi review CSS/import changes. Nếu chỉ lấy một component làm seed, xem registry item rồi tích hợp thủ công sẽ giảm dependency/convention phải nhận.

## 3. Compatibility: Tailwind 4, React 19 và Next 15

Trang compatibility của shadcn/ui xác nhận bản latest hỗ trợ Tailwind v4 và React 19; CLI có thể khởi tạo project với Tailwind v4; component đã được cập nhật; forwardRefs được bỏ theo type mới; primitive có data-slot. App cũ Tailwind v3/React 18 vẫn chạy, và component mới giữ v3/React 18 cho tới khi project upgrade.

Nguồn: [Tailwind v4 and React 19](https://ui.shadcn.com/docs/tailwind-v4).

Trang Next.js 15 + React 19 đã được ghi chú là có thể lỗi thời, nhưng update của trang xác nhận latest đã hỗ trợ đầy đủ. Hướng dẫn cũ nêu npm có thể cần force hoặc legacy-peer-deps cho package chưa khai báo React 19; pnpm, bun và yarn theo hướng dẫn đó không cần flag. Bảng upgrade status cho thấy phải kiểm tra dependency cụ thể, không suy ra mọi package phụ có cùng mức hỗ trợ.

Nguồn: [Next.js 15 + React 19](https://ui.shadcn.com/docs/react-19), [React 19 changelog](https://ui.shadcn.com/docs/changelog/2024-10-react-19).

Package hiện tại của Fourty đã có next ^15.3.4, react/react-dom ^19.1.0, tailwindcss ^4.1.10, @tailwindcss/postcss ^4.1.10 và Radix Select/Dropdown. Không có mismatch nền tảng cần migration trước khi thử component.

Rủi ro thực tế:

- Component mới kéo thêm dependency hoặc version peer khác.
- Theme/token syntax của shadcn không khớp semantic CSS variables hiện có.
- Generated source đổi cách dùng forwardRef, data-slot, cn hoặc class-variance-authority.
- App Router/RSC boundary vẫn phải kiểm tra; hook, event handler, portal và browser API cần client boundary tương ứng.

Tailwind v4 docs yêu cầu đọc compatibility docs trước khi upgrade và cảnh báo browser features hiện đại. Fourty đã ở v4 nên đây không phải blocker, nhưng browser support policy vẫn phải nhất quán.

Nguồn: [Tailwind v4 upgrade guidance](https://ui.shadcn.com/docs/tailwind-v4#upgrade-your-project).

## 4. Accessibility và trách nhiệm sau adoption

Radix nói primitive tuân theo WAI-ARIA authoring practices và xử lý nhiều chi tiết khó như aria/role, focus management và keyboard navigation; chúng được test trên browser và assistive technologies phổ biến.

Nguồn: [Radix accessibility overview](https://www.radix-ui.com/primitives/docs/overview/accessibility), [Radix introduction](https://www.radix-ui.com/primitives/docs/overview/introduction).

Đây là nền tảng tốt cho Dialog, Select, Dropdown, Popover và interaction phức tạp. Fourty đang dùng Radix Select và có focus scope/dialog riêng, nên có thể tận dụng behavior của primitive mà không viết lại keyboard/focus logic.

Radix vẫn giao trách nhiệm cho developer khi đổi underlying element hoặc dùng asChild: element thay thế phải accessible, functional, focusable khi cần, spread props/event handlers và forward ref. Developer phải cung cấp label để control có accessible name.

Nguồn: [Radix composition guide](https://www.radix-ui.com/primitives/docs/guides/composition), [Radix accessible labels](https://www.radix-ui.com/primitives/docs/overview/accessibility#accessible-labels).

shadcn Field/forms mô tả pattern tương tự: gắn FieldLabel với htmlFor, dùng aria-invalid trên control, data-invalid trên Field và hiển thị FieldError.

Nguồn: [Field component](https://ui.shadcn.com/docs/components/radix/field), [React Hook Form guide](https://ui.shadcn.com/docs/forms/react-hook-form), [Input component](https://ui.shadcn.com/docs/components/radix/input).

Fourty có yêu cầu chặt hơn việc “dùng component accessible”: Button yêu cầu tên cho icon-only action; Field nối hint/error IDs và aria-invalid; DialogFocusScope quản lý nested LIFO Escape/focus restore; docs yêu cầu focus ring, reduced motion và hit area. Khi nhập Button/Dialog/Field từ shadcn, phải giữ hoặc chứng minh tương đương các hành vi này bằng test hiện có. Dùng Radix/shadcn không thay thế accessibility audit.

## 5. Update và maintenance model

Source-owned component không có upgrade package tự động. shadcn/ui hướng dẫn rằng khi dependency có release mới, người dùng theo đường upgrade chính thức vì code nằm trong app. Với thay đổi dark mode colors, tài liệu khuyên commit trước, chạy add --all --overwrite, rồi review và áp lại custom changes vì CLI sẽ overwrite component.

Nguồn: [Tailwind v4 changelog/update instructions](https://ui.shadcn.com/docs/tailwind-v4#changelog).

Maintenance model nên là:

1. Theo dõi changelog/docs và dependency.
2. Xem source mới và diff trước overwrite.
3. Giữ contract tests cho API, ARIA, focus, responsive behavior và token.
4. Sửa tại Fourty khi cần; không trông chờ upstream giữ nguyên API sau khi fork.

CLI v4 hiện có `--dry-run`, `--view` và `--diff`, cho phép xem payload, file sẽ ghi và khác biệt với source hiện tại trước khi thay đổi workspace. Đây là đường thử phù hợp cho Fourty: inspect trước, nhập một component, rồi merge thủ công với contract hiện tại thay vì dùng overwrite hàng loạt.

Nguồn: [shadcn/cli v4](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4).

Chi phí dài hạn không nằm ở npm update cho từng component mà ở đối chiếu fork với upstream. Với vài primitive được chọn, chi phí chấp nhận được; nó tăng nhanh nếu feature screen fork block từ nhiều registry khác nhau.

## 6. Registry, customization và supply-chain risk

Schema registry item gồm type, registryDependencies, npm dependencies/devDependencies, files và target path. CLI đọc components.json để xác định target mặc định; placeholder @ui/, @components/, @lib/ và @hooks/ cài theo alias project thay vì hard-code thư mục.

Nguồn: [registry-item.json schema](https://ui.shadcn.com/docs/registry/registry-item-json).

Registry Directory hỗ trợ registry công khai; namespace có thể trỏ tới registry private và headers/env token. GitHub repository cũng có thể làm registry, kể cả private qua GitHub CLI hoặc token. Payload có thể xem trước bằng shadcn view.

Nguồn: [Registry Directory](https://ui.shadcn.com/docs/registry/registry-index), [Namespaces](https://ui.shadcn.com/docs/registry/namespace), [GitHub Registries](https://ui.shadcn.com/docs/registry/github).

Fourty có thể tạo registry nội bộ cho primitive/block đã chuẩn hóa, nhưng nên làm sau khi API và test ổn định. Registry item có thể phân phối component, hook, lib, CSS/token hoặc block; dependency và registry dependency được khai báo trong JSON.

Nguồn: [Registry getting started](https://ui.shadcn.com/docs/registry/getting-started), [registry-item file targets](https://ui.shadcn.com/docs/registry/registry-item-json#files).

Registry Directory cảnh báo community registry do bên thứ ba duy trì và yêu cầu review code trước khi cài. Registry Health là experimental và không monitor private registry, registry cấu hình trực tiếp hay GitHub registry.

Nguồn: [Registry Directory](https://ui.shadcn.com/docs/registry/registry-index), [Registry Health](https://ui.shadcn.com/docs/registry/health).

Policy phù hợp: chỉ dùng official hoặc registry nội bộ đã review; ghi source URL/commit trong PR; review dependencies, registryDependencies, target và config đi kèm; không coi health score là security approval.

## 7. Trade-off matrix

Điểm 1–5 là đánh giá cho Fourty. Hiệu năng là mức overhead runtime trực tiếp của mô hình; source-owned code không tự tạo package layer, nhưng Radix/dependency và client boundary vẫn có chi phí.

| Phương án | Hiệu năng | Độ phức tạp triển khai | Bảo trì | Chi phí ngắn hạn | Adoption risk | Architectural fit |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Adopt component có chọn lọc, giữ contract Fourty | 4 | 4 | 4 | 4 | 4 | 5 |
| Baseline shadcn cho khu vực UI mới | 4 | 3 | 3 | 3 | 3 | 4 |
| Rewrite toàn bộ primitive | 3 | 1 | 2 | 1 | 1 | 2 |
| Tiếp tục tự xây toàn bộ | 4 | 3 | 3 | 5 | 3 | 3 |

Diễn giải:

- Selective adoption giới hạn dependency và map component vào contract đã biết.
- Rewrite phải chuyển API, test, token và focus behavior, nên chi phí và regression risk cao.
- Source ownership tăng kiểm soát nhưng tạo fork cần theo dõi.
- Nhiều registry/block làm tăng số upstream cần review.
- Peer support phải kiểm tra theo package; docs React 19 là bằng chứng trực tiếp cho điểm này.

## 8. Đề xuất migration có kiểm soát

1. Chọn một component có gap rõ, không bắt đầu bằng toàn bộ UI.
2. Chốt contract Fourty trước: props, defaults, CSS token, RSC boundary, keyboard/focus và accessibility tests.
3. Xem source/registry item và dependency tree; ưu tiên official registry.
4. Dùng `add <component> --dry-run` hoặc `--view` để kiểm tra payload trước; chỉ thêm `components.json` nếu chọn workflow CLI lâu dài.
5. Nhập source vào thư mục hiện có rồi map class/token/API; không thêm dependency chỉ để mô phỏng toàn bộ setup mặc định khi component cụ thể không cần.
6. Chạy focused render, keyboard, focus restore, labels/errors và reduced-motion tests; chạy typecheck/build nếu đổi RSC hoặc CSS config.
7. Ghi upstream URL và version/commit trong PR hoặc maintainer docs.
8. Chỉ cân nhắc registry nội bộ sau vài component ổn định.

Không dùng overwrite hàng loạt trên src/components khi chưa có snapshot/commit và mapping contract. Tài liệu chính thức nói overwrite ghi đè component và yêu cầu review/re-apply custom changes.

## Nguồn chính và độ tin cậy

- shadcn/ui official docs: [Introduction](https://ui.shadcn.com/docs), [official resources](https://ui.shadcn.com/docs/official), [Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4), [React 19](https://ui.shadcn.com/docs/react-19), [components.json](https://ui.shadcn.com/docs/components-json), [manual installation](https://ui.shadcn.com/docs/installation/manual), registry schemas/docs. Đây là nguồn sở hữu CLI, schema và component guidance.
- Radix official docs: [Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility), [Introduction](https://www.radix-ui.com/primitives/docs/overview/introduction), [Composition](https://www.radix-ui.com/primitives/docs/guides/composition). Đây là nguồn sở hữu behavior/accessibility contract của primitive.
- Fourty repo: package.json, docs/design-system.md, src/components/button.tsx, src/components/select.tsx và src/components/ui.tsx. Đây là bằng chứng trực tiếp về stack và contract hiện tại.

## Giới hạn và câu hỏi còn mở

- Chưa benchmark bundle, hydration, interaction latency hoặc Lighthouse giữa primitive Fourty và từng component shadcn; cần PoC cụ thể.
- Chưa kiểm tra toàn bộ registry hoặc mọi package version trong lockfile; compatibility cần xác nhận tại PR.
- Chưa chọn component đầu tiên cho PoC; cần dựa trên gap UI và owner của contract.
- Nếu Fourty phân phối UI cho nhiều app/workspace, cần quyết định registry nội bộ hay monorepo package là artifact chính thức; nghiên cứu này mới xác nhận capability, chưa thiết kế release/versioning.

Status: DONE
Summary: Đã nghiên cứu shadcn/ui/Radix từ nguồn chính thức và đối chiếu với stack, contract UI hiện tại của Fourty. Khuyến nghị adopt có chọn lọc, giữ ownership và contract Fourty; không có cơ sở cho wholesale rewrite.
Concerns/Blockers: Cần PoC component cụ thể để đo bundle/hydration và chốt component đầu tiên; compatibility của dependency phụ phải được kiểm tra tại thời điểm thêm vào.

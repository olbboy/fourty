# Audit UI/UX live Fourty

Ngày audit: 2026-10-12 (Asia/Ho_Chi_Minh)
Commit kiểm tra: `d721238`
URL: `http://localhost:3000`
Viewport: desktop `1440×900`, mobile `390×844`

## Phạm vi và phương pháp

Audit read-only trên live app. Đã đọc luồng fixture trong `e2e/auth.setup.ts`, đăng nhập bằng fixture E2E hiện hữu khi cần, điều hướng và kiểm tra bằng Playwright/CUA, kiểm tra keyboard/focus và đối chiếu các nhánh loading/error trong source. Không tạo, sửa, xoá dữ liệu; không start/stop server/container.

Mỗi route dưới đây đã được mở ở cả hai viewport sau khi đăng nhập thành công. Playwright đã assert URL sau điều hướng không phải `/login` trước khi chụp ảnh. Ảnh chụp là review artifact tạm thời và không được commit vì repository chưa có convention cho visual baseline.

| Screen | Desktop `1440×900` | Mobile `390×844` | Kết quả |
| --- | --- | --- | --- |
| Dashboard | Đã kiểm tra | Đã kiểm tra | Audit thành công |
| Companies | Đã kiểm tra | Đã kiểm tra | Audit thành công |
| Contacts | Đã kiểm tra | Đã kiểm tra | Audit thành công |
| Deals | Đã kiểm tra | Đã kiểm tra | Audit thành công |
| Tasks | Đã kiểm tra | Đã kiểm tra | Audit thành công |
| Settings/Pipelines | Đã kiểm tra | Đã kiểm tra | Audit thành công |

## Điểm tốt đã xác minh

- Dashboard desktop có hierarchy rõ: sidebar 224px, bốn KPI, chart/pipeline và các card hoạt động; toàn bộ viewport desktop không có page-level horizontal overflow.
- Companies desktop có table dễ scan: tên/domain, cột ổn định, checkbox, Preview có nhãn và pagination. Contacts/Companies giữ được table wrapper riêng khi mobile nên không làm tràn body.
- Tasks mobile có card, priority, due date, status và link contact dễ phân biệt; padding cuối trang tránh bị bottom navigation che.
- Settings/Pipelines có empty/loading/error affordance đầy đủ hơn các màn hình dữ liệu khác; pipeline desktop hai pane và mobile stack theo chiều dọc hợp lý.
- `globals.css` có focus ring `:focus-visible` và hỗ trợ `prefers-reduced-motion`.

## Findings theo tác động

### P1 — ảnh hưởng truy cập hoặc hoàn thành tác vụ

#### NAV-01 — Mobile không có đường dẫn trực quan tới Reports, Workflows và Settings

- **Loại:** Bug UX/navigation; việc chọn năm mục bottom nav có thể là product preference, nhưng thiếu mục More/menu khiến các route còn lại không discoverable.
- **Screen/viewport:** Tất cả screen mobile, thấy rõ ở Dashboard/Settings `390×844`.
- **Repro:** Mở `/dashboard` ở `390×844`; bottom nav chỉ có Dashboard, Contacts, Companies, Deals, Tasks. Sidebar bị ẩn. Reports, Workflows, Settings chỉ có thể tới bằng URL trực tiếp hoặc command palette; không có affordance “More”.
- **Tác động:** Người dùng mobile không biết cách tới các route quản trị; đặc biệt Settings không thể hoàn thành từ navigation bình thường.
- **Đề xuất đo được:** Thêm More/menu vào bottom nav hoặc header, bảo đảm Reports/Workflows/Settings đều tới được trong tối đa một tap từ shell; mục active phải có trạng thái rõ; hit area mỗi item tối thiểu `44×44px`.

#### A11Y-01 — Record trong Contacts và Deals không tới được bằng keyboard

- **Loại:** Accessibility bug.
- **Screen/viewport:** Contacts và Deals desktop/mobile, kiểm tra ở `1440×900` và `390×844`.
- **Repro:** Vào `/contacts` hoặc `/deals`, dùng `Tab`. Tên contact trong `<tr onClick>` và card deal trong `<div draggable onClick>` không nhận focus, không có role/link/button; người dùng keyboard không thể mở record. CUA cũng không đưa focus vào các card khi tab qua trang.
- **Tác động:** Điều hướng record bị giới hạn cho chuột/touch; screen reader không có semantic action để mở record.
- **Đề xuất đo được:** Dùng `<a>`/`<button>` cho action mở record. Nếu buộc giữ row/card, thêm `tabIndex=0`, role phù hợp, Enter/Space handler và `:focus-visible`; mọi record phải xuất hiện trong thứ tự tab và có accessible name.

#### ERR-01 — Một số lỗi API có thể để màn hình ở spinner vô hạn

- **Loại:** Error-state bug; đây là code-path finding, chưa fault-inject API trên live để giữ audit read-only.
- **Screen/viewport:** Dashboard, Contacts, Deals, Tasks ở cả hai viewport.
- **Repro có thể lặp trong test/staging:** Chặn hoặc trả `500` cho GET tương ứng rồi reload. `dashboard-client.tsx`, `contacts-client.tsx`, `deals-client.tsx` và `tasks-client.tsx` chỉ xử lý success/đợi object; nhánh render hiện tại tiếp tục `Spinner`, không có catch/error/retry. Companies và Settings/Pipelines đã có pattern error/retry để làm chuẩn đối chiếu.
- **Tác động:** Người dùng không biết tải thất bại hay còn đang tải, không có cách phục hồi trong trang.
- **Đề xuất đo được:** Mỗi fetch có state `loading/success/error`, timeout/network failure đều chuyển sang `role="alert"` với nguyên nhân ngắn và nút Retry; Retry phải giữ filter/route; Spinner thêm `role="status"`/accessible label khi đang tải.

#### A11Y-02 — Nút xoá thành viên Settings không có accessible name

- **Loại:** Accessibility/action bug.
- **Screen/viewport:** Settings → Team members, desktop/mobile.
- **Repro:** Mở Settings và inspect các nút xoá member. Nút icon kích thước khoảng `32×32px`, không có `aria-label` hoặc `title`; `getByRole('button', {name:/remove|delete/i})` không nhận diện các nút này. Nút edit/delete pipeline có label nên đây là inconsistency cụ thể.
- **Tác động:** Screen reader không biết nút làm gì; người dùng touch có target nhỏ.
- **Đề xuất đo được:** Thêm `aria-label="Remove <member name>"`, confirmation copy có tên member và mở rộng hit area tối thiểu `44×44px` (giữ icon hiện tại `16–20px`).

### P2 — ảnh hưởng scanning, responsive hoặc thao tác touch

#### RWD-01 — Table Companies/Contacts cần swipe ngang nhưng không báo hiệu

- **Loại:** Responsive UX bug; việc giữ đủ cột trên mobile là product preference.
- **Screen/viewport:** Companies và Contacts mobile `390×844`.
- **Repro:** Companies table có content width khoảng `760px` trong wrapper hiển thị `356px`; Contacts khoảng `720px` trong wrapper `356px`, `overflow-x:auto`. Ảnh chỉ cho thấy các cột đầu (Companies: NAME/INDUSTRY; Contacts: NAME/COMPANY), các cột status/score/activity nằm ngoài viewport; không có scrollbar/cue hoặc hướng dẫn.
- **Tác động:** Người dùng dễ bỏ sót cột quan trọng và không biết còn dữ liệu bên phải.
- **Đề xuất đo được:** Ở `≤767px`, ưu tiên card/column set tối thiểu cho task chính; nếu giữ table, sticky cột đầu, thêm fade/“Vuốt ngang để xem thêm” và scrollbar/cue nhìn thấy khi có overflow. Giữ body `scrollWidth = viewport` như hiện tại.

#### RWD-02 — Kanban Deals mobile cắt stage và không có hướng dẫn thao tác

- **Loại:** Responsive/discoverability bug; chọn Kanban làm view mặc định là product preference.
- **Screen/viewport:** Deals mobile `390×844`.
- **Repro:** Mở `/deals`; board có `overflow-x-auto`, mỗi stage `256px`, viewport chỉ thấy Lead và một phần Qualified; stage sau nằm ngoài màn hình. Hint drag ở footer dùng `hidden md:block` nên biến mất trên mobile. Card dùng HTML5 `draggable`, điều này không đảm bảo thao tác drag trên touch.
- **Tác động:** Pipeline bị hiểu là chỉ có một vài stage; drag card trên điện thoại khó hoặc không khả dụng.
- **Đề xuất đo được:** Hiển thị cue “Vuốt ngang để xem stage”, duy trì scrollbar/fade, cho phép mở card bằng tap; cân nhắc default List ở `≤767px` nếu drag touch chưa được hỗ trợ. Các stage phải reachable bằng swipe và không che action.

#### DENS-01 — Bộ lọc Contacts desktop bị xếp thành các hàng full-width

- **Loại:** Layout consistency bug, không chỉ là preference vì làm tăng khoảng trống và phá pattern giữa các list.
- **Screen/viewport:** Contacts desktop `1440×900`.
- **Repro:** `All statuses` và `Recently updated` mỗi control rộng khoảng `1152px` và chiếm một hàng riêng; Companies cùng viewport giữ search/filter/sort trên một hàng. Nguyên nhân là select kế thừa width full trong layout `flex-wrap`.
- **Tác động:** Mật độ thấp, scan filter chậm và nội dung table bị đẩy xuống.
- **Đề xuất đo được:** Ở `≥768px`, giữ filter trong một hàng với min-width khoảng `160–220px` và search phần còn lại; chỉ stack khi `<640px`. Giữ khoảng cách `8px` giữa controls.

#### TOUCH-01 — Nhiều action mobile nhỏ hơn target touch 44px

- **Loại:** Touch/accessibility bug.
- **Screen/viewport:** Tất cả mobile; rõ ở header, list toolbar và Settings/Pipelines `390×844`.
- **Repro:** Đo được header Search khoảng `38×34`, Companies Preview `70×30`, Deals view/export khoảng `36×32`/`45×33`, Settings stage move khoảng `29×30`, edit/delete khoảng `32×24`. Đây là kích thước hit area thực tế, không chỉ kích thước icon.
- **Tác động:** Dễ bấm nhầm trên touch và không đạt target tối thiểu cho action thường dùng.
- **Đề xuất đo được:** Đặt `min-width/min-height:44px` cho mọi action interactive trên mobile, cách nhau tối thiểu `8px`; giữ kích thước icon/visual hiện tại bằng padding.

### P3 — copy và polish

#### COPY-01 — “Companys” trong Settings → Custom fields

- **Loại:** Copy bug.
- **Screen/viewport:** Settings desktop/mobile khi cuộn tới Custom fields.
- **Repro:** Chọn entity Company; UI ghép hậu tố `s` trực tiếp nên hiển thị “Companys” trong tab/empty copy.
- **Tác động:** Giảm độ tin cậy của khu vực admin, đặc biệt trong giao diện tiếng Anh.
- **Đề xuất đo được:** Dùng map plural hoá (`company → companies`, `contact → contacts`, …) và test snapshot/visual cho toàn bộ entity labels.

## Phân biệt preference và bug

Kanban mặc định, việc giữ table nhiều cột, và giới hạn năm mục bottom nav đều có thể là quyết định sản phẩm. Findings trên tập trung vào hậu quả có thể đo được của implementation hiện tại: route không discoverable, overflow không có cue, card/row không keyboard-accessible, drag touch không có fallback và action dưới target. Nếu product xác nhận các preference này là bắt buộc, vẫn cần các affordance/accessibility đề xuất để giữ khả năng sử dụng.

## Câu hỏi chưa giải quyết

1. Trên mobile, Reports/Workflows/Settings có phải route bắt buộc trong một phiên làm việc thông thường không? Nếu có, mục More/menu nào là pattern được duyệt?
2. Product muốn giữ Kanban làm view mặc định trên màn hình `≤767px`, hay chấp nhận List mặc định cho thao tác touch?
3. Người dùng mobile cần những cột nào của Companies/Contacts để quyết định card view hoặc column priority?
4. Copy/error message và hành vi Retry nào cần thống nhất giữa Dashboard, Contacts, Deals và Tasks?

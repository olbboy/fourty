# UI Standards Review

Fixed point: `24997d2ff6ff72030265788ea966632ea7b0c352` (`HEAD` tại thời điểm review; phạm vi là working tree hiện tại).

## Findings

### P1 — Pipeline settings phát GET liên tục sau mỗi render

- Evidence: `src/app/(app)/settings/pipeline-settings.tsx:60-81` tạo `load` bằng `useCallback(..., [t])` rồi chạy effect phụ thuộc `load`. `src/lib/i18n/provider.tsx:21-23` trả về một arrow function mới ở mỗi lần gọi `useT()`. Mỗi `load()` lại gọi `setLoading`, `setPipelines`, `setSelectedId` và `setError`, gây render mới, tạo `t`/`load` mới và kích hoạt effect lại.
- Impact: `/settings` tạo vòng lặp request `/api/pipelines`, nhấp nháy loading, tải backend liên tục và làm các thao tác mutation/race khó đoán.
- Fix direction: làm translator ổn định theo `locale` (`useCallback`) hoặc tránh đưa translator không ổn định vào dependency của loader; tách fetch khỏi chuỗi render và thêm kiểm tra số request trong test.

### P1 — Đổi pipeline khi tạo Deal vẫn submit stage của pipeline cũ

- Evidence: `src/app/(app)/deals/deal-form.tsx:28-30` quản lý `pipelineId`, nhưng Select stage ở `:98-107` là uncontrolled với `defaultValue`. Khi `pipelineId` đổi qua Select ở `:88-95`, options stage đổi nhưng giá trị nội bộ của Radix Select không reset theo `defaultValue`. Submit ở `:47-50` gửi `pipelineId` mới cùng `stageId` cũ. API từ chối cặp này tại `src/app/api/deals/route.ts:64-67` (`Invalid stage for pipeline`). Native select cũ tự rơi về một option còn tồn tại khi option đã chọn bị loại; wrapper uncontrolled mới giữ giá trị cũ.
- Impact: người dùng chọn pipeline khác rồi tạo deal sẽ nhận lỗi thay vì tạo thành công; trigger stage cũng có thể mất nhãn vì value không còn trong options.
- Fix direction: quản lý `stageId` bằng state controlled và reset về stage đầu tiên mỗi khi `pipelineId` đổi (hoặc remount Select theo pipeline, nhưng vẫn phải đảm bảo payload lấy stage hợp lệ). Thêm E2E đổi pipeline rồi tạo Deal và kiểm payload.

### P1 — Escape trên Select trong Modal đóng cả form Modal

- Evidence: Select luôn portal content ra ngoài ở `src/components/select.tsx:86-112`. Radix xử lý Escape ở capture phase và `preventDefault`, nhưng listener bubble của modal tại `src/components/ui.tsx:96-103,127` không kiểm tra `event.defaultPrevented`; nó luôn gọi `onClose`. Các modal mới có Select gồm Stage form (`src/app/(app)/settings/pipeline-settings.tsx:503-527,601-612`), Deal/Contact/Task/custom-field forms và mobile company filters.
- Impact: thao tác bàn phím chuẩn để chỉ đóng listbox có thể đóng toàn bộ modal, làm mất dữ liệu form chưa lưu. Test mobile hiện chỉ kiểm Escape trên Select ngoài modal (`e2e/pipeline-settings.spec.ts:298-302`) nên không bắt lỗi layering này.
- Fix direction: modal phải bỏ qua Escape đã được lớp con xử lý (`event.defaultPrevented`) hoặc dùng một dialog primitive có quản lý layer/focus scope tương thích với Radix. Thêm test mở Select trong modal, nhấn Escape, assert listbox đóng nhưng dialog còn mở và focus trở về trigger.

### P2 — Lỗi mutation trong modal được render phía sau overlay

- Evidence: các catch của create/update giữ modal mở và chỉ ghi lỗi chung, ví dụ `src/app/(app)/settings/pipeline-settings.tsx:169-189` và `:192-215`. Alert duy nhất nằm ở card nền tại `:281-295`, còn modal nằm ở `:503-527`.
- Impact: khi tạo/sửa stage hoặc pipeline thất bại, người dùng thị giác không thấy lý do ngay trong surface đang thao tác; alert bị che sau backdrop. E2E chỉ kiểm conflict reorder ngoài modal (`e2e/pipeline-settings.spec.ts:249-265`).
- Fix direction: giữ lỗi theo mutation/form và render `role="alert"` trong modal đang mở, hoặc đóng modal trước khi hiển thị lỗi ở card. Thêm case API create/update thất bại.

### P2 — Popup Select không có giới hạn chiều rộng theo viewport

- Evidence: `src/app/globals.css:164-177` đặt `min-width` và `max-height` cho `.select-content` nhưng không đặt `max-width`; `.select-item` cũng không wrap/truncate. Options chứa dữ liệu người dùng như pipeline name ở `src/app/(app)/settings/pipeline-settings.tsx:324-328` và company/custom-field labels ở các callsite khác.
- Impact: tên dài có thể làm listbox rộng hơn viewport trên mobile dù Popper đã collision-position, tạo tràn ngang và option khó thao tác.
- Fix direction: giới hạn bằng available-width/viewport (`--radix-select-content-available-width`) và quy định wrap hoặc ellipsis cho text item; thêm test viewport hẹp với label dài.

### P3 — Loại stage hiển thị enum tiếng Anh trong locale tiếng Việt

- Evidence: `src/app/(app)/settings/pipeline-settings.tsx:418` render trực tiếp `stage.type`, trong khi chính component đã có nhãn dịch `settings.stageTypeOpen/Won/Lost` tại `:640-647` và catalog Việt tương ứng.
- Impact: phần Pipeline bị trộn `open`/`won`/`lost` vào giao diện tiếng Việt.
- Fix direction: map `stage.type` qua các message key đang có trước khi render.

### P3 — Dependency aggregate kéo toàn bộ Radix suite cho hai primitive

- Evidence: `package.json:31` thêm package aggregate `radix-ui`. Entry này khai báo 55 direct Radix dependencies; lockfile hiện có 60 package `@radix-ui/*`, trong khi code mới chỉ import Select và DropdownMenu (`src/components/select.tsx:5`, `src/components/dropdown-menu.tsx:5`). `package-lock.json` tăng 1,851 dòng và giảm 97 dòng trong diff.
- Impact: install/lockfile/audit surface tăng đáng kể ngoài nhu cầu của scope, dù bundler có thể tree-shake client bundle.
- Fix direction: phụ thuộc trực tiếp `@radix-ui/react-select` và `@radix-ui/react-dropdown-menu`, rồi import từ hai package đó.

### P3 — Test Pipeline tuyên bố xóa pipeline nhưng không thực hiện

- Evidence: test `e2e/pipeline-settings.spec.ts:204` có tên “loads, creates, edits, and deletes pipelines and stages”, nhưng chuỗi thao tác `:214-246` chỉ xóa stage; không click nút delete pipeline hoặc assert pipeline biến mất. Test cũng không thao tác Select loại stage, nên không xác nhận quy tắc won=100/lost=0 hay form submission qua wrapper.
- Impact: tiêu đề tạo tín hiệu coverage sai và bỏ trống các nhánh mutation/Select mới.
- Fix direction: thêm thao tác xóa một pipeline không-default và assertions tương ứng; chọn stage type trong create/edit và kiểm payload/UI, hoặc thu hẹp tên test nếu không chủ định cover các hành vi đó.

## Validation

- `npx tsc --noEmit`: pass.
- Không chạy E2E vì yêu cầu không khởi động server/đụng test DB.
- Không sửa code, cấu hình, DB hay process runtime.

## Unresolved questions

- Không có.

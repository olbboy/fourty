# Đánh giá: thay Postgres bằng D1, có giữ được RLS và đủ tính năng không

Ngày 2026-10-12. Kỹ năng dùng: `mattpocock-skills:prototype` (hai bản chạy thử trên engine D1 và Durable Object local), `mattpocock-skills:research` (agent đọc tài liệu gốc), `mattpocock-skills:codebase-design` (đo seam trong code).
Dữ kiện có nguồn: [research-261012-1517-d1-sql-capabilities.md](./research-261012-1517-d1-sql-capabilities.md), [research-261012-1435-cloudflare-platform-facts.md](./research-261012-1435-cloudflare-platform-facts.md).

## Kết luận một dòng

**D1 không có RLS, và không thể đạt đủ tính năng như Postgres với kiến trúc hiện tại của Fourty.** RLS giả lập được một phần bằng view + trigger (bản thử đạt 5/5 ca chặn đọc và ghi chéo workspace), nhưng có ba lỗ mà Postgres không có: code đọc thẳng bảng gốc là thấy hết; không có transaction nhiều bước; tìm kiếm tiếng Việt kém đi. Trên Cloudflare, chỉ một hướng gần với "đủ tính năng": **mỗi workspace một Durable Object có SQLite riêng**. Bản thử chứng minh hướng này tách dữ liệu và rollback đúng. Cái giá là viết lại cách toàn bộ app truy cập dữ liệu (110 file), không còn là "đổi database".

## Từ chuyên môn (định nghĩa một lần)

- **D1**: SQLite do Cloudflare quản lý. Mỗi DB D1 thực chất chạy trên **một** Durable Object, xử lý từng câu một ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).
- **Durable Object (DO)**: một "ô" code kèm ổ SQLite riêng, gọi theo tên (ví dụ `getByName("acme")`). Số lượng ô không giới hạn, mỗi ô tối đa 10 GB ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).
- **RLS**: Postgres tự lọc dòng theo workspace ở tầng database, nên code có quên `WHERE workspace_id` cũng không lộ dữ liệu.
- **Transaction tương tác**: mở transaction, đọc, để code JS quyết định, rồi ghi; lỗi ở bất kỳ bước nào thì mọi thứ quay về như cũ. `withWorkspace()` của Fourty dựa hoàn toàn vào điều này.
- **`batch()`**: cách duy nhất D1 gom nhiều câu thành một transaction. Mọi câu phải biết trước, không có bước JS chen giữa.
- **View / trigger**: view là "bảng ảo" lọc từ bảng thật; trigger là đoạn SQL tự chạy khi có insert/update/delete.

## Câu hỏi này thật sự hỏi gì

Có hai câu hỏi lồng nhau:

1. **RLS:** D1 có tự bảo vệ dữ liệu ACME khỏi workspace GLOBEX khi code có lỗi không?
2. **Đủ tính năng:** những hành vi Postgres mà Fourty đang dựa vào có tương đương trên D1 không? Kiểm kê code cho thấy các hành vi đó là: 27 policy RLS và `DEFAULT current_setting(...)` (48/55 lệnh insert để DB tự điền `workspace_id`); 36 file chạy trong transaction tương tác; audit log khóa bằng `REVOKE` + `RULE`; 15 lời gọi `ilike(`; 3 chỗ `jsonb_*` trong `src/lib/custom-objects.ts`; 1 chỗ `FOR UPDATE SKIP LOCKED`; pg-boss; 35 bảng `pgTable`.

Một tin tốt: schema gần như chỉ dùng `text` (214 cột) và `integer` (18 cột), di sản từ thời Fourty còn chạy SQLite. **Kiểu dữ liệu không phải chỗ vướng.**

## Bằng chứng thực nghiệm

### Bản thử 1: giả lập RLS trên D1 (wrangler 4.149.0, engine D1 local, DB trong bộ nhớ)

Cách giả lập: dữ liệu thật nằm ở `_contacts`; app chỉ thấy view `contacts`, lọc theo bảng ngữ cảnh `_ctx` (thay cho `current_setting`). Ba trigger INSTEAD OF đóng vai `WITH CHECK` và cột mặc định. Mỗi "request" là một `batch()` gồm: đặt ngữ cảnh, chạy câu lệnh, xoá ngữ cảnh.

| # | Tình huống (chị Lan ở ACME, chị Hoa ở GLOBEX) | Kết quả | Ý nghĩa |
|---|---|---|---|
| 1 | ACME mở danh sách contacts | Chỉ thấy Lan, Minh | Đạt |
| 2 | ACME thêm contact, không ghi `workspace_id` | Trigger tự điền `acme` | Thay được `DEFAULT current_setting` |
| 3 | ACME cố ghi contact vào GLOBEX | Bị chặn, không dòng nào được ghi | Thay được `WITH CHECK` |
| 4 | ACME sửa/xoá contact id=3 của GLOBEX | 0 dòng bị ảnh hưởng | Đạt |
| 5 | Quên đặt workspace | Đọc 0 dòng, ghi bị chặn | Fail-closed như Postgres |
| 6 | **Code đọc thẳng bảng gốc `_contacts`** | **Thấy 4 dòng của mọi workspace** | **Lỗ hổng**: D1 không có role, nên không có thứ tương đương `FORCE RLS` + role `fourty_app` |
| 7 | **Hai request xen kẽ, ngữ cảnh đặt ngoài batch** | **ACME thấy `Hoa (GLOBEX)`** | **Rò dữ liệu**: chỉ an toàn khi mọi câu đều gói chung với ngữ cảnh trong một batch |
| 8 | **`BEGIN … COMMIT`** | **Lỗi**: "please use the state.storage.transaction() or transactionSync() APIs instead" | **Không có transaction tương tác** |
| 9 | Sửa/xoá audit log | Bị chặn bằng trigger `RAISE(ABORT)` | Thay được `REVOKE` + `RULE` |
| 10 | **Tìm "đạt" trong "Đạt Nguyễn" bằng LIKE** | **0 kết quả**; `lower('ĐẠT')` = `ĐẠt` | **Thoái lui**: Postgres hiện tại (`en_US.utf8`) trả `true` cho đúng phép so này, tôi đã chạy thử trên container `fourty-0747-review-postgres` |
| 11 | FTS5 + `remove_diacritics 2` | "nguyen" ra; **"dat" không ra "Đạt"** | Có FTS5, nhưng chữ "Đ" không bao giờ thành "D" |
| 12 | `->>`, `json_each`, `jsonb()` | Chạy được (ở local) | Thay được `jsonb_*`; trên D1 thật thì `jsonb_*` chưa kiểm |
| 13 | Hai worker cùng nhận việc bằng `UPDATE … RETURNING` | Mỗi worker nhận một việc khác nhau | Thay được `FOR UPDATE SKIP LOCKED` |
| 14 | Một câu 120 tham số | Lỗi "too many SQL variables" | Trần 100 tham số áp ngay ở local; import CSV phải chia nhỏ |

### Bản thử 2: mỗi workspace một Durable Object (`wrangler dev --local`)

| # | Tình huống | Kết quả |
|---|---|---|
| 1-4 | ACME và GLOBEX thêm và liệt kê contacts, **SQL không có điều kiện workspace nào** | Mỗi bên chỉ thấy dữ liệu của mình, vì hai bên là hai file SQLite khác nhau |
| 5 | ACME chốt deal: đọc contact → JS quyết định → ghi deal → **sập trước khi ghi audit** | `deals: 0, audit: 0`, rollback trọn vẹn |
| 6 | Chốt deal bình thường | `deals: 1, audit: 1` |
| 7 | GLOBEX chốt deal cho contact id=2 (id thuộc ACME) | "contact not found", vì GLOBEX không nhìn thấy dữ liệu ACME |

Giới hạn của bằng chứng: cả hai bản thử chạy trên engine local, chưa chạy trên D1 hay DO thật. Hành vi số 8 khớp với tài liệu và lời PM D1 rằng "no current or future plans" cho transaction tương tác ([workers-sdk#2733](https://github.com/cloudflare/workers-sdk/issues/2733#issuecomment-2712365336)).

## Vì sao ba lỗ đó quan trọng với Fourty

- **Lỗ 6 (đọc thẳng bảng gốc).** Hôm nay, nếu một dev viết `sql\`select * from contacts\`` và quên lọc, Postgres vẫn chặn. Trên D1, lớp bảo vệ thứ hai trong ADR-001 chỉ còn là quy ước cộng một bài test cấm nhắc tên `_contacts` ngoài tầng dữ liệu. Nghĩa là cùng chỗ lỗi đó có thể làm lộ dữ liệu.
- **Lỗ 7 + 8 (ngữ cảnh và transaction).** Muốn an toàn thì mọi câu lệnh phải gói thành `batch([đặt ngữ cảnh, câu lệnh, xoá ngữ cảnh])`. Hệ quả:
  - Mỗi lần **đọc** cũng thành một lần **ghi**, nên mọi request của mọi workspace xếp hàng qua một luồng ghi duy nhất. Read replica cũng thành vô dụng.
  - Các luồng "đọc → kiểm quyền → ghi" như xoá company (5 lệnh ghi trong `src/lib/actions/companies/delete.ts`) hay `record-fact.ts` (8 lệnh ghi) mất tính nguyên tử. Nếu sập giữa chừng, dữ liệu bị ghi dở. 34 file có từ 2 lệnh ghi trở lên.
- **Lỗ 10 + 11 (tiếng Việt).** Gõ "đạt" không ra "Đạt" là lỗi người dùng Việt thấy ngay. Cách sửa duy nhất là thêm cột tìm kiếm do app tự bỏ dấu (đ→d, rồi bỏ dấu thanh), giữ đồng bộ ở mọi lệnh ghi.

Thêm một trần cứng: D1 tối đa **10 GB cho mỗi DB**. Nếu dùng một DB chung thì 10 GB đó là của **toàn hệ thống**, không phải của từng workspace.

## Hình dung cụ thể các phương án

### C1: một D1 chung + giả lập RLS (đúng như bản thử 1)

Viết lại 35 bảng sang `sqlite-core` và 21 migration; 27 policy thành 27 view + 81 trigger; tầng `db` gói mọi câu thành batch; bỏ transaction tương tác ở 36 file; thêm cột bỏ dấu cho tìm kiếm; pg-boss chuyển sang Queues. Kết quả: chạy được, **yếu hơn Postgres về bảo mật, tính toàn vẹn và tìm kiếm**, và bị trần 10 GB chung. Lật ngược ADR-003, đúng cái "permanent tax" mà ADR đó đã từ chối.

### C2: mỗi workspace một D1

Tách dữ liệu vật lý thì không cần RLS. Nhưng Worker chỉ bind tĩnh được khoảng 5.000 DB, mỗi workspace mới phải deploy lại; còn REST API giới hạn 1.200 request/5 phút và Cloudflare ghi là dành cho quản trị (theo báo cáo nghiên cứu). Vẫn không có transaction tương tác. **Loại.**

### C3: mỗi workspace một Durable Object có SQLite + một D1 trung tâm

- Sáu bảng không có policy RLS hôm nay (`users`, `sessions`, `workspaces`, `api_keys`, `password_resets`, `sso_connections`) chính là dữ liệu dùng chung. Chúng nằm ở D1 trung tâm, dùng để đăng nhập và tra API key.
- 29 bảng còn lại nằm trong DO của từng workspace. Worker gọi `env.WORKSPACE.getByName(workspaceId).runAction(...)`, và code truy cập dữ liệu chạy **bên trong** DO.
- Được: dữ liệu tách thật (mạnh hơn RLS); transaction tương tác qua `transactionSync` (drizzle `durable-sqlite` đã nối sẵn); 10 GB cho **mỗi** workspace; khôi phục theo từng workspace trong 30 ngày (theo báo cáo nghiên cứu).
- Mất: `transactionSync` **cấm `await` ở giữa**, nên route chat AI (gọi tool trong lúc giữ transaction) và các luồng sync mailbox phải tách bước. 110 file import `@/db` phải chuyển vào trong DO. Riêng 27 file trong `src/lib/actions` đã gom sau action registry (ADR-017), nên đó là seam tự nhiên để chuyển trước. Dữ liệu tìm kiếm tiếng Việt vẫn cần cột bỏ dấu. Đây là thay đổi kiến trúc, cần ADR mới thay ADR-001/003/006.

### Đối chiếu: giữ Postgres, chạy trên Workers qua Hyperdrive

Đây là phương án A của báo cáo trước. Không động tới RLS, transaction hay ILIKE; chỉ đổi cách kết nối và hàng đợi.

## Điều gì thay đổi nếu chọn mỗi phương án

| | C1: D1 chung | C2: D1 mỗi workspace | C3: DO mỗi workspace | Giữ Postgres + Hyperdrive |
|---|---|---|---|---|
| Cách ly tenant | Giả lập; lộ nếu code chạm bảng gốc | Vật lý | Vật lý | RLS do engine ép |
| Transaction tương tác | Không | Không | Có, nhưng không được `await` ở giữa | Có |
| Tìm "đạt" ra "Đạt" | Phải tự làm cột bỏ dấu | Như C1 | Như C1 | Có sẵn |
| Trần dữ liệu | 10 GB toàn hệ thống | 10 GB/workspace | 10 GB/workspace | Theo Postgres |
| Khối lượng sửa | Lớn | Lớn + vướng binding | Rất lớn (đổi kiến trúc) | Vừa |
| ADR bị lật | 001, 003 | 001, 003 | 001, 003, 006 | Không |

## Khuyến nghị

**Không thay Postgres bằng D1 (loại C1, C2).** D1 không cho RLS, Cloudflare đã nói không làm transaction tương tác, và hai thứ đó chính là xương sống của Fourty. Nếu mục tiêu là "Fourty thuần Cloudflare" về lâu dài, hướng đáng khảo sát duy nhất là C3, và nên coi nó là một kiến trúc mới, không phải đổi driver. Còn mục tiêu "chạy trên Cloudflare sớm" thì đã có lời giải ít rủi ro hơn: Hyperdrive + Postgres.

## Lỗi người mới hay mắc ở bài toán này

- Nghĩ "D1 là SQLite, Fourty từng chạy SQLite, nên quay lại là xong". Fourty SQLite cũ là **một tenant**, chưa có RLS hay `withWorkspace`. Thứ khó không phải dialect SQL mà là mô hình tenant và transaction.
- Đặt ngữ cảnh workspace bằng một câu riêng rồi mới truy vấn (bản thử, ca 7). Chạy ở local thì đúng vì chỉ có một request; lên production có nhiều request xen kẽ là rò dữ liệu.
- Dùng `db.transaction()` của drizzle trên D1. Hàm này gửi `BEGIN` nên chắc chắn lỗi. Trên D1 phải dùng `db.batch()`.
- Tin rằng `LIKE` không phân biệt hoa/thường với mọi chữ. Thực tế điều đó chỉ đúng với chữ ASCII.

## Key takeaways

- RLS là tính năng của **engine**, không phải của câu SQL. Đổi engine là mất nó, và mọi bản giả lập đều phụ thuộc vào kỷ luật của code.
- "Đủ tính năng" phụ thuộc vào transaction nhiều hơn vào kiểu dữ liệu. Hãy kiểm kê xem code đang **dựa vào** hành vi nào của DB, chứ không chỉ đếm câu lệnh.
- Cách ly vật lý (mỗi tenant một DB/DO) thay được RLS, nhưng chuyển cái giá sang phía kiến trúc app.
- Bản thử 30 phút trả lời được câu hỏi mà đọc tài liệu không chắc chắn được, ví dụ ca 7 và ca 10.

## Đọc thêm

- [D1 Worker API: batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) · [DO SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) · [SQLite LIKE](https://www.sqlite.org/lang_expr.html#like) · [FTS5 unicode61](https://www.sqlite.org/fts5.html#unicode61_tokenizer)
- Nên học tiếp: mẫu "saga" (chia transaction dài thành các bước có bước bù trừ), dùng khi phải bỏ `await` khỏi transaction trong C3.

## Bản thử nằm ở đâu

Thư mục scratchpad của phiên (sẽ mất khi phiên kết thúc): `prototype-d1-rls/prototype-d1-rls.mjs` (14 ca, chạy bằng `node prototype-d1-rls.mjs`) và `prototype-d1-rls/do-per-workspace/` (`npx wrangler dev --local`). Theo skill prototype, nên lưu chúng vào một nhánh riêng, không merge vào main. Việc này chờ anh đồng ý.

## Chỗ trống cần điền

1. **Quyết định về D1:** (a) đóng hướng D1, giữ Postgres và đi Hyperdrive khi lên Cloudflare *(khuyến nghị)*; (b) mở khảo sát C3 (DO mỗi workspace) như hướng dài hạn; (c) vẫn muốn đi C1 (D1 chung, chấp nhận ba lỗ đã nêu).
2. **Lưu bản thử:** (a) commit vào nhánh `prototype/d1-rls`, không merge *(khuyến nghị)*; (b) bỏ đi, báo cáo này là đủ.
3. **Ghi quyết định:** (a) viết ADR-020 "D1 không thay được Postgres", dẫn bằng chứng này *(khuyến nghị)*; (b) chỉ giữ báo cáo trong `plans/reports`.
4. **Nếu chọn 1(b):** bước đầu là (a) bản thử C3 với một action thật (`contacts.create` chạy trong DO) *(khuyến nghị)*; (b) lập kế hoạch đầy đủ ngay.

## Câu hỏi chưa giải quyết

- D1 thật có nhận `jsonb_*` không? Ở local thì có; D1 chặn `sqlite_version()` nên không biết đang chạy SQLite bản nào.
- Một `batch()` tính là 1 hay nhiều query trong trần 1.000 query mỗi lần gọi Worker? (chưa kiểm). Câu này quyết định C1 có khả thi về hiệu năng không.
- Với C3: route chat AI và sync mailbox thật sự ghi những gì trong lúc giữ transaction? Cần đo trước khi ước lượng công tách bước.
- Fourty có bao nhiêu workspace thật và workspace lớn nhất nặng bao nhiêu? Câu này quyết định trần 10 GB có phải vấn đề không.

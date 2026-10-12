# D1 / SQLite trên Cloudflare: khả năng SQL thật sự, đối chiếu với nhu cầu của Fourty

- Ngày kiểm: 2026-10-12 (Asia/Saigon). Mọi trích dẫn đều mở trực tiếp hôm nay. Chỗ nào không kiểm được thì ghi "chưa kiểm". Chỗ nào là suy luận thì ghi "suy luận".
- Nguồn: developers.cloudflare.com, sqlite.org, orm.drizzle.team, github.com/cloudflare/workerd, github.com/drizzle-team. Có thêm **một** nguồn ngoài danh sách: một comment của Product Manager D1 trong repo chính thức `github.com/cloudflare/workers-sdk` (mục 3), có đánh dấu riêng.
- Báo cáo này **không lặp lại** nội dung của [research-261012-1435-cloudflare-platform-facts.md](./research-261012-1435-cloudflare-platform-facts.md). Các con số đã có ở đó (10 GB/DB, 50.000 DB, khoảng 5.000 binding, 1.000 query mỗi lần gọi, 100 tham số, 100 KB, 2 MB, 30 s, Time Travel 30/7 ngày, issue drizzle #2463) chỉ được nhắc lại khi cần cho lập luận.
- Về mã nguồn workerd: trang D1 tự dẫn tới file `sqlite.c++` của workerd là "source code… for the full list of supported functions" (https://developers.cloudflare.com/d1/sql-api/sql-statements/). Câu báo lỗi transaction mà D1 trả về cho người dùng ([drizzle #4212](https://github.com/drizzle-team/drizzle-orm/issues/4212)) trùng từng chữ với chuỗi trong `SqlStorageRegulator` của workerd. Vì vậy báo cáo coi workerd là bằng chứng hợp lệ cho hành vi của D1. Riêng **phiên bản** đang chạy ở production thì chưa kiểm được (xem mục 5).
- Permalink workerd dùng commit `5358e3d` (main, 2026-10-12): `W = https://github.com/cloudflare/workerd/blob/5358e3d337336eaf696a48bc1563d808b10feba5`.

## Từ ngữ (định nghĩa một lần)

- **Interactive transaction**: mở transaction, đọc kết quả, dùng code JS quyết định bước tiếp theo, rồi mới commit. Fourty đang làm đúng kiểu này trong `withWorkspace`.
- **Batch**: gửi một danh sách câu SQL đã soạn sẵn trong một lần gọi. Các câu chạy liền nhau như một khối, nhưng code không xen vào giữa được.
- **Authorizer**: hàm "người gác cổng" của SQLite (`sqlite3_set_authorizer`). SQLite hỏi hàm này trước mỗi thao tác (đọc bảng, gọi hàm, PRAGMA, BEGIN…). Cloudflare tự cài hàm này; người dùng không cài được.
- **PRAGMA**: lệnh cấu hình riêng của SQLite, ví dụ `PRAGMA foreign_keys = on`.
- **Tokenizer / diacritics**: tokenizer là bộ cắt chữ thành từ cho tìm kiếm full-text (FTS5). Diacritics là dấu thanh và dấu phụ (ấ, ệ, ộ, ữ).
- **Bookmark / Session**: bookmark là "số phiên bản" của DB. Session là chuỗi query mang bookmark theo, để không bao giờ đọc phải dữ liệu cũ hơn cái mình đã thấy.
- **DO SQLite**: Durable Object có SQLite riêng. Code app chạy **ngay cạnh** file DB, gọi SQL đồng bộ (không qua mạng).
- **STRICT / generated column / UPSERT / RETURNING / CTE / window function / INSTEAD OF trigger**: lần lượt là bảng kiểm kiểu chặt; cột tự tính từ cột khác; `INSERT … ON CONFLICT DO UPDATE`; trả về hàng vừa ghi; `WITH …`; hàm kiểu `row_number() OVER (…)`; trigger chạy thay cho INSERT/UPDATE/DELETE trên một view.

## Kết luận trước

**Cú pháp SQL không phải là thứ cản đường. Cách D1 quản lý transaction và ngữ cảnh mới là chỗ cản.**

- D1 có gần đủ những gì Fourty dùng ở tầng câu lệnh: view, trigger, CHECK, khóa ngoại (bật sẵn, **không tắt được**), generated column, STRICT, RETURNING, UPSERT, CTE, window function, JSON.
- Có bốn điểm chặn thật sự:
  1. **Không có interactive transaction, và Cloudflare đã nói sẽ không làm.** PM D1 viết "no current or future plans". Issue liên quan đóng ở trạng thái `not_planned` ngày 2025-10-07. Chính PM chỉ sang DO SQLite.
  2. **Không có cách nào đưa "workspace hiện tại" vào trong SQL.** Không có `set_config`, không có hàm do app tự định nghĩa, không có bảng tạm (TEMP), không tự cài authorizer được. Cô lập tenant chỉ còn hai cách: tự viết `WHERE workspace_id = ?` ở mọi câu, hoặc mỗi workspace một DB.
  3. **Tìm kiếm tiếng Việt yếu hơn Postgres.** Có ba vấn đề:
     - `LIKE` chỉ không phân biệt hoa/thường với chữ ASCII, nên "Đức" không khớp "đức".
     - Mẫu `LIKE` tối đa 50 byte.
     - FTS5 cần `remove_diacritics 2` mới bỏ được dấu kép (ấ, ệ, ộ), và vẫn **không** biến "đ" thành "d". Ngoài ra, DB có bảng FTS5 thì `wrangler d1 export` không chạy.
  4. **Mô hình mỗi workspace một D1 không mở rộng được từ một Worker.** Binding tĩnh chỉ được khoảng 5.000. REST API chịu giới hạn 1.200 request/5 phút và Cloudflare ghi là dành cho "administrative use".
- **Xếp hạng cho câu hỏi "thay Postgres bằng gì trên Cloudflare":**
  1. **Giữ Postgres** (phương án A của báo cáo trước).
  2. **DO SQLite, mỗi workspace một object.** Đây là lựa chọn duy nhất của Cloudflare còn giữ được interactive transaction (`transactionSync`) và gọi tới hàng triệu tenant mà không cần binding. Đổi lại phải viết lại kiến trúc.
  3. **D1 một DB chung**, lọc tenant ở tầng app.
  4. **D1 mỗi workspace một DB.** Chỉ hợp lý nếu dùng Workers for Platforms.

### Bảng tóm tắt

| # | Câu hỏi | Kết luận | Nguồn chính |
|---|---|---|---|
| 1 | Bề mặt SQL | Có: VIEW, TRIGGER (kể cả INSTEAD OF theo code, chưa thử), CHECK, FK, generated, STRICT, RETURNING, UPSERT, CTE, window. **Không có**: BEGIN/SAVEPOINT, TEMP, ATTACH, virtual table ngoài FTS5/R-Tree, hàm do app định nghĩa, authorizer riêng. PRAGMA: 17 lệnh trong allowlist. FK luôn bật. | [sql-statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [foreign-keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/), `W/src/workerd/util/sqlite.c++` |
| 2 | Giới hạn mới (ngoài báo cáo trước) | Mẫu LIKE/GLOB 50 byte. Hàm tối đa 32 tham số (doc; code là 127). 6 kết nối đồng thời. Giới hạn 30 s áp cho **cả** batch. Restore tối đa 10 lần/10 phút. UNION/compound tối đa 5 vế (code). Số câu mỗi batch: không công bố. | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), `sqlite.c++#L1425-L1449` |
| 3 | Transaction | `batch()` = một transaction SQL, chạy tuần tự, không xen kẽ. BEGIN/SAVEPOINT bị chặn. Không có kế hoạch làm interactive transaction (PM, 03/2025). Changelog 2026 không có gì mới về việc này. | [d1-database](https://developers.cloudflare.com/d1/worker-api/d1-database/), [workers-sdk#2733](https://github.com/cloudflare/workers-sdk/issues/2733#issuecomment-2712365336) |
| 4 | Tìm kiếm | FTS5 có (kèm trigram). Không có ICU. LIKE không phân biệt hoa/thường chỉ với ASCII. unicode61 cần `remove_diacritics 2`; "đ" không thành "d". Export lỗi khi có bảng ảo. | [import-export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [sqlite fts5](https://www.sqlite.org/fts5.html#unicode61_tokenizer) |
| 5 | JSON, phiên bản | json_* và `->`/`->>` được tài liệu hóa. Code workerd thêm jsonb_* từ 2025-09-20, nhưng commit mà trang D1 trỏ tới chưa có, nên dùng trên D1 production thì **chưa kiểm**. Phiên bản SQLite của D1: **không công bố**, hàm `sqlite_version()` bị chặn có chủ đích. workerd main dùng 3.53.4. | [query-json](https://developers.cloudflare.com/d1/sql-api/query-json/), `W/MODULE.bazel#L5-L32` |
| 6 | Đa tenant | Cloudflare khuyến khích mỗi tenant một DB, nhưng chỉ ra hai đường truy cập: binding tĩnh (khoảng 5.000) hoặc Workers for Platforms. DO: số object không giới hạn, 10 GB/object, `transactionSync`, có `drizzle-orm/durable-sqlite`. | [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [DO SQL API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) |
| 7 | Read replication | Sequential consistency qua bookmark; đọc được ngay cái mình vừa ghi **trong cùng session**. Không dùng Sessions API thì mọi query đi vào primary. Vẫn **public beta** (không có mục GA trong changelog). Không có qua REST. | [read-replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) |
| 8 | Sao lưu | Time Travel phục hồi theo phút, **ghi đè cả DB**, chưa fork/clone được. Export chặn mọi request khác trong lúc chạy và không chạy được khi có bảng FTS5. | [time-travel](https://developers.cloudflare.com/d1/reference/time-travel/) |
| 9 | Drizzle + D1 | `db.transaction()` của drizzle gửi `begin` nên **bị D1 từ chối**. Phải dùng `db.batch()`. drizzle-kit có driver `d1-http` (mỗi lần một databaseId). Wrangler đã hỗ trợ cấu trúc migration của drizzle (`migrations_pattern`, 2026-05-29). | `drizzle-orm/src/d1/session.ts#L111-L126`, [changelog](https://developers.cloudflare.com/changelog/post/2026-06-04-migrations-pattern/) |

---

## 1. Bề mặt SQL của D1

**Câu hỏi thật sự:** schema và câu lệnh của Fourty có viết lại sang SQLite trên D1 được không, hay vướng ngay ở cú pháp?

**Đã kiểm**

- **VIEW và TRIGGER.**
  - Authorizer cho phép `SQLITE_CREATE_VIEW` (`W/src/workerd/util/sqlite.c%2B%2B#L1155`) và `SQLITE_CREATE_TRIGGER` (`#L1196`), với điều kiện tên không bắt đầu bằng `_cf_` (`W/src/workerd/api/sql.c%2B%2B#L141-L146`; từ 2026-03-27 so khớp không phân biệt hoa/thường).
  - Trang SQL statements của D1 có ví dụ `CREATE VIEW`, và có `PRAGMA recursive_triggers`. Nguồn: https://developers.cloudflare.com/d1/sql-api/sql-statements/
  - **INSTEAD OF trigger trên view**: SQLite có hỗ trợ (https://www.sqlite.org/lang_createtrigger.html#instead_of_triggers). Authorizer chỉ xét tên trigger và tên bảng/view, nên theo code là được phép. Chạy thật trên D1: **chưa kiểm**.
- **CHECK**: được bật mặc định. "`OFF`: check constraints are enforced (this is the default behavior)" (PRAGMA `ignore_check_constraints`). Nguồn: https://developers.cloudflare.com/d1/sql-api/sql-statements/
- **Khóa ngoại: luôn bật, và câu `PRAGMA foreign_keys = off` thực tế không có tác dụng.**
  - Cloudflare viết: "By default, D1 enforces that foreign key constraints… identical to… `PRAGMA foreign_keys = on`… Because D1 runs every query inside an implicit transaction, user queries cannot change this". Cách được hướng dẫn là `PRAGMA defer_foreign_keys = on`. Nguồn: https://developers.cloudflare.com/d1/sql-api/foreign-keys/
  - SQLite giải thích lý do: đổi `foreign_keys` giữa transaction "does not return an error; it simply has no effect". Nguồn: https://www.sqlite.org/foreignkeys.html
  - Cấu hình biên dịch của workerd đặt `SQLITE_DEFAULT_FOREIGN_KEYS=1`: https://github.com/cloudflare/workerd/blob/main/build/BUILD.sqlite3
  - Trang SQL statements vẫn liệt kê `PRAGMA foreign_keys = (on|off)`. Hai trang mâu thuẫn nhau; trang foreign-keys khớp với hành vi của SQLite.
- **Generated column**: hỗ trợ cả `VIRTUAL` và `STORED`, đánh index được. Cột thêm bằng `ALTER TABLE ADD COLUMN` thì bắt buộc là `VIRTUAL`. Nguồn: https://developers.cloudflare.com/d1/reference/generated-columns/
- **STRICT**: Cloudflare khuyến nghị dùng: "We recommend using STRICT tables". Cùng trang ghi BigInt "not currently supported in the API yet", nghĩa là số nguyên lớn hơn `Number.MAX_SAFE_INTEGER` sẽ mất chính xác. Nguồn: https://developers.cloudflare.com/d1/worker-api/
- **RETURNING / UPSERT / CTE / window function**:
  - Tài liệu D1 không có trang riêng cho các tính năng này.
  - Bằng chứng gián tiếp:
    - Ví dụ `db.batch([... .returning({ id }) ...])` trong tài liệu drizzle cho D1: https://orm.drizzle.team/docs/sqlite/batch-api
    - Release note D1 coi `WITH` là từ khóa của query chỉ-đọc: https://developers.cloudflare.com/d1/platform/release-notes/
    - Authorizer cho phép `SQLITE_RECURSIVE` (`sqlite.c++#L1394`).
    - Allowlist có `row_number`, `rank`, `lag`, `lead`… (`#L471-L481`).
  - Phiên bản SQLite tối thiểu cho từng tính năng: RETURNING 3.35.0, UPSERT 3.24.0, STRICT 3.37.0, generated column 3.31.0, window function 3.25.0. Nguồn: [returning](https://www.sqlite.org/lang_returning.html), [upsert](https://www.sqlite.org/lang_upsert.html), [strict](https://www.sqlite.org/stricttables.html), [gencol](https://www.sqlite.org/gencol.html), [window](https://www.sqlite.org/windowfunctions.html)
  - D1 phải chạy bản ≥3.37 vì tài liệu của nó khuyến nghị STRICT và có cột `strict` trong `PRAGMA table_list` (suy luận).
- **PRAGMA được phép** (allowlist, `sqlite.c++#L575-L605` cộng với `table_list`/`table_info`/`table_xinfo` ở `#L1251-L1270`):
  - Đọc thông tin: `data_version`, `page_size` (không tham số), `foreign_key_check`, `foreign_key_list`, `index_info`, `index_list`, `index_xinfo`, `quick_check`, `table_list`, `table_info`, `table_xinfo`.
  - Bật/tắt: `case_sensitive_like`, `foreign_keys`, `defer_foreign_keys`, `ignore_check_constraints`, `legacy_alter_table`, `recursive_triggers`, `reverse_unordered_selects`.
  - Khác: `optimize` (D1 không hỗ trợ `optimize(-1)`).
  - Mọi PRAGMA khác **bị chặn**.
  - Lưu ý: "D1 PRAGMA statements only apply to the current transaction", tức chỉ có hiệu lực trong một query hoặc một batch. Nguồn: https://developers.cloudflare.com/d1/sql-api/sql-statements/
- **Bị chặn hoàn toàn**:
  - `ATTACH`/`DETACH` (`#L1376-L1379`).
  - Mọi thứ TEMP: bảng, index, trigger, view (`#L1381-L1391`, ghi chú "TODO(someday): Allow temporary tables").
  - Virtual table ngoài `fts5`, `fts5vocab`, `rtree`, `rtree_i32` (`#L1356-L1374`).
  - BEGIN/SAVEPOINT (mục 3).
- **Authorizer và hàm do app tự định nghĩa: không có.**
  - Chính Cloudflare gọi `sqlite3_set_authorizer` trong `setupSecurity` (`#L1425-L1470`). Hàm gác cổng đó chỉ cho phép các hàm SQL nằm trong `ALLOWED_SQLITE_FUNCTIONS` (`#L397-L560`, `#L1336-L1351`).
  - API của D1 Worker chỉ có `prepare`, `batch`, `exec`, `dump`, `withSession` (https://developers.cloudflare.com/d1/worker-api/d1-database/). Code còn một hàm `query()` chưa có trong tài liệu, nằm sau cờ `d1_binding_jsrpc` (`W/src/cloudflare/internal/d1-api.ts#L198-L227`).
  - API SQL của DO chỉ có `exec` và `databaseSize`.
  - Không chỗ nào có `create_function` hay hook phân quyền theo từng query. **Xác nhận: không định nghĩa hàm app được.**

**Ví dụ cụ thể (điểm mấu chốt cho RLS):**
- Trên Postgres hôm nay, policy RLS đọc `current_setting('app.workspace_id')`.
- Trên D1 không có thứ tương đương:
  - Không có `set_config`.
  - Không có hàm `current_workspace()` tự viết.
  - Không có bảng TEMP để giữ ngữ cảnh theo phiên.
  - Không tự cài authorizer được.
- Một mẹo có thể dùng (suy luận, chưa thử): trong **cùng một batch**, ghi workspace vào một bảng `_ctx`, rồi cho các view lọc theo `(SELECT ws FROM _ctx)`.
- Mẹo này có ba nhược điểm:
  - Mỗi request tốn thêm một lượt ghi tính tiền.
  - Chỉ đúng bên trong một batch.
  - Nếu quên bọc batch thì không có gì chặn lại.
- Kết luận: không dùng mẹo này để thay RLS.

**Áp vào Fourty:**
- Schema (35 `pgTable`) chuyển được sang `sqlite-core`. `onConflict` (7 chỗ) và `.returning` (8 chỗ) vẫn dùng được.
- Hai chỗ `FOR UPDATE SKIP LOCKED` (`src/lib/agent-tasks/claim.ts:50`) không có tương đương trong SQLite. Phải đổi thành `UPDATE … WHERE status='pending' … RETURNING` trong một câu duy nhất (suy luận: DB chỉ có một luồng ghi nên không có tranh chấp khóa).

## 2. Giới hạn quan trọng cho một CRM (chỉ những số **mới**)

| Giới hạn | Giá trị | Nguồn | Hệ quả cho Fourty |
|---|---|---|---|
| Độ dài mẫu `LIKE`/`GLOB` | **50 byte** | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/); code `SQLITE_LIMIT_LIKE_PATTERN_LENGTH, 50` (`sqlite.c++#L1444`) | `%Công ty TNHH Thương mại Dịch vụ%` đã dài 42 byte. Chữ Việt có dấu tốn 2–3 byte mỗi ký tự, nên một chuỗi tìm khoảng 20 ký tự là chạm trần. Mặc định của SQLite là 50.000 ([limits](https://www.sqlite.org/limits.html)). |
| Số tham số mỗi hàm SQL | 32 (theo tài liệu) | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) | Code workerd đặt 127, kèm ghi chú "especially json_object" (`#L1440-L1442`). Nên tin số 32 của tài liệu. Một `json_object(...)` tối đa 16 cặp key/value. |
| Kết nối D1 đồng thời mỗi lần gọi Worker | 6 | [D1 limits FAQ](https://developers.cloudflare.com/d1/platform/limits/) | Không chạy `Promise.all` hơn 6 query cùng lúc được. |
| Thời lượng batch | 30 s cho **toàn bộ** batch ("this duration limit also applies to the entire batch call") | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | Batch lớn khi import hoặc migrate phải chia nhỏ. |
| Số câu mỗi batch | **Không công bố** (chưa kiểm) | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) chỉ ghi giới hạn từng câu áp cho mỗi câu trong batch | |
| Một batch tính là 1 hay N query trong trần 1.000 query/lần gọi | **chưa kiểm** | | |
| Compound SELECT (UNION…) | Tối đa 5 vế (code) | `sqlite.c++#L1438`, commit [dd70ace](https://github.com/cloudflare/workerd/commit/dd70acec03) | Tài liệu D1 không ghi. Fourty có 1 chỗ UNION (`src/app/api/workflows/route.ts`). |
| Độ sâu biểu thức / trigger lồng nhau | 100 / 10 (code) | `sqlite.c++#L1435`, `#L1446` | |
| Restore Time Travel | 10 lần mỗi 10 phút mỗi DB | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | |
| Kích thước một hàng | Tài liệu ghi 2 MB. workerd main đã nâng lên **8 MiB** (commit 2026-09-23) | `W/src/workerd/util/sqlite.h#L71-L72`, [1b9b6ea](https://github.com/cloudflare/workerd/commit/1b9b6ea023) | D1 production đã áp số mới chưa: **chưa kiểm**. Nên tính theo 2 MB. |

## 3. Transaction trên D1

**Câu hỏi thật sự:** "đọc deal, kiểm tra quyền, đổi stage, ghi activity" có làm được thành một khối nguyên tử không, và có request nào chen vào giữa được không?

**Đã kiểm**
- Tài liệu viết nguyên văn: "D1 operates in auto-commit. Our implementation guarantees that each statement in the list will execute and commit, sequentially, non-concurrently. Batched statements are SQL transactions… If a statement in the sequence fails… it aborts or rolls back the entire sequence." Nguồn: https://developers.cloudflare.com/d1/worker-api/d1-database/
- "Each individual D1 database is inherently single-threaded, and processes queries one at a time… backed by a single Durable Object". Nguồn: https://developers.cloudflare.com/d1/platform/limits/
- **Có request khác chen vào giữa các câu của một batch không?** Không có câu nào trong tài liệu nói thẳng điều này. Suy luận từ hai câu trên ("SQL transaction" cộng "single-threaded, one at a time"): không có câu lệnh của request khác chạy xen giữa các câu trong một batch, tức batch cách ly như tuần tự (serializable). **Giữa hai lần gọi** `batch()`/`run()` thì request khác chen vào được.
- BEGIN/SAVEPOINT:
  - Authorizer chỉ cho qua khi `regulator->allowTransactions()` (`sqlite.c++#L1201-L1249`).
  - Với SQL của người dùng, hàm đó luôn ném lỗi "To execute a transaction, please use the state.storage.transaction() or state.storage.transactionSync() APIs instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements" (`W/src/workerd/api/sql.c%2B%2B#L156-L162`).
  - D1 trả về đúng câu này, theo [drizzle #4212](https://github.com/drizzle-team/drizzle-orm/issues/4212) (còn mở).
  - Lưu ý: hai API được gợi ý trong câu lỗi là của DO, D1 binding không có.
- Trạng thái interactive transaction:
  - Product Manager D1 viết ngày 2025-03-11: "There are no current or future plans to build interactive Javascript transaction support for D1… I would recommend folks check out SQLite in Durable Objects if interactive Javascript transaction support is a requirement". Issue đóng ngày 2025-10-07 với `state_reason: not_planned`. Nguồn (ngoài danh sách domain, nhưng là repo chính thức của Cloudflare): https://github.com/cloudflare/workers-sdk/issues/2733#issuecomment-2712365336
  - Changelog D1 năm 2026 (tới 2026-10-02) chỉ có: jurisdiction `us`, thực thi giới hạn gói Free, `migrations_pattern`, widget billing. **Không có** thông báo nào về transaction. Nguồn: https://developers.cloudflare.com/changelog/product/d1/

**Ví dụ cụ thể:** "chuyển deal sang Won chỉ khi stage hiện tại chưa phải Won".
- Trên D1 không thể SELECT rồi dùng `if` trong JS.
- Phải dồn điều kiện vào SQL: `UPDATE deals SET stage='won' WHERE id=? AND workspace_id=? AND stage<>'won' RETURNING …`.
- Câu tiếp theo trong cùng batch phải tự kiểm tra lại bằng `WHERE EXISTS (…)`, hoặc dùng `changes()`.
- Logic nào cần gọi LLM hay HTTP ở giữa chừng thì không thể nằm trong một transaction.

## 4. Tìm kiếm văn bản (tiếng Việt)

**Câu hỏi thật sự:** người dùng gõ "duc" hoặc "đức" thì có tìm ra "Nguyễn Văn Đức" không?

**Đã kiểm**
- **LIKE**:
  - "SQLite only understands upper/lower case for ASCII characters by default. The LIKE operator is case sensitive by default for unicode characters that are beyond the ASCII range." Nguồn: https://www.sqlite.org/lang_expr.html#like
  - `lower()`/`upper()` cũng "works for ASCII characters only". Nguồn: https://www.sqlite.org/lang_corefunc.html#lower
- **Không có ICU.** Cấu hình biên dịch của workerd chỉ bật `SQLITE_ENABLE_FTS5`, `SQLITE_ENABLE_MATH_FUNCTIONS`, `SQLITE_DEFAULT_FOREIGN_KEYS=1`, `SQLITE_ENABLE_RTREE`, `SQLITE_ENABLE_UPDATE_DELETE_LIMIT`, `SQLITE_ENABLE_NORMALIZE`…, không có `SQLITE_ENABLE_ICU`. Nguồn: https://github.com/cloudflare/workerd/blob/main/build/BUILD.sqlite3 . Allowlist hàm cũng không có hàm ICU nào (`sqlite.c++#L397-L560`).
- **FTS5**:
  - D1 hỗ trợ FTS5 kèm `fts5vocab`: https://developers.cloudflare.com/d1/sql-api/sql-statements/
  - Hàm `match`, `highlight`, `bm25`, `snippet` có trong allowlist (`#L544-L548`).
  - Tokenizer `unicode61` (mặc định): không phân biệt hoa/thường theo Unicode 6.1, `remove_diacritics` mặc định là 1. Nhưng ở mức 1, "diacritics are not removed… where a single unicode codepoint is used to represent a character with more that one diacritic. For example… 0x1ED9 (ộ)". Phải đặt `remove_diacritics 2`. Nguồn: https://www.sqlite.org/fts5.html#unicode61_tokenizer
  - Tokenizer `trigram`: tìm chuỗi con, có `remove_diacritics 1`. Nhưng khi đã bật remove_diacritics thì nó **không** tăng tốc `LIKE`/`GLOB` được nữa, và chuỗi dưới 3 ký tự không khớp gì. Nguồn: https://www.sqlite.org/fts5.html#the_trigram_tokenizer
- **"đ" không được bỏ dấu.**
  - Tôi chạy lại hàm `fts5_remove_diacritic` của SQLite trunk bằng Python, với bảng tra lấy từ https://sqlite.org/src/file?name=ext/fts5/fts5_unicode2.c&ci=trunk .
  - Kết quả:
    - Mức 1: ấ, ầ, ậ, ắ, ặ, ế, ệ, ồ, ộ, ớ, ợ, ứ, ữ, ự… **giữ nguyên dấu**.
    - Mức 2: tất cả các chữ trên về a/e/o/u.
    - `đ` (U+0111) giữ nguyên **ở cả hai mức**.
  - Đây là mô phỏng trên mã nguồn, chưa chạy trên D1.
- **Giới hạn khi export**: "Export is not supported for virtual tables, including databases with virtual tables… As a workaround, delete any virtual tables, export, and then recreate virtual tables". Nguồn: https://developers.cloudflare.com/d1/best-practices/import-export-data/

**Ví dụ cụ thể:** contact tên "Đức", người dùng gõ "đức".

| Cách tìm | Postgres hôm nay (`ILIKE`) | D1 `LIKE` | D1 FTS5 `unicode61 remove_diacritics 2` |
|---|---|---|---|
| gõ "đức" | khớp (gấp chữ theo locale; locale cụ thể của DB Fourty: chưa kiểm) | **không khớp** (Đ và đ ngoài ASCII) | khớp |
| gõ "duc" | không khớp (ILIKE không bỏ dấu) | không khớp | **không khớp** (token là "đuc") |
| gõ "ngu" (tìm theo tiền tố) | khớp với `%ngu%` | khớp | cần truy vấn `ngu*` |

- Muốn tìm không dấu cho đúng, cách chắc chắn nhất là để app tự chuẩn hóa: NFD, bỏ dấu, `đ→d`, chữ thường. Ghi kết quả vào một cột phụ, rồi đánh FTS5 hoặc LIKE trên cột đó. Đây là việc phải tự làm, không phải tính năng có sẵn.

**Áp vào Fourty:** có 24 chỗ dùng `ilike`, ví dụ `src/lib/services/search.ts:61`. Chuyển thẳng sang `like` sẽ **tệ hơn** hiện tại với chữ Việt viết hoa.

## 5. JSON và phiên bản SQLite

**Đã kiểm**
- Tài liệu D1 liệt kê: `json`, `json_array`, `json_array_length`, `json_extract`, `->`, `->>`, `json_insert`, `json_object`, `json_patch`, `json_remove`, `json_replace`, `json_set`, `json_type`, `json_valid`, `json_quote`, `json_group_array`, `json_each`, `json_tree`. JSON được lưu ở dạng `TEXT`. Nguồn: https://developers.cloudflare.com/d1/sql-api/query-json/
- **JSONB**:
  - SQLite có JSONB từ bản 3.45.0: https://www.sqlite.org/json1.html#jsonb
  - workerd **thêm** `jsonb`, `jsonb_extract`, `jsonb_set`, `jsonb_group_object`… vào allowlist trong commit [59d492e](https://github.com/cloudflare/workerd/commit/59d492e743) ngày 2025-09-20. Hiện có ở `sqlite.c++#L513-L542`.
  - Nhưng commit mà trang D1 trỏ tới là `4c42a4a` (2025-08-31), **chưa có** jsonb nào: https://github.com/cloudflare/workerd/blob/4c42a4a9d3390c88e9bd977091c9d3395a6cd665/src/workerd/util/sqlite.c%2B%2B#L269
  - Kết luận: D1 production đã chấp nhận `jsonb_*` hay chưa là **chưa kiểm**. Thứ dùng được chắc chắn là json_* và `->`/`->>`.
  - Hàm `json_group_object`, `json_pretty`, `json_error_position`: hàm đầu có trong allowlist, hai hàm sau không có (`#L512-L542`).
- **Phiên bản SQLite của D1: không công bố.**
  - `sqlite_version()` và `sqlite_source_id()` bị loại khỏi allowlist có chủ đích: "These functions query SQLite internals and build details in a way we'd prefer not to reveal" (`sqlite.c++#L432-L437`).
  - workerd main dùng `sqlite-src-3530400`, tức **3.53.4** (`W/MODULE.bazel#L5-L32`).
  - D1 production có chạy cùng bản này không: **chưa kiểm**.

**Áp vào Fourty:** `src/lib/custom-objects.ts:20-21,160-162` dùng `jsonb_each`, `jsonb_typeof` và `::jsonb ->> … ::numeric`. Chuyển sang SQLite như sau:
- `jsonb_each` → `json_each`.
- `jsonb_typeof` → `json_type`.
- `::numeric` → `CAST(... AS REAL)`, mất độ chính xác thập phân.

## 6. Đa tenant: D1 mỗi tenant một DB so với DO SQLite

**Câu hỏi thật sự:** nếu cô lập bằng "mỗi workspace một DB" để bù cho việc mất RLS, thì một Worker gọi tới DB của workspace X **lúc chạy** bằng cách nào?

**Đã kiểm (D1)**
- Thiết kế được khuyến nghị: "per-user, per-tenant or per-entity databases". Có thể xin tăng lên "millions to tens-of-millions of databases". Nguồn: https://developers.cloudflare.com/d1/platform/limits/
- **Đường 1, binding tĩnh**: "you can bind up to ~5,000 D1 databases to a single Worker script" (1 MB metadata, khoảng 150 byte mỗi binding). Binding khai báo lúc deploy, nên thêm một workspace là phải deploy lại. Nguồn: như trên.
- **Đường 2, REST API**:
  - "best suited for administrative use as the global Cloudflare API rate limit applies": https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/
  - Giới hạn đó là "1,200 requests per five minute period per user", vượt thì bị chặn 5 phút: https://developers.cloudflare.com/fundamentals/api/reference/limits/
  - Sessions API "not yet available via the REST API": https://developers.cloudflare.com/d1/best-practices/read-replication/
- **Đường 3, Workers for Platforms**: "For complete isolation, you can create and attach a unique resource (like a D1 database…) to every User Worker". Tức mỗi tenant một Worker riêng. Nguồn: https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/get-started/bindings/ . Giá của Workers for Platforms: chưa kiểm.
- Binding D1 động (chọn DB theo ID lúc chạy): **không tìm thấy** trong tài liệu (đã tìm trên developers.cloudflare.com).
- Migration: `wrangler d1 migrations apply` và drizzle-kit `d1-http` đều nhắm **một** database mỗi lần (`databaseId`). Với N tenant thì phải tự viết vòng lặp (suy luận). Nguồn: https://developers.cloudflare.com/d1/reference/migrations/ , https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit

**Đã kiểm (DO SQLite)**
- Giới hạn:
  - "Number of Objects: Unlimited". 10 GB mỗi object. Dung lượng không giới hạn mỗi tài khoản (Paid). 500 class.
  - Giới hạn SQL **giống hệt D1**: 100 tham số, 50 byte LIKE, 2 MB mỗi hàng, 100 KB mỗi câu.
  - Mềm khoảng 1.000 request/s mỗi object.
  - Nguồn: https://developers.cloudflare.com/durable-objects/platform/limits/
- Gọi tới DB của tenant **động** bằng tên: `env.MY_DO.getByName(workspaceId)` / `idFromName`, không cần binding riêng cho từng tenant. Nguồn: https://developers.cloudflare.com/durable-objects/api/namespace/
- `ctx.storage.sql.exec()` chạy **đồng bộ**. `transactionSync(callback)`: "If `callback()` throws… rolled back. The callback must complete synchronously". Nghĩa là **đọc, rẽ nhánh bằng JS, rồi ghi** trong một transaction được, miễn là không có `await` ở giữa. `sql.exec()` vẫn không nhận BEGIN/SAVEPOINT. Nguồn: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
- Cảnh báo trên cùng trang: cursor mà giữ qua một lần `await` thì "no snapshot isolation guarantees". Phải đọc hết kết quả trước khi `await`.
- DO có PITR 30 ngày qua `getBookmarkForTime` / `onNextSessionRestoreBookmark`, phục hồi **theo từng object**. Nguồn: như trên.
- Drizzle:
  - `drizzle-orm/durable-sqlite`, migration chạy trong `blockConcurrencyWhile`, drizzle-kit dùng `driver: 'durable-sqlite'`. Nguồn: https://orm.drizzle.team/docs/sqlite/connect-cloudflare-do , https://orm.drizzle.team/docs/get-started/do-new
  - `transaction()` của drizzle trên DO gọi thẳng `this.client.transactionSync(...)`: `https://github.com/drizzle-team/drizzle-orm/blob/eab8bedbb65d5429c54e612ddbd88aa23091d398/drizzle-orm/src/durable-sqlite/session.ts#L63-L71`
- Giá (Paid):
  - Đọc/ghi hàng giống D1.
  - Lưu trữ SQLite **$0,20/GB-tháng** (5 GB miễn phí), so với $0,75 của D1.
  - Cộng thêm compute: $0,15/triệu request và $12,50/triệu GB-s, tính theo wall-clock khi object không ngủ đông.
  - Nguồn: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare tự so sánh hai lựa chọn:
  - D1 là "managed database product", có HTTP API, migration, export, insights.
  - DO là "lower-level… building block", "you may also need to build some of your own database tooling".
  - "SQL query pricing and limits are intended to be identical".
  - Nguồn: https://developers.cloudflare.com/workers/platform/storage-options/

**Ví dụ cụ thể:** request "Deals của workspace A" đi qua từng phương án.

| Phương án | Đường đi | Cô lập tenant | Transaction |
|---|---|---|---|
| D1 một DB chung | Worker → `env.DB.prepare('… WHERE workspace_id=?')` | Tự viết ở mọi câu; quên một chỗ là lộ dữ liệu | Chỉ có batch |
| D1 mỗi workspace một DB | Worker → `env['DB_' + A]`? Không làm được với binding tĩnh khi vượt 5.000 hoặc khi thêm tenant mà không deploy lại | Tốt (khác file) | Chỉ có batch |
| DO SQLite | Worker → `env.WS.getByName(A).listDeals()` (RPC) → trong DO: `transactionSync(() => …)` | Tốt (khác object) | **Interactive, nhưng đồng bộ** |

**Áp vào Fourty:**
- Với DO, mọi logic DB của một workspace phải dời **vào trong** class DO.
- Các luồng chạy chéo nhiều workspace (vòng `agent.dispatch` duyệt mọi workspace, tìm kiếm, admin) phải tự gửi lệnh tới từng object rồi gom kết quả.
- Route chat AI hiện giữ transaction trong lúc gọi tool. Mô hình này không mang sang được, vì `transactionSync` cấm `await`.

## 7. Read replication và Sessions API

**Câu hỏi thật sự:** bật replica rồi thì người dùng vừa lưu xong có thấy ngay dữ liệu mình vừa lưu không?

**Đã kiểm**
- "To use read replication, you must use the D1 Sessions API, otherwise all queries will continue to be executed only by the primary database". Không dùng session thì mọi query đều đi vào primary, nên đọc ngay được cái vừa ghi. Nguồn: https://developers.cloudflare.com/d1/best-practices/read-replication/
- Trong một session: "sequential consistency". Nó đảm bảo "Monotonic reads", "Monotonic writes", "Writes follow reads", "Read my own writes". Replica "will wait until it has been updated to be at least as up-to-date as the provided bookmark". Nguồn: như trên.
- Giữa các request: phải tự chuyển bookmark (ví dụ qua cookie hoặc header) vào `withSession(bookmark)`. `first-unconstrained` (mặc định) có thể bắt đầu từ một replica cũ. `first-primary` thì đọc mới nhất ngay từ đầu. Nguồn: https://developers.cloudflare.com/d1/worker-api/d1-database/#withsession
- Tắt replication: mất "up to 24 hours" để replica dừng hẳn. Không tốn thêm phí. Nguồn: read-replication ở trên.
- Trạng thái: changelog ghi "D1 Read Replication Public Beta" ngày 2025-04-10. Không có mục GA nào tới 2026-10-02. Nguồn: https://developers.cloudflare.com/changelog/product/d1/

**Ví dụ cụ thể:**
- Người dùng sửa deal ở request 1, bị chuyển trang, rồi request 2 đọc lại.
- Request 2 sẽ thấy bản sửa nếu: (a) không dùng session, hoặc (b) request 2 mở session bằng bookmark mà request 1 trả về.
- Nếu request 2 mở `withSession()` mặc định thì có thể đọc từ một replica cũ hơn.

## 8. Sao lưu

**Đã kiểm** (https://developers.cloudflare.com/d1/reference/time-travel/)
- "restore a database to any minute within the last 30 days". Luôn bật, không tốn phí.
- Restore "is a *destructive* operation, and overwrites the database in place". "In-flight queries and transactions will be cancelled". Hoàn tác được bằng bookmark trả về.
- "Time Travel does not yet allow you to clone or fork". Muốn giữ lâu hơn 30 ngày thì export sang R2 bằng Workflows: https://developers.cloudflare.com/workflows/examples/backup-d1/
- Export (https://developers.cloudflare.com/d1/best-practices/import-export-data/):
  - "A running export will block other database requests".
  - Không chạy được khi có bảng ảo FTS5.
  - Số `int64` lớn bị mất chính xác vì giới hạn số của JavaScript.

**Ví dụ cụ thể:** workspace B lỡ xóa 500 contact.
- Với D1 **một DB chung**: chỉ có cách tua **cả DB** về quá khứ, kéo theo mất dữ liệu mới của mọi workspace khác. Hoặc tự trích xuất bằng tay (cách trích: chưa kiểm, vì không fork được).
- Với mỗi workspace một DB hoặc DO: chỉ tua riêng B.

## 9. Drizzle với D1

**Đã kiểm**
- `D1Session.transaction()` chạy `begin`, rồi `commit`/`rollback`. `D1Transaction` lồng nhau thì dùng `savepoint`. Nguồn: `https://github.com/drizzle-team/drizzle-orm/blob/eab8bedbb65d5429c54e612ddbd88aa23091d398/drizzle-orm/src/d1/session.ts#L111-L147` . Vì authorizer chặn BEGIN/SAVEPOINT (mục 3), **`db.transaction()` sẽ ném lỗi trên D1** (#4212 và #2463 đều còn mở).
- Thay thế: `db.batch([...])` chạy được cả query builder lẫn `.returning()`. Nguồn: https://orm.drizzle.team/docs/sqlite/batch-api
- drizzle-kit: `dialect: 'sqlite'`, `driver: 'd1-http'` với `accountId`/`databaseId`/`token`, dùng cho `push`/`migrate`/studio. Yêu cầu drizzle-kit ≥0.21.3. Nguồn: https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit
- Wrangler: từ 2026-05-29, `migrations_pattern` đọc được cấu trúc `migrations/0001_init/migration.sql` của drizzle. Nguồn: https://developers.cloudflare.com/changelog/post/2026-06-04-migrations-pattern/ , https://developers.cloudflare.com/d1/reference/migrations/
- Khoảng trống còn lại:
  - Trang kết nối D1 của drizzle đang hướng dẫn `drizzle-orm@rc`. Fourty đang dùng `drizzle-orm ^0.45.2`. Nguồn: https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1
  - Toàn bộ schema `pg-core` phải viết lại thành `sqlite-core`. Không có công cụ chuyển tự động trong nguồn đã đọc.

---

## Ma trận đánh đổi (câu hỏi: thay Postgres)

| Tiêu chí | **Giữ Postgres** (A của báo cáo trước) | **DO SQLite mỗi workspace** | **D1 một DB chung** | **D1 mỗi workspace một DB** |
|---|---|---|---|---|
| Interactive transaction | Có | Có (đồng bộ, không `await`) | Không | Không |
| Cô lập tenant | RLS ở tầng DB | Khác object | Tự viết `WHERE` | Khác DB |
| Gọi tới tenant lúc chạy | Không cần | `getByName(id)`, không giới hạn | Không cần | Binding tĩnh khoảng 5.000 hoặc Workers for Platforms |
| Tìm kiếm tiếng Việt | ILIKE (gấp chữ Unicode) | Giống D1 | LIKE chỉ ASCII; FTS5 tự cấu hình | Giống bên trái |
| Trần dữ liệu / ghi | Theo Postgres | 10 GB/workspace, một luồng ghi mỗi workspace | 10 GB **toàn hệ thống**, một luồng ghi | 10 GB/workspace |
| Phục hồi theo tenant | Theo công cụ PG | Có (PITR theo object) | **Không** | Có |
| Lượng code phải đổi | Nhỏ | Rất lớn (dời logic vào DO, fan-out) | Lớn (schema, mọi transaction thành batch, search) | Lớn + hạ tầng provisioning |
| Rủi ro áp dụng | Thấp | Vừa: DO SQLite đã GA trên Free/Paid, nhưng tooling tự làm | Cao: Cloudflare đã đóng hướng interactive transaction | Cao |

**Xếp hạng: Giữ Postgres > DO SQLite > D1 chung > D1 mỗi tenant.** Lý do một dòng: D1 bỏ đúng hai thứ mà Fourty dựa vào nhiều nhất (transaction có logic ở giữa và ngữ cảnh workspace trong DB), và Cloudflare đã nói sẽ không bù lại.

## Rủi ro áp dụng
- **D1**:
  - GA từ 2024-04-01 (https://developers.cloudflare.com/d1/platform/release-notes/).
  - Read replication vẫn beta.
  - Số liệu giữa tài liệu và code đang lệch nhau: 32 so với 127 tham số hàm; 2 MB so với 8 MiB mỗi hàng.
  - Hướng interactive transaction đã bị đóng `not_planned`.
- **DO SQLite**:
  - Cloudflare khuyến nghị dùng cho mọi namespace mới (https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
  - Bắt đầu tính phí lưu trữ từ tháng 01/2026 (https://developers.cloudflare.com/durable-objects/platform/pricing/).
  - Rủi ro chính nằm ở **lượng tooling phải tự viết**, không nằm ở độ chín của nền tảng.
- **Drizzle**:
  - Driver D1 có một API (`transaction`) không bao giờ chạy được trên D1, và hai issue vẫn mở.
  - Tài liệu đang chuyển sang `@rc` (v1).

## Giới hạn của nghiên cứu
- Không chạy thử gì trên D1 hay DO. Hành vi INSTEAD OF trigger, `jsonb_*`, UPSERT và tokenizer trigram trên D1 production đều suy ra từ code và tài liệu.
- Bảng bỏ dấu tiếng Việt là kết quả mô phỏng mã nguồn SQLite trunk, không phải đo trên D1.
- Không đánh giá độ trễ thực tế: Worker → D1 → primary ở xa, và RPC tới DO.
- Không đánh giá giá Workers for Platforms.
- Không đọc hết mọi nơi dùng `withWorkspace` trong Fourty. Số đếm (24 `ilike`, 35 `pgTable`, 7 `onConflict`, 2 `FOR UPDATE`) lấy bằng grep `src/**/*.ts`.

## Câu hỏi chưa giải quyết
1. D1 production đang chạy SQLite bản nào, và đã nhận `jsonb_*` chưa? Cách kiểm: chạy `SELECT jsonb('{}')` trên một D1 thử.
2. Một `batch()` tính là 1 hay N query trong trần 1.000 query mỗi lần gọi? Số câu tối đa mỗi batch là bao nhiêu?
3. Trần tham số hàm là 32 (tài liệu) hay 127 (code)? Trần kích thước hàng là 2 MB hay 8 MiB trên production?
4. Time Travel có bị ảnh hưởng bởi bảng ảo FTS5 như export không? Tài liệu không nói.
5. DB Postgres hiện tại của Fourty dùng locale/collation nào? Cần biết để chắc ILIKE đang gấp được "Đ/đ".
6. Fourty có bao nhiêu workspace thực tế, và mỗi workspace lớn tới đâu? Con số này quyết định "mỗi tenant một DB" có đáng cân nhắc không.

## Chỗ trống cần điền
1. **Mục tiêu đánh giá:** (a) đóng hướng D1, giữ Postgres + Hyperdrive; (b) mở một nhánh khảo sát DO SQLite mỗi workspace cho tương lai; (c) vẫn muốn thử D1 một DB chung bằng một bản chạy thử nhỏ.
2. **Nếu vẫn thử D1 hoặc DO, tìm kiếm tiếng Việt xử lý thế nào:** (a) cột phụ đã bỏ dấu (app tự chuẩn hóa, kể cả `đ→d`) cộng FTS5; (b) chấp nhận chỉ tìm có dấu (FTS5 `remove_diacritics 2`); (c) đẩy việc tìm kiếm ra dịch vụ khác (chưa kiểm).
3. **Logic cần transaction có `await` ở giữa (chat AI gọi tool):** (a) giữ trên Postgres; (b) tách thành các bước bù trừ (saga) nếu sang DO hoặc D1; (c) chưa quyết, cần đo xem route chat thật sự ghi những gì.

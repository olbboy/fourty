# Fourty trên Cloudflare: sự thật nền tảng (đã kiểm nguồn gốc)

- Ngày kiểm: 2026-10-12 (Asia/Saigon). Tất cả số liệu lấy từ trang gốc mở trực tiếp hôm nay; điều gì không kiểm được ghi "chưa kiểm".
- Nguồn được phép: developers.cloudflare.com, opennext.js.org, github.com/cloudflare/vinext, github.com/opennextjs/opennextjs-cloudflare, drizzle (docs + repo), pg-boss repo. Có thêm 2 nguồn GitHub gốc của chính Cloudflare (cloudflare/next-on-pages, cloudflare/workerd) và npm registry để lấy số phiên bản.
- Phạm vi: chỉ thu thập sự thật và xếp hạng phương án. Không viết code, không lập kế hoạch triển khai.

## Từ ngữ dùng trong báo cáo (định nghĩa một lần)

- **Worker**: một hàm chạy trên mạng Cloudflare, khởi động theo từng request, không có tiến trình sống lâu. Mỗi request có giới hạn CPU và bộ nhớ.
- **Binding**: "ổ cắm" khai báo trong `wrangler.jsonc` để Worker gọi D1/R2/Queues/Hyperdrive. Khai báo lúc deploy, không tạo được lúc chạy.
- **Adapter**: công cụ biến app Next.js thành Worker. Có hai: **OpenNext** (`@opennextjs/cloudflare`) và **vinext** (Cloudflare tự viết, dựa trên Vite).
- **D1**: cơ sở dữ liệu SQLite do Cloudflare quản lý.
- **Hyperdrive**: bộ gom kết nối (connection pooler) của Cloudflare, đứng giữa Worker và một PostgreSQL nằm ở chỗ khác.
- **Transaction pooling**: mỗi transaction mượn một kết nối Postgres, xong thì trả lại; trạng thái phiên (session) bị xóa khi trả.
- **RLS** (Row-Level Security): Postgres tự lọc hàng theo workspace. Fourty bật trên mọi bảng tenant (`drizzle/0002_rls.sql`).
- **Queues / Cron Triggers / Workflows / Durable Objects (DO) / alarms**: các mảnh thay cho tiến trình worker nền. Queue là hàng đợi tin nhắn; Cron là hẹn giờ; Workflow là chuỗi bước bền vững; DO là một "đối tượng có trạng thái" sống lâu, có thể tự hẹn giờ (alarm).
- **R2**: kho file kiểu S3.
- **Outbox**: bảng trong DB ghi "việc cần gửi đi" cùng transaction với dữ liệu, rồi một tiến trình khác đọc và đẩy ra hàng đợi.

## Kết luận trước

Chạy **toàn bộ** Fourty chỉ bằng dịch vụ Cloudflare là không thực tế, vì một lý do: Cloudflare không có PostgreSQL. D1 là SQLite, không có RLS và không có interactive transaction, trong khi mọi request của Fourty chạy bên trong một transaction Postgres có `set_config('app.workspace_id', …, true)` (`src/db/index.ts:95-102`). Phương án khả thi nhất là **Workers (OpenNext) + Hyperdrive → PostgreSQL bên ngoài + Queues/Cron thay pg-boss worker + R2 + gửi mail qua HTTP**. Trong phương án này, phần lớn kiến trúc dữ liệu giữ nguyên, nhưng có bốn chỗ phải đổi code: pool `pg` toàn cục, pino, tầng tiêu thụ job của pg-boss, và việc gửi SMTP.

### Bảng tóm tắt

| # | Câu hỏi | Kết luận | Con số chính | Nguồn chính |
|---|---|---|---|---|
| 1 | Next.js 16 trên Workers | Chạy được. OpenNext 1.20.10 ổn định; vinext 1.1.0 được Cloudflare khuyến nghị nhưng còn **beta**. Không dùng Pages cho app full-stack: `next-on-pages` đã bị lưu trữ (archived). | Bundle 64 MiB (chưa nén, mọi gói); CPU 10 ms (Free) / 30 s mặc định, tối đa 5 phút (Paid); RAM 128 MB; khởi động 1 s | [limits](https://developers.cloudflare.com/workers/platform/limits/), [OpenNext](https://opennext.js.org/cloudflare), [vinext](https://github.com/cloudflare/vinext) |
| 2 | D1 | SQLite. Không có RLS. Chỉ có `batch()` atomic, không có BEGIN/COMMIT. Có FTS5 và JSON. Một luồng ghi cho mỗi DB. | 10 GB/DB; 1 TB/tài khoản; 50.000 DB (Paid); khoảng 5.000 DB bind vào một Worker | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| 3 | Hyperdrive | Hợp với `pg` + drizzle. `SET`/`set_config` trong transaction có hiệu lực. Không có LISTEN/NOTIFY, không có advisory lock. Cache bật mặc định, nên tắt. | ~100 kết nối gốc mỗi cấu hình (Paid); query tối đa 60 s; số query không giới hạn (Paid) | [how it works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/), [features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/) |
| 4 | Tương thích Node | `pg` được hỗ trợ chính thức. `node:crypto` đủ cho Fourty. Cổng 25 bị chặn. Bản Node của pino không chạy. nodemailer bên trong Worker: chưa kiểm. | `nodejs_compat` tự bật từ compatibility_date 2026-08-04 | [nodejs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [tcp](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) |
| 5 | Job nền | Phần `work()` (poll liên tục) của pg-boss không chạy trên Worker. Thay bằng Queues + Cron; Workflows cho chuỗi nhiều bước. | Queue: tin 128 KB, tối đa 100 lần retry, trễ tối đa 24 h, lô 100 tin | [queues limits](https://developers.cloudflare.com/queues/platform/limits/) |
| 6 | R2 | API tương thích S3, có presigned URL cho GET/HEAD/PUT/DELETE (không có POST form). | Hạn URL 1 s đến 7 ngày; PUT đơn tối đa 5 GiB; file tối đa 5 TiB; 10 GB miễn phí | [R2 presigned](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) |
| 7 | Email | Email Sending ở **public beta**, chỉ gói Workers Paid, bắt buộc domain dùng Cloudflare DNS. Email Routing (nhận mail) đã GA. | 3.000 mail/tháng kèm gói, sau đó $0,35/1.000; tối đa 50 người nhận; 5 MiB | [email](https://developers.cloudflare.com/email-service/) |
| 8 | Kết nối dài | MCP chuẩn hiện tại là Streamable HTTP; SSE đã deprecated; `createMcpHandler` không cần DO. HTTP không giới hạn thời gian khi client còn kết nối. | WebSocket nhận tối đa 32 MiB/tin; DO ~1.000 rps (giới hạn mềm) | [MCP transport](https://developers.cloudflare.com/agents/model-context-protocol/transport/) |
| 9 | Giá | $5/tháng cho cả tài khoản, đã gồm quota lớn. Một team nhỏ gần như chắc chắn nằm trong quota. Postgres bên ngoài tính riêng (chưa kiểm). | 10M request + 30M CPU-ms; D1 25 tỷ hàng đọc/tháng; Queues 1M thao tác | [pricing](https://developers.cloudflare.com/workers/platform/pricing/) |

## Xếp hạng phương án

| Tiêu chí | **A. Workers + Hyperdrive + Postgres ngoài** | **B. Như A, nhưng giữ một Node worker ngoài cho pg-boss** | **C. Thuần Cloudflare (D1)** |
|---|---|---|---|
| Giữ RLS / transaction hiện có | Có | Có | Không. Phải viết lại toàn bộ cách cô lập tenant |
| Lượng code phải đổi | Vừa: DB client theo request, logger, job consumer, mail | Nhỏ: DB client, logger, mail | Rất lớn: schema pg sang sqlite, mọi `withWorkspace`, mọi transaction |
| Mức "toàn Cloudflare" | Mọi thứ trừ Postgres | Kém nhất: còn một tiến trình Node phải tự nuôi | 100% |
| Trần dữ liệu | Theo Postgres | Theo Postgres | 10 GB/DB, một luồng ghi/DB |
| Rủi ro áp dụng | Thấp đến vừa (OpenNext 1.x ổn định; trạng thái GA của Hyperdrive: chưa kiểm) | Thấp | Cao (vấn đề transaction D1 vẫn mở, "no ETA") |
| Chi phí vận hành | $5 + Postgres | $5 + Postgres + host Node | $5 |

**Xếp hạng: A > B > C.** A là đích đến. B là bước đệm hợp lý nếu muốn lên Workers trước rồi mới thay pg-boss sau. C chỉ đáng cân nhắc nếu sản phẩm đổi hẳn sang mô hình "mỗi khách một DB nhỏ". Với adapter Next.js, **OpenNext đứng trước vinext** cho production hôm nay. Lý do là chính Cloudflare ghi vinext "is in beta", còn OpenNext đã ở 1.20.x. Chạy `npx vinext check` để đo khoảng cách, rồi xem lại khi vinext rời beta.

---

## 1. Next.js 16 trên Workers

**Câu hỏi thật sự:** chạy `next build` của Fourty như một Worker thì cái gì vỡ?

**Sự thật đã kiểm**
- Cloudflare viết: "Cloudflare recommends vinext as the default way to run Next.js applications on Cloudflare Workers", và cùng trang ghi "vinext is in beta. Before adopting it for an existing production application, run the compatibility check…". OpenNext được nhắc tới cho trường hợp app "cannot yet migrate to vinext because of a compatibility gap". Nguồn: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- **vinext**:
  - Chỉ nhắm Next.js 16.x. Tự công bố khoảng 94% API Next 16 được hỗ trợ đầy đủ hoặc một phần.
  - Hỗ trợ middleware/`proxy.ts`, ISR (cache qua KV hoặc Workers Cache adapter), `after()`, `instrumentation.ts`.
  - Hỗ trợ một phần: `next/image` (không tối ưu ảnh lúc build), `next/font` (chỉ tải lúc chạy), `"use cache"` (`cacheComponents` chưa đầy đủ), route segment `runtime`/`preferredRegion` (đọc nhưng không áp dụng), i18n theo domain.
  - Lời cảnh báo nguyên văn: "not yet a drop-in replacement for every application or production workload".
  - Nguồn: https://github.com/cloudflare/vinext. Phiên bản 1.1.0 phát hành 2026-10-08 (theo `gh api repos/cloudflare/vinext/releases` và `npm view vinext`).
- **OpenNext**:
  - "All minor and patch versions of Next.js 16 and the latest minors of Next.js 14 and 15 are supported". Chỉ chạy Node runtime.
  - Hỗ trợ: App Router, Route Handlers, SSR, SSG, ISR, PPR, `after`, `'use cache'`, image optimization, Turbopack.
  - Trang tổng quan vẫn ghi "Node Middleware introduced in 15.2 are not yet supported". Nguồn: https://opennext.js.org/cloudflare
  - Tuy nhiên bản 1.20.3 (26/08) đã thêm "support Node.js middleware (`proxy.ts`)", đánh dấu experimental, cần `nodejs_compat`. Tức là trang tài liệu đang cũ hơn code. Nguồn: https://github.com/opennextjs/opennextjs-cloudflare/releases
  - Bản mới nhất 1.20.10 (09/10). peerDependency `next: '>=15.5.27 <16 || >=16.3.8'` (theo `npm view @opennextjs/cloudflare`).
  - Image optimization đi qua binding Cloudflare Images và "can incur additional costs". Nguồn: https://opennext.js.org/cloudflare/howtos/image
  - ISR dùng R2 làm cache. Revalidate theo thời gian cần một DO Queue; tag cache dùng D1 hoặc DO. Nguồn: https://opennext.js.org/cloudflare/caching
  - `instrumentation`: trang tổng quan không nhắc. Release 1.20.3 có ghi "do not load the instrumentation hook from the Node.js middleware bundle". Hỗ trợ đầy đủ hay không: **chưa kiểm**.
- **Giới hạn Worker** (https://developers.cloudflare.com/workers/platform/limits/):
  - Kích thước: "Worker size (uncompressed) | 64 MiB | 64 MiB", và "There is no compressed size limit". Changelog 2026-09-04 xác nhận giới hạn cũ 3 MB (Free) / 10 MB (Paid) dạng nén đã bị bỏ: https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/ . Trang troubleshooting của OpenNext vẫn ghi 3/10 MiB, tức đã cũ: https://opennext.js.org/cloudflare/troubleshooting
  - CPU mỗi HTTP request: 10 ms (Free); 5 phút (Paid), mặc định 30 s.
  - RAM: 128 MB mỗi isolate. Khởi động: 1 s.
  - Subrequest: 50 (Free) / 10.000 (Paid). Kết nối ra đồng thời: 6.
  - Thời lượng HTTP: không giới hạn khi client còn kết nối. Cron/Queue/Alarm: 15 phút. Body request: 100 MB (Free/Pro).
- **Pages**:
  - Repo `cloudflare/next-on-pages` đã archived, nguyên văn: "The `@cloudflare/next-on-pages` package is deprecated and this repository is archived. For new projects and migrations, see vinext". Nguồn: https://github.com/cloudflare/next-on-pages
  - Trang Next.js của Pages khuyến nghị "vinext on Workers for full-stack Next.js applications". Pages chỉ còn dùng cho static export. Nguồn: https://developers.cloudflare.com/pages/framework-guides/nextjs/
  - Không tìm thấy tuyên bố nào nói bản thân Pages bị deprecated. Trang so sánh chỉ nói Workers có "a distinctly broader set of features". Nguồn: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

**Áp vào Fourty**
- Fourty đang ở `next ^16.3.0`. OpenNext 1.20.10 đòi tối thiểu 16.3.8, nên phải nâng bản patch.
- Đã grep repo: không có `proxy.ts`/`middleware.ts`, không dùng `after()`, `next/image`, `revalidate` hay `"use cache"`. Vì vậy phần lớn các khoảng trống liệt kê ở trên **không chạm** tới Fourty.
- `src/instrumentation.ts` chỉ ghi log capability, nên mất nó cũng không hại.
- `scripts/init-tracing.cjs` được nạp bằng `node -r`. Trên Worker không có cơ chế này, nên OpenTelemetry phải tích hợp lại (cách làm: chưa kiểm).
- `next.config.ts` có `serverExternalPackages: ["pg","pg-boss","pino"]`. Trên Worker mọi thứ phải được bundle vào; OpenNext xử lý danh sách này thế nào: **chưa kiểm**.

**Khuyến nghị:** dùng OpenNext ≥1.20.10 và Next ≥16.3.8 trên Workers, không dùng Pages. Chạy thử `npx vinext check` để biết khoảng cách thật.

## 2. D1

**Câu hỏi thật sự:** D1 có thay được Postgres + RLS của Fourty không?

**Sự thật đã kiểm**
- SQLite: "D1 is compatible with most SQLite's SQL convention since it leverages SQLite's query engine". Có module FTS5 (kèm `fts5vocab`), extension JSON, và hàm toán học. Nguồn: https://developers.cloudflare.com/d1/sql-api/sql-statements/
- Giới hạn (https://developers.cloudflare.com/d1/platform/limits/):
  - Kích thước: 10 GB/DB (Paid) và 500 MB (Free). Tổng 1 TB/tài khoản (Paid) và 5 GB (Free).
  - Số DB: 50.000 (Paid) và 10 (Free). Có thể xin tăng lên "millions to tens-of-millions". Bind được khoảng 5.000 DB vào một Worker script.
  - Query: 1.000 query mỗi lần gọi Worker (Paid) và 50 (Free). 100 tham số bind mỗi query. Câu SQL tối đa 100 KB.
  - Dữ liệu: hàng/chuỗi/BLOB tối đa 2 MB. Tối đa 100 cột mỗi bảng.
  - Thời gian: query tối đa 30 s. Time Travel 30 ngày (Paid) và 7 ngày (Free).
  - Nguyên văn về thiết kế: "D1 is designed for horizontal scale out across multiple, smaller (10 GB) databases, such as per-user, per-tenant or per-entity databases."
- Thông lượng: "Each individual D1 database is inherently single-threaded". Query trung bình 1 ms cho khoảng 1.000 query/s; query 100 ms chỉ còn khoảng 10 query/s. Nguồn: https://developers.cloudflare.com/d1/reference/faq/
- Transaction:
  - "Batched statements are SQL transactions… it aborts or rolls back the entire sequence." Nguồn: https://developers.cloudflare.com/d1/worker-api/d1-database/
  - Không có BEGIN/COMMIT tương tác. Khi import phải xóa `BEGIN TRANSACTION`/`COMMIT` khỏi file dump. Nguồn: https://developers.cloudflare.com/d1/best-practices/import-export-data/
  - Issue drizzle #2463 vẫn **mở**. Lỗi trả về: "To execute a transaction, please use the state.storage.transaction() API instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements". Product manager D1 (04/2025) nói "no ETA". Nguồn: https://github.com/drizzle-team/drizzle-orm/issues/2463
  - Drizzle khẳng định hỗ trợ D1: https://orm.drizzle.team/docs/connect-cloudflare-d1
- RLS: tài liệu D1 không có chữ nào về RLS. Trang SaaS của Cloudflare chỉ đề xuất "database per tenant… or use row-level isolation in a shared database", tức là lọc ở tầng ứng dụng. Nguồn: https://developers.cloudflare.com/use-cases/saas/data-isolation/ . Kết luận **D1 không có RLS** là suy luận từ việc tài liệu không đề cập.
- Read replication:
  - Bản sao chỉ đọc được đặt ở mọi vùng hỗ trợ. Mọi lệnh ghi vẫn đi về primary. Không tốn thêm phí.
  - Phải dùng Sessions API (`withSession`) thì mới đọc từ replica.
  - Trạng thái beta hay GA: **chưa kiểm** (trang không ghi rõ).
  - Nguồn: https://developers.cloudflare.com/d1/best-practices/read-replication/

**Ví dụ cụ thể:** "Chuyển deal sang stage Won, ghi activity, rồi xếp job gửi webhook".
- Trên Postgres hôm nay: một transaction duy nhất, đọc kết quả bước 1 để dùng ở bước 2, RLS tự lọc theo workspace.
- Trên D1: phải gói cả ba lệnh vào một `batch()` dựng sẵn trước. Không đọc được giá trị giữa chừng (issue #2463 nêu đúng giới hạn này). Mọi câu `WHERE workspace_id = ?` phải tự viết tay. Riêng việc xếp job thì nằm ngoài D1 hoàn toàn.

**Áp vào Fourty**
- `withWorkspace` bọc cả handler trong một transaction (`src/db/index.ts`), nên không chuyển thẳng sang D1 được.
- Schema dùng `drizzle-orm/pg-core`, RLS nằm trong 4+ migration, và bigint được parse riêng.
- Ngoài ra còn giới hạn 100 tham số bind mỗi query, sẽ chạm vào các lệnh insert hàng loạt.

**Khuyến nghị:** không dùng D1 làm DB chính cho Fourty.

## 3. Hyperdrive

**Câu hỏi thật sự:** giữ Postgres hiện tại, cho Worker nói chuyện với nó qua Hyperdrive, thì RLS có còn đúng không?

**Sự thật đã kiểm**
- Hỗ trợ PostgreSQL "9.0 to 18.x". Nguồn: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- Driver: `pg` là "recommended", tối thiểu 8.16.3 (https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/). Trang tổng quan ghi 8.13.0, mâu thuẫn; lấy số chặt hơn. Drizzle tối thiểu 0.26.2. Nguồn: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- Pooling và trạng thái phiên:
  - "operates in transaction mode".
  - "Hyperdrive supports `SET` statements for the duration of a transaction or a query… if you manually create a transaction with `BEGIN`/`COMMIT`, `SET` statements within the transaction will take effect."
  - "When a connection is returned to the pool, the connection is `RESET`."
  - "Hyperdrive supports named prepared statements as implemented in the `postgres.js` and `node-postgres` drivers."
  - Nguồn: https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/
- Không hỗ trợ: quản lý prepared statement ở mức SQL (`PREPARE`/`EXECUTE`/`DISCARD`/`DEALLOCATE`), advisory locks, `LISTEN`/`NOTIFY`, và "any modification to per-session state not explicitly documented as supported elsewhere". Cách lách được gợi ý: một client thứ hai kết nối trực tiếp, không qua Hyperdrive. Nguồn: https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- Giới hạn (Free / Paid):
  - Số cấu hình: 10 / 25.
  - Kết nối tới DB gốc: khoảng 20 / khoảng 100 mỗi cấu hình.
  - Query tối đa 60 s. Timeout kết nối 15 s. Kết nối rảnh 10 phút. Kết quả cache tối đa 50 MB.
  - Nguồn: https://developers.cloudflare.com/hyperdrive/platform/limits/
  - Transaction dài sẽ "exhaust Hyperdrive's available connections more quickly", nên "Keep transactions as short as possible". Nguồn: https://developers.cloudflare.com/hyperdrive/concepts/connection-lifecycle/
- Giá: 100.000 query/ngày (Free), không giới hạn (Paid). Pooling và cache đã gồm trong gói. Nguồn: https://developers.cloudflare.com/hyperdrive/platform/pricing/
- Client theo request: "Create a new client instance for each request". Client tạo ở phạm vi toàn cục sẽ dính lỗi "Cannot perform I/O on behalf of a different request". Nguồn: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/ và https://developers.cloudflare.com/workers/observability/errors/
- DB nằm trong mạng riêng: đi qua Cloudflare Tunnel cộng Cloudflare Access. **Bắt buộc TLS**. Nguồn: https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database/
- **Cache (rủi ro bảo mật)**:
  - "Query caching is enabled by default". Mặc định `max_age` 60 s, `stale_while_revalidate` 15 s.
  - Việc nhận diện query không cache được dựa trên **so khớp văn bản** câu query. Nguồn: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/ và https://developers.cloudflare.com/changelog/post/2026-02-23-hyperdrive-stable-functions-uncacheable/
  - Có một trạng thái cache riêng là `transaction` ("Query is part of a transaction"). Nguồn: https://developers.cloudflare.com/hyperdrive/observability/metrics/

**Ví dụ cụ thể:** người dùng workspace A mở trang Deals.
- Worker tạo một `pg.Client` mới. Hyperdrive cho mượn một kết nối.
- Trên kết nối đó chạy `BEGIN` → `set_config('app.workspace_id','A',true)` → `SELECT … FROM deals` → `COMMIT`.
- Kết nối được RESET rồi trả về pool. RLS vẫn đúng, vì `set_config(…, true)` chỉ sống trong transaction, đúng kiểu mà Hyperdrive hỗ trợ.
- Rủi ro nằm ở các query chạy **ngoài** transaction, qua `baseDb`, ví dụ tra session hay API key. Hyperdrive có thể trả kết quả cache cũ tới 60 s, ví dụ một key vừa bị thu hồi vẫn còn dùng được trong 1 phút. Hyperdrive cũng không "nhìn thấy" policy RLS vì policy không nằm trong văn bản query.
- Suy luận rằng query trong transaction không bị cache dựa trên trạng thái `transaction` ở trang metrics: **chưa kiểm bằng thực nghiệm**.

**Áp vào Fourty**
- `pg ^8.22.0` đạt mức tối thiểu 8.16.3.
- `src/db/index.ts` tạo `pg.Pool` toàn cục, phải đổi sang tạo client theo request.
- Phía pg-boss: `useListenNotify` không chạy qua pooler kiểu transaction (pg-boss tự lùi về polling). Migration của pg-boss dùng `pg_advisory_xact_lock`, nên chạy migration qua kết nối trực tiếp hoặc bật `noAdvisoryLocks`. Nguồn: https://github.com/timgit/pg-boss/blob/master/docs/api/constructor.md và https://github.com/timgit/pg-boss/blob/master/docs/database-backends.md
- Route chat AI giữ transaction trong lúc gọi nhiều tool, sẽ chiếm kết nối lâu trong khi trần chỉ khoảng 100.

**Khuyến nghị:** dùng Hyperdrive với cấu hình `--caching-disabled`, client theo request, và giữ RLS như hiện tại.

## 4. Tương thích Node trong Workers

**Sự thật đã kiểm**
- "For compatibility dates of `2026-08-04` or later, Workers enables both `nodejs_compat` and `nodejs_compat_v2` by default". Với ngày 2024-09-23 đến 2026-08-03 thì phải tự thêm flag.
- Trạng thái các module: `net`, `http(s)`, `stream`, `zlib`, `fs` và AsyncLocalStorage được hỗ trợ. `tls` và `dns` hỗ trợ một phần. `worker_threads` và `child_process` chỉ là stub không chạy.
- Nguồn: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- `node:crypto`: "All `node:crypto` APIs are fully supported… with the following exceptions": không có cặp khóa DSA/DH, không có `argon2`, không có `ed448`/`x448`, không bật/tắt được FIPS. Nguồn: https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- TCP:
  - "Workers cannot create outbound TCP connections on port 25".
  - "Outbound TCP sockets to Cloudflare IP ranges are blocked".
  - Có hỗ trợ `starttls`.
  - Nguồn: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- `pg`: Cloudflare có hướng dẫn chính thức (xem mục 3).
- nodemailer:
  - Cloudflare chỉ có ví dụ nodemailer chạy **từ app bên ngoài** tới `smtp.mx.cloudflare.net:465`. Nguồn: https://developers.cloudflare.com/email-service/examples/email-sending/smtp/
  - Chạy nodemailer bên trong Worker tới SMTP bên thứ ba qua 465/587: **chưa kiểm**. `tls` chỉ hỗ trợ một phần, nên đây là điểm rủi ro.
  - Gọi SMTP của chính Cloudflare từ Worker nhiều khả năng bị chặn theo quy tắc "Cloudflare IP ranges" (suy luận, chưa kiểm).
- pino:
  - Maintainer workerd (jasnell): "The Node.js specific version of pino does not work in workers for sure".
  - Tác giả pino (mcollina): transports "make no sense in workerd", và "the browser implementation of pino should work".
  - Bản browser chạy được thật hay không: **chưa kiểm**.
  - Nguồn: https://github.com/cloudflare/workerd/discussions/3423

**Áp vào Fourty**
- Theo grep, các hàm crypto đang dùng là `randomBytes` (20 chỗ), `timingSafeEqual`, `createHmac`, `scryptSync`, `createCipheriv`. Tất cả nằm trong vùng được hỗ trợ. `scryptSync` tốn CPU, sẽ tính vào hạn mức 30 s.
- `src/lib/mail.ts` đã có sẵn transport Resend qua HTTP, đây là đường gửi mail ít rủi ro nhất trên Worker.
- `src/lib/logger.ts` dùng pino, phải thay bằng logger JSON qua `console`.
- Gói `graphql` là JS thuần, nhiều khả năng chạy được, nhưng **chưa kiểm**.

**Khuyến nghị:** giữ `pg` và crypto; gửi mail bằng HTTP (Resend hoặc binding Email); bỏ pino.

## 5. Job nền

**Câu hỏi thật sự:** pg-boss có chạy trong Worker được không? Nếu không thì thay bằng gì?

**Sự thật đã kiểm (pg-boss)**
- Một instance "meant to be long-lived: create one per process… including from serverless functions" (gửi job thì được). Nguồn: https://github.com/timgit/pg-boss/blob/master/docs/introduction.md
- `work()` là "polling worker", mặc định `pollingIntervalSeconds` = 2. Nguồn: https://github.com/timgit/pg-boss/blob/master/docs/api/workers.md
- Dùng trong môi trường serverless:
  - Nên đặt `registerInstance: false`.
  - Có option `db` để tự cấp `executeSql`, và có `supervise`/`schedule`/`migrate` để tắt từng phần.
  - Nguồn: https://github.com/timgit/pg-boss/blob/master/docs/api/constructor.md
- Có `@pg-boss/proxy` (HTTP) "for platform compatibility (calling pg-boss from non-Node runtimes or serverless functions)". Nguồn: https://github.com/timgit/pg-boss/blob/master/docs/proxy.md
- Yêu cầu Node ≥22.12. Bản mới nhất 12.37.1 (2026-10-08). Nguồn: https://github.com/timgit/pg-boss
- **Kết luận:** gửi job từ Worker là có thể về lý thuyết (chạy trên workerd: chưa kiểm). Còn vòng poll của `work()` cần một tiến trình sống lâu, nên Worker không thay được.

**Các mảnh thay thế**

| Mảnh | Số liệu (đã kiểm) | Nguồn |
|---|---|---|
| Queues | Tin tối đa 128 KB. Retry tối đa 100. Lô tiêu thụ 100 tin. `sendBatch` 100 tin hoặc 256 KB. Chờ lô tối đa 60 s. 5.000 tin/s mỗi queue. Trễ (`delaySeconds`) tối đa 24 h. Giữ tin đến 14 ngày (Free: 24 h). Backlog 25 GB. 250 consumer đồng thời. Consumer chạy 15 phút wall-clock, CPU 30 s mặc định, nâng được tới 5 phút. 10.000 queue/tài khoản. | https://developers.cloudflare.com/queues/platform/limits/ |
| Cron Triggers | Cú pháp 5 trường, mịn nhất 1 phút, chạy theo UTC. 5 (Free) / 250 (Paid) mỗi tài khoản. Thay đổi lịch mất tối đa 15 phút để có hiệu lực. Mỗi lần chạy tối đa 15 phút. | https://developers.cloudflare.com/workers/configuration/cron-triggers/ , https://developers.cloudflare.com/workers/platform/limits/ |
| Workflows | Số bước: 1.024 (Free) / 10.000 mặc định, nâng tới 25.000 (Paid). CPU mỗi bước 10 ms / 30 s, nâng tới 5 phút. Ngủ tối đa 365 ngày. State 100 MB / 1 GB. Kết quả mỗi bước 1 MiB. Instance đồng thời 100 / 50.000. Tạo instance 300/s mỗi tài khoản. Lưu kết quả 3 / 30 ngày. | https://developers.cloudflare.com/workflows/reference/limits/ |
| DO alarms | Mỗi DO chỉ có một alarm tại một thời điểm. Đảm bảo chạy ít nhất một lần. Retry với backoff bắt đầu 2 s, tối đa 6 lần. | https://developers.cloudflare.com/durable-objects/api/alarms/ |

**Ví dụ cụ thể:** hiện nay `src/worker/index.ts:71-92` dùng `setInterval` 60 s, mỗi nhịp xếp một job `agent.dispatch` cho từng workspace.
- Trên Cloudflare: một Cron `* * * * *` (mỗi phút, đúng bằng `AGENT_TICK_SECONDS` mặc định) gọi Worker. Worker đọc danh sách workspace rồi `sendBatch` vào Queue. Consumer xử lý `agent.dispatch`, `workflow.dispatch`, `mail.send`.
- **Mất đi:** khả năng của pg-boss "job exists if, and only if, the change commits" (https://github.com/timgit/pg-boss/blob/master/docs/introduction.md). Queue không nằm trong transaction Postgres, nên cần bảng outbox cộng với Cron đẩy outbox ra Queue.
- **Giữ được:** bảng `job_receipts` chống chạy trùng của Fourty (`src/lib/queue.ts`) khớp sẵn với kiểu giao "at-least-once" của Queue.

**Khuyến nghị:** dùng Queues + Cron + outbox. Workflows chỉ dùng khi có chuỗi nhiều bước cần ngủ hoặc chờ sự kiện. Không cần DO alarms.

## 6. R2 cho file đính kèm

- Presigned URL:
  - Hỗ trợ "GET… HEAD… PUT… DELETE". **Không** hỗ trợ POST multipart form.
  - Hạn "1 second to 7 days (604,800 seconds)".
  - Chỉ chạy trên domain S3 API `<ACCOUNT_ID>.r2.cloudflarestorage.com`, "cannot be used with custom domains".
  - Nguồn: https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Giới hạn:
  - 1.000.000 bucket. File tối đa 5 TiB. Upload một phần tối đa 5 GiB; multipart tối đa 4,995 TiB với 10.000 phần.
  - Key tối đa 1.024 byte. Metadata tối đa 8.192 byte.
  - Ghi đồng thời vào cùng một key: 1 lần/s.
  - Nguồn: https://developers.cloudflare.com/r2/platform/limits/
- Giá Standard: $0,015/GB-tháng, miễn phí 10 GB. Class A $4,50/triệu (miễn phí 1 triệu). Class B $0,36/triệu (miễn phí 10 triệu). Egress miễn phí. Nguồn: https://developers.cloudflare.com/r2/pricing/
- Lưu ý ghép với giới hạn Worker: body request 100 MB (Free/Pro). File lớn hơn phải dùng presigned PUT để upload thẳng lên R2.

**Khuyến nghị:** upload bằng presigned PUT; tải về qua Worker kèm kiểm tra RBAC, hoặc presigned GET ngắn hạn.

## 7. Email

- Email Sending:
  - "Beta for outbound transactional emails", "Available on Workers Paid plan". Email Routing đã GA. Nguồn: https://developers.cloudflare.com/email-service/
  - Public beta từ 2026-04-16. SMTP submission beta từ 2026-06-08 (`smtp.mx.cloudflare.net:465`). Từ 2026-07-15 có sự kiện delivered/bounced/complained đẩy qua Queues. Nguồn: https://developers.cloudflare.com/changelog/product/email-service/
- Bắt buộc DNS: "You must be using Cloudflare DNS to use Email Service." Nguồn: https://developers.cloudflare.com/email-service/get-started/send-emails/
- Giới hạn:
  - 50 người nhận mỗi mail. 5 MiB (25 MiB nếu gửi tới địa chỉ đã xác minh). Subject tối đa 998 ký tự. Header tối đa 16 KB.
  - Hạn mức gửi mỗi ngày tự tăng dần theo uy tín tài khoản. **Con số cụ thể: chưa kiểm** (không công bố).
  - Nguồn: https://developers.cloudflare.com/email-service/platform/limits/
- API binding: `send_email` → `env.EMAIL.send({to, from, subject, html, text, cc, bcc, replyTo, attachments, headers})`, tối đa 32 attachment. Nguồn: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
- Giá: gói Paid gồm 3.000 mail/tháng, sau đó $0,35/1.000. Gói Free không gửi ra ngoài được. Nhận mail miễn phí. Nguồn: https://developers.cloudflare.com/email-service/platform/pricing/

**Áp vào Fourty:** Fourty là sản phẩm self-host, khách tự mang domain riêng. Yêu cầu bắt buộc Cloudflare DNS cộng trạng thái beta khiến Email Service không thể là đường gửi **duy nhất**.

**Khuyến nghị:** giữ transport Resend (HTTP) làm mặc định trên Workers; thêm Email Service làm tùy chọn thứ hai.

## 8. Kết nối dài: MCP, SSE, WebSocket

- MCP:
  - Streamable HTTP là "the standard transport method for remote MCP connections". SSE "has been deprecated in favor of Streamable HTTP".
  - `createMcpHandler` là stateless, **không cần DO**. OAuth đi qua thư viện Workers OAuth Provider.
  - Nguồn: https://developers.cloudflare.com/agents/model-context-protocol/transport/
- SSE và streaming: HTTP "No limit" về thời lượng khi client còn kết nối. CPU vẫn chịu trần 30 s mặc định, tối đa 5 phút. Nguồn: https://developers.cloudflare.com/workers/platform/limits/
- WebSocket:
  - "Both Workers and Durable Objects can act as WebSocket endpoints".
  - Hibernation API: "Billable Duration (GB-s) charges do not accrue during hibernation".
  - Nguồn: https://developers.cloudflare.com/durable-objects/best-practices/websockets/
  - DO: khoảng 1.000 request/s mỗi object (giới hạn mềm), tin WS nhận tối đa 32 MiB, 10 GB lưu trữ mỗi DO (Paid). Nguồn: https://developers.cloudflare.com/durable-objects/platform/limits/

**Áp vào Fourty**
- `src/mcp/server.ts` là JSON-RPC tự viết, kiểu request→response thuần, protocol `2024-11-05`. Đặt trong một Route Handler là chạy được mà không cần Agents SDK (suy luận, chưa kiểm).
- Transport stdio vẫn là CLI chạy cục bộ.
- Route chat AI (`src/app/api/ai/chat/route.ts`) stream `text/event-stream`, tương thích với Workers.
- Repo không có WebSocket (đã grep), nên chưa cần DO.

**Khuyến nghị:** giữ MCP như hiện tại. Chỉ cân nhắc `createMcpHandler` khi muốn OAuth chuẩn.

## 9. Ảnh chụp giá cho team nhỏ

Gói Workers Paid giá $5/tháng cho cả tài khoản (https://developers.cloudflare.com/workers/platform/pricing/):

| Dịch vụ | Quota đã gồm mỗi tháng | Vượt quota | Nguồn |
|---|---|---|---|
| Workers | 10M request; 30M CPU-ms | $0,30/M request; $0,02/M CPU-ms | pricing ở trên |
| D1 | 25 tỷ hàng đọc; 50M hàng ghi; 5 GB | $0,001/M đọc; $1/M ghi; $0,75/GB | https://developers.cloudflare.com/d1/platform/pricing/ |
| Hyperdrive | Không giới hạn query | Không có | https://developers.cloudflare.com/hyperdrive/platform/pricing/ |
| Queues | 1M thao tác (mỗi tin thường tốn 3 thao tác, tính theo khối 64 KB) | $0,40/M | https://developers.cloudflare.com/queues/platform/pricing/ |
| Workflows | 10M request; 30M CPU-ms; 1 GB; 500k bước (tính phí bước và lưu trữ từ 2026-08-10) | $0,80/100k bước; $0,20/GB | https://developers.cloudflare.com/workflows/reference/pricing/ |
| Durable Objects | 1M request; 400k GB-s; 5 GB SQLite | $0,15/M; $12,50/M GB-s | pricing ở trên |
| KV | 10M đọc; 1M ghi; 1 GB | $0,50/M đọc; $5/M ghi | pricing ở trên |
| R2 (tính riêng) | 10 GB; 1M Class A; 10M Class B; egress miễn phí | $0,015/GB | https://developers.cloudflare.com/r2/pricing/ |
| Email Sending | 3.000 mail | $0,35/1.000 | https://developers.cloudflare.com/email-service/platform/pricing/ |

**Ví dụ minh họa** (phép tính trên giả định, không phải số đo): team 10 người dùng một tháng khoảng 300k request, 50k job (150k thao tác Queue), 5 GB file, 1.500 mail. Mọi dòng đều nằm trong quota, nên tổng tiền Cloudflare là **$5/tháng**. Khoản lớn còn lại là Postgres bên ngoài (Neon, Supabase hoặc VPS); giá các dịch vụ này: **chưa kiểm**, ngoài phạm vi nguồn.

---

## Giới hạn của nghiên cứu

- Không chạy thử gì. Mọi chữ "chạy được" đều dựa trên tài liệu; những chỗ là suy luận đã ghi rõ.
- Chưa kiểm:
  - nodemailer qua TLS bên trong workerd.
  - Bản browser của pino.
  - Gói `graphql`.
  - Cách OpenNext xử lý `serverExternalPackages`.
  - OpenNext hỗ trợ `instrumentation` tới đâu.
  - Hành vi cache của Hyperdrive với query trong transaction (chỉ suy luận từ trạng thái `transaction` ở trang metrics).
  - Ngày GA của Hyperdrive.
  - Trạng thái GA của D1 read replication.
  - Hạn mức gửi mail mỗi ngày.
  - Giá Postgres bên ngoài.
- Không đánh giá độ trễ thực tế từ Worker tới Postgres ở xa (phụ thuộc vùng đặt DB).

## Câu hỏi chưa giải quyết

1. Hyperdrive có bao giờ trả cache cho query nằm trong `BEGIN…COMMIT` không? Cần thử nghiệm với 2 workspace trước khi tin vào RLS qua Hyperdrive có bật cache.
2. Route chat AI giữ transaction bao lâu trong một lượt? Nếu hàng chục giây thì trần khoảng 100 kết nối của Hyperdrive có thành nút cổ chai?
3. OpenNext 1.20.10 có build sạch Fourty với `serverExternalPackages` hiện tại không, và bundle thực tế lớn bao nhiêu so với trần 64 MiB và thời gian khởi động 1 s?
4. Fourty quảng bá "deploys in 30 seconds" (self-host). Bản Cloudflare là **thêm một đích deploy** hay **thay thế**? Câu trả lời quyết định có phải duy trì hai tầng job (pg-boss và Queues) song song hay không.

## Chỗ trống cần điền

1. **Mục tiêu:** (a) Cloudflare là đích deploy thêm, Docker giữ nguyên; (b) Cloudflare thay hẳn bản self-host; (c) chỉ khảo sát, chưa làm.
2. **Postgres đặt ở đâu khi chạy trên Cloudflare:** (a) dịch vụ managed (Neon/Supabase, giá chưa kiểm); (b) VPS hiện có, nối qua Cloudflare Tunnel; (c) chấp nhận viết lại sang D1 (không khuyến nghị).
3. **Job nền:** (a) Queues + Cron + outbox, bỏ pg-boss trên bản Cloudflare; (b) giữ một Node worker pg-boss chạy ngoài Cloudflare (phương án B); (c) cả hai, chọn theo đích deploy.
4. **Adapter Next.js:** (a) OpenNext ngay bây giờ; (b) chạy `npx vinext check` trước rồi mới chọn; (c) chờ vinext rời beta.
5. **Mail trên Workers:** (a) chỉ Resend (HTTP); (b) Resend cộng Cloudflare Email Service tùy chọn; (c) chỉ Cloudflare Email Service (buộc khách dùng Cloudflare DNS).

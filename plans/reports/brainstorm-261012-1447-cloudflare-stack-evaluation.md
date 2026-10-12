# Đánh giá: chạy đầy đủ Fourty trên Cloudflare

Ngày 2026-10-12. Kỹ năng dùng: `mattpocock-skills:research` (agent nghiên cứu nền) và `mattpocock-skills:codebase-design` (đọc mã theo seam/adapter).
Dữ kiện nền tảng có nguồn đầy đủ: [research-261012-1435-cloudflare-platform-facts.md](./research-261012-1435-cloudflare-platform-facts.md).

## Kết luận một dòng

Fourty **có thể chạy đầy đủ tính năng trên Cloudflare**, với một điều kiện: Postgres vẫn phải đặt ở ngoài và nối qua Hyperdrive. Cloudflare không có Postgres, còn chuyển sang D1 đồng nghĩa với viết lại tầng dữ liệu và lật ngược ADR-003. Lượng việc ở mức vừa và tập trung vào khoảng 8 file. Trước khi làm có ba lỗi phải xử lý, cả ba đã kiểm trong code.

## Từ chuyên môn (định nghĩa một lần)

- **Worker**: đoạn code chạy trên máy chủ của Cloudflare, mỗi request được xử lý trong một *isolate*, tức một vùng chạy nhỏ, sống ngắn. Nhiều isolate chạy song song và không chia sẻ bộ nhớ với nhau.
- **Pages**: dịch vụ host web tĩnh. Với app full-stack, Cloudflare đã chuyển sang Workers.
- **D1**: cơ sở dữ liệu SQLite do Cloudflare quản lý. **R2**: kho file, dùng được như S3. **Queues**: hàng đợi tin nhắn. **Cron Trigger**: lịch chạy định kỳ.
- **Hyperdrive**: cầu nối từ Worker tới một Postgres đặt ở nơi khác. Nó gom kết nối lại và mặc định cache kết quả đọc.
- **RLS (Row-Level Security)**: Postgres tự lọc dòng theo workspace. Nhờ đó, kể cả khi code quên `WHERE workspace_id = …` thì dữ liệu cũng không lộ sang workspace khác.
- **OpenNext / vinext**: hai bộ chuyển (adapter) giúp app Next.js chạy được trên Workers.
- **Seam / adapter** (từ vựng của codebase-design): *seam* là chỗ trong code có thể thay hành vi mà không phải sửa ở chính chỗ đó; *adapter* là một bản cài đặt cắm vào seam. Theo skill này, một adapter chỉ là seam giả định, có hai adapter mới là seam thật.

## Câu hỏi này thật sự hỏi gì

Câu hỏi không phải "Cloudflare có chạy Next.js được không". Câu hỏi thật là: **bốn thứ Fourty đang dựa vào để có một tiến trình Node sống lâu cộng với Postgres có tồn tại trên Cloudflare không?** Bốn thứ đó là:

1. RLS: mỗi request mở một transaction rồi gọi `set_config('app.workspace_id', …, true)` (`src/db/index.ts:100-107`).
2. pg-boss worker: một tiến trình chạy liên tục, poll việc nền, cộng một `setInterval` 60 giây (`src/worker/index.ts:92`).
3. Bộ nhớ trong tiến trình: bộ giới hạn tần suất (`src/lib/ratelimit.ts`) và bộ đếm metrics (`src/lib/metrics.ts`).
4. API Node: `dns.lookup` dùng để chặn tấn công SSRF (`src/lib/net.ts:95`), SMTP qua nodemailer, pino.

## Hình dung cụ thể ba phương án

Ví dụ xuyên suốt: **chị Lan ở workspace "ACME" mở trang Contacts, sau đó một deal chuyển stage và kích hoạt webhook.**

### Phương án A: Workers + Hyperdrive + Postgres bên ngoài (khuyến nghị)

- Request của chị Lan đi vào Worker (OpenNext). Worker mở một kết nối `pg` qua Hyperdrive, chạy `BEGIN; set_config(ACME); SELECT … FROM contacts; COMMIT`. RLS vẫn lọc như hôm nay, vì Hyperdrive cho phép `SET` có hiệu lực bên trong transaction.
- Khi deal đổi stage, `enqueue("webhook.deliver")` gửi tin vào Cloudflare Queues thay vì pg-boss. Hàm consumer của Queues gọi lại đúng `runJob()` hiện có. Bảng `job_receipts` vẫn chặn được việc chạy trùng.
- `agent.dispatch` hiện chạy theo `setInterval` 60 giây, sẽ chuyển sang một Cron Trigger mỗi phút.
- File đính kèm (nếu sau này có) để trên R2. Mail gửi qua Resend (HTTP), vì `src/lib/mail.ts` đã có sẵn adapter này.
- Chi phí: gói Workers Paid $5/tháng cộng tiền Postgres bên ngoài (giá Postgres chưa kiểm).

### Phương án B: lai, web trên Workers và worker giữ nguyên

Giống A, nhưng không động vào pg-boss. Một tiến trình Node `npm run worker` vẫn chạy ở VPS hoặc Fly. Cách này ít sửa code hơn, nhưng hứa hẹn "chạy hoàn toàn trên Cloudflare" thì không giữ được.

### Phương án C: thuần D1

Request của chị Lan chạy `SELECT … FROM contacts` trên SQLite. D1 không có RLS, và hàm list hiện tại **không tự thêm điều kiện workspace** (`src/lib/actions/contacts/list.ts:18-36` chỉ lọc theo status/company). Nghĩa là chị Lan sẽ thấy contact của mọi workspace, trừ khi viết lại mọi query. Ngoài ra D1 không có BEGIN/COMMIT trong Worker, chỉ có `batch()` ("Batched statements are SQL transactions", [D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/)), và `custom-objects.ts` đang dùng `jsonb_each` của Postgres. Phương án này **trái với ADR-003**, quyết định đã bỏ hướng hai driver vì "permanent tax".

## Bằng chứng đã kiểm

| Điều kiểm | Kết quả | Nguồn |
|---|---|---|
| Hyperdrive có cache mặc định không | Có, `max_age` 60 s, tắt bằng `--caching-disabled`. Tài liệu không nói gì về query nằm trong transaction | [query-caching](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/), tự mở kiểm |
| AsyncLocalStorage (nền của proxy `db`) | Hỗ trợ, trừ `enterWith()`/`disable()`. Fourty chỉ dùng `run()`/`getStore()` | [asynclocalstorage](https://developers.cloudflare.com/workers/runtime-apis/nodejs/asynclocalstorage/), tự mở kiểm |
| `dns.lookup` trong Worker | **Ném lỗi "Not implemented"**. Các hàm `resolve4`/`resolve6` thì dùng được (qua DNS-over-HTTPS) | [dns](https://developers.cloudflare.com/workers/runtime-apis/nodejs/dns/), tự mở kiểm |
| D1 có transaction không | Chỉ qua `batch()` | [d1-database](https://developers.cloudflare.com/d1/worker-api/d1-database/), tự mở kiểm |
| Next/pg đang cài | next 16.3.0, pg 8.22.0. OpenNext đòi Next ≥16.3.8 (theo báo cáo nghiên cứu) | `node_modules`, đã chạy kiểm |
| Có middleware/proxy, `next/image`, `after()`, ISR không | Không có file nào | grep `src/`, đã chạy kiểm |
| enqueue có nằm chung transaction với dữ liệu không | **Không**. pg-boss dùng pool riêng với vai trò owner (`src/lib/queue.ts`, phần chú thích đầu file), nên chuyển sang Queues **không làm mất** tính chất nào đang có | code, đã đọc |
| Giới hạn CPU/bundle, Queues, R2, giá | Xem báo cáo nghiên cứu | agent đã mở các trang đó; tôi chưa tự mở lại |

## Bản đồ seam: chỗ nào dễ, chỗ nào khó

Đọc theo codebase-design: **chỗ đã có hai adapter thì thêm adapter Cloudflare rẻ; chỗ chưa có seam thì phải tạo seam trước.**

| Module | Hiện trạng seam | Việc trên Cloudflare | Mức |
|---|---|---|---|
| Hàng đợi `enqueue()` (`src/lib/queue.ts`) | **Seam thật**: 2 adapter `pgboss`, `inline` | Thêm adapter thứ ba `cfqueue`, consumer gọi `runJob()` | Vừa |
| Mail (`src/lib/mail.ts`) | **Seam thật**: SMTP, Resend | Dùng Resend; SMTP coi như không dùng được (nodemailer trên Worker: chưa kiểm) | Nhỏ |
| `db` / `withWorkspace` (`src/db/index.ts`) | Interface nhỏ và sâu, nhưng chỉ có 1 adapter (`pg.Pool` toàn cục) | Thêm adapter Hyperdrive: tạo client theo từng request. Interface giữ nguyên nên ~350 file gọi `db` không phải sửa | Vừa |
| Tick 60 s (`src/worker/index.ts:92`) | Không có seam | Đưa hàm `tick()` ra ngoài, gọi từ Cron Trigger | Nhỏ |
| Chặn SSRF (`src/lib/net.ts:95`) | Không có seam | Đổi `lookup` sang `resolve4` + `resolve6`. Không sửa thì **mọi webhook tới hostname bị chặn** (rơi vào nhánh "DNS resolution failed") | Nhỏ |
| Giới hạn tần suất (`src/lib/ratelimit.ts`) | Không có seam, `Map` trong bộ nhớ | Mỗi isolate có `Map` riêng nên chống brute-force đăng nhập yếu đi. Cần adapter dùng chung (Durable Object hoặc binding Rate Limiting; chi tiết chưa kiểm) | Vừa |
| Metrics Prometheus (`src/lib/metrics.ts`) | `Map` trong bộ nhớ | Mỗi isolate đếm riêng nên `/api/metrics` sai. Chấp nhận tắt, hoặc chuyển sang Workers Analytics (chưa kiểm) | Nhỏ |
| Logger pino (`src/lib/logger.ts`) | Không có seam | Bản Node của pino không chạy trên workerd (theo báo cáo nghiên cứu). Cần adapter `console` JSON | Nhỏ |
| Migration (`src/db/migrate.ts`) | Chạy bằng CLI | Chạy từ CI hoặc máy local, nối thẳng Postgres, không qua Hyperdrive | Không đổi |

## Ba lỗi phải chặn trước khi làm (bẫy thường gặp)

1. **Hyperdrive cache có thể làm lộ dữ liệu giữa workspace.** Query list contacts của ACME và của workspace khác có **cùng câu SQL và cùng tham số**, vì việc lọc nằm ở RLS chứ không nằm trong câu query. Hyperdrive cache theo câu query và không nhìn thấy RLS. Tài liệu không nói rõ query trong transaction có được cache hay không (chưa kiểm). Cách xử lý: tạo Hyperdrive với `--caching-disabled` và viết test hai workspace chạy song song. Lỗi người mới hay mắc ở đây là để cache mặc định vì "cho nhanh".
2. **`dns.lookup` ném lỗi trên Worker**, nên webhook chết âm thầm. Đây là kiểu lỗi chạy tốt ở local nhưng hỏng trên production, vì local chạy Node thật.
3. **Đừng tạo `pg.Pool` toàn cục trong Worker.** Isolate có thể bị thu hồi bất cứ lúc nào, nên Hyperdrive mới là "pool" thật. Code chỉ cần mở client ngắn theo từng request. Người mới hay giữ nguyên `new pg.Pool()` rồi gặp lỗi kết nối treo.

Thêm hai điểm nhỏ: Fourty đang ở Next 16.3.0, OpenNext đòi ≥16.3.8 nên phải nâng bản trước. Và đừng chọn Pages: `next-on-pages` đã archived.

## Điều gì thay đổi nếu chọn mỗi phương án

| | A: Hyperdrive + Queues | B: lai | C: D1 |
|---|---|---|---|
| Giữ RLS / ADR-001 | Có | Có | Không |
| Giữ ADR-003 (không hai driver) | Có | Có | Không, phải viết ADR mới để thay |
| "Chạy hoàn toàn trên Cloudflare" | Có, trừ Postgres | Không | Có |
| Bản Docker self-host | Giữ nguyên, vì Cloudflare chỉ là thêm adapter | Giữ nguyên | Bị tách nhánh hai dialect |
| Câu "one process, one Postgres" trong README | Vẫn đúng cho bản Docker; bản Cloudflare là đích thứ hai | Như A | Không còn đúng |
| Rủi ro chính | Cache Hyperdrive; trần khoảng 100 kết nối; route chat AI giữ transaction lâu | Phải vận hành thêm một máy | Lộ dữ liệu giữa tenant; viết lại query |

## Khuyến nghị

**Chọn A, làm như một đích deploy thứ hai bên cạnh Docker, không thay Docker.** Làm theo thứ tự: (1) mũi thử OpenNext build Fourty, đo bundle; (2) thêm adapter Hyperdrive cho `db`, tắt cache, viết test hai workspace; (3) sửa `net.ts` và logger; (4) adapter `cfqueue` + Cron; (5) giới hạn tần suất dùng chung. Ghi quyết định lại thành ADR-020 (dùng skill `mattpocock-skills:domain-modeling`).

## Key takeaways

- Câu hỏi đúng là "nền tảng có thứ mà kiến trúc của ta dựa vào không", chứ không phải "framework có chạy không".
- Seam đã có hai adapter (queue, mail) thì sang Cloudflare rẻ. Chỗ chưa có seam (rate limit, metrics, DNS) mới là phần tốn công thật.
- Cache dùng chung cộng với RLS là tổ hợp nguy hiểm. Bảo mật phải đi kèm test, không dựa vào giả định.
- D1 phù hợp với app mới thiết kế cho SQLite, không phù hợp để chuyển một hệ đã dựa vào RLS.

## Đọc thêm

- [Hyperdrive: How it works](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [OpenNext Cloudflare](https://opennext.js.org/cloudflare)
- Nên học tiếp: mẫu "transactional outbox", và Durable Objects cho trạng thái dùng chung giữa các isolate.

## Chỗ trống cần điền

1. **Mục tiêu:** (a) Cloudflare là đích deploy thêm, Docker giữ nguyên *(khuyến nghị)*; (b) Cloudflare thay hẳn Docker; (c) chỉ khảo sát, chưa làm.
2. **Postgres ở đâu:** (a) managed như Neon/Supabase; (b) VPS hiện có, nối qua Cloudflare Tunnel; (c) chấp nhận D1 và viết lại (không khuyến nghị).
3. **Job nền:** (a) Queues + Cron, bỏ pg-boss trên bản Cloudflare *(khuyến nghị)*; (b) giữ worker pg-boss ở ngoài (phương án B).
4. **Bước đầu tiên:** (a) mũi thử OpenNext build + đo bundle, khoảng nửa ngày *(khuyến nghị)*; (b) lập kế hoạch đầy đủ ngay bằng `ak:plan`.
5. **Mail trên Cloudflare:** (a) chỉ Resend *(khuyến nghị)*; (b) thêm Cloudflare Email Service tùy chọn (đang beta, buộc dùng Cloudflare DNS).

## Câu hỏi chưa giải quyết

- Hyperdrive có cache query nằm trong transaction không? Tài liệu không nói; cần test hai workspace.
- Route chat AI giữ transaction trong bao lâu? Liệu có chạm trần khoảng 100 kết nối của Hyperdrive?
- nodemailer có chạy trong Worker không? Chưa kiểm.
- Cloudflare Containers (chạy thẳng image Docker hiện có) có phải lối tắt không? Chưa kiểm, không nằm trong phạm vi nghiên cứu.

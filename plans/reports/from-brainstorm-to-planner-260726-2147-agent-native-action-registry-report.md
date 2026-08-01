# Brainstorm — Tích hợp BuilderIO/agent-native vào Fourty

**Ngày:** 2026-07-27 · **Branch:** main · **Scope đã chốt:** report + ADR, không đụng code
**Output kèm theo:** [ADR-017 — Action Registry](../../docs/adr/017-action-registry.md) (Proposed)

---

## 1. Đề bài gốc và phép đảo ngược vấn đề

**Đề bài như user phát biểu:** "tìm giải pháp để tích hợp repo này vào improve fourty
— https://github.com/BuilderIO/agent-native".

Đây là dạng *bắt đầu từ giải pháp*. Áp dụng problem-first inversion:

| Bước | Kết luận |
|---|---|
| **Giải pháp đề xuất** | Tích hợp agent-native vào Fourty |
| **Vấn đề ngầm** | Fourty muốn "agent-native" nhưng (a) logic nghiệp vụ trùng lặp 3 nơi, (b) UX agent còn cạn, (c) thiếu định vị, (d) bề mặt tích hợp hẹp |
| **Giả định cần kiểm chứng** | "agent-native tích hợp được" → **SAI**. Nó là framework (Nitro+Vite+React), cùng tầng với Next.js, docs upstream nói rõ không adopt tăng dần được |
| **Vấn đề thật, phát biểu lại** | *Một năng lực nghiệp vụ phải được định nghĩa một lần và có mặt trên mọi bề mặt (UI, REST, GraphQL, MCP, agent, workflow) — hiện đang phải viết tay 3 lần* |
| **Khung thay thế đã cân nhắc** | (i) Vấn đề UX agent → giải bằng feature, không cần đổi kiến trúc; (ii) Vấn đề marketing → giải bằng claim kiểm chứng được; (iii) Vấn đề nợ kỹ thuật → chính là cái đắt nhất và cũng là gốc của (i)+(ii) |
| **Bằng chứng** | Xem §3 — trích dẫn code cụ thể |
| **Kết luận** | Lấy *pattern* `defineAction`, không lấy *dependency*. Giải quyết được cả 4 mục tiêu người dùng chọn |
| **Chi phí nếu làm sai** | Fork/migrate wholesale = vứt ADR-001/005/008/011 + workflow engine, tính bằng quý |

---

## 2. Ràng buộc đã chốt với user

1. Cả 4 mục tiêu: gỡ trùng lặp API surface · nâng cấp UX agent · định vị "agent-native" · mở rộng bề mặt tích hợp.
2. **Giữ tuyệt đối** "một process, một Postgres" → loại bỏ mọi phương án sidecar.
3. `defineAction()` **chỉ nội bộ**, giữ ADR-016 nguyên vẹn, không mở public SDK.
4. Định vị chỉ dùng **claim kiểm chứng được**, không overclaim thành platform.
5. Vòng này chỉ ra report + ADR.

---

## 3. Bằng chứng từ codebase (đã đọc, không suy đoán)

### 3.1 Trùng lặp ba tầng

Cùng chuỗi guard/side-effect, ráp tay ở 3 nơi:

```
can() → loadFieldPolicy/blockedWrites() → zod validator → mutate
      → logActivity() → audit() → dispatchEvent() → recompute*Score() → redact()
```

| Surface | File | Quy mô |
|---|---|---|
| REST | `src/app/api/**/route.ts` | 58 file route |
| GraphQL | `src/lib/graphql/schema.ts` | resolver inline |
| MCP + AI | `src/mcp/tools.ts` | 698 dòng, ~20 tool |

Cả ba import y hệt: `audit`, `logActivity`, `dispatchEvent`, `recomputeContactScore`,
`contactInput`, `loadFieldPolicy/redact/blockedWrites`, `can`, `newId`.

### 3.2 Trùng lặp đã ăn vào tính năng người dùng

Comment trong `src/lib/graphql/schema.ts`: deals/tasks/notes **read-only trên GraphQL**
vì *"their stage/entity-link side effects live in REST"*. Một lỗ hổng API công khai,
nguyên nhân duy nhất là chi phí viết chuỗi side-effect lần thứ ba.

### 3.3 Kiến trúc hiện tại vi phạm guardrail của chính nó

ADR-016 guardrail #3: *"AI mutations go through the same tool/service helpers,
**never raw `db` calls**"*. Nhưng `src/mcp/tools.ts` gọi `db.select()` / `db.insert()`
trực tiếp. Guardrail hiện được giữ bằng kỷ luật copy-paste, không phải bằng kiến trúc.

→ Action Registry không đi ngược ADR-016; nó là cách duy nhất **thực thi** ADR-016.

### 3.4 Nền tảng đã có, không cần xây lại

`src/lib/ai/agent.ts` (vòng lặp stop-at-write, SSE, confirm write), `tool-bridge.ts`,
`Tool` type trong `tools.ts` với `mutates` flag, `ToolContext` mang `via` cho audit —
đây thực chất đã là *nửa* một action registry. Việc còn lại là hoàn thiện và cho REST/
GraphQL dùng chung.

---

## 4. agent-native — đánh giá thực tế

**Là gì:** framework full-stack MIT của BuilderIO. Nitro (server) + Vite + React +
Drizzle + hook kiểu TanStack. 18 package (`core`, `skills`, `toolkit`, `embedding`,
`dispatch`, `scheduling`, `frame`, `migrate`, extension VSCode/Chrome/desktop/mobile…).
Ý tưởng lõi: `defineAction()` — định nghĩa một lần, lộ ra UI/HTTP/MCP/agent/cron/CLI.

**Rào chặn cứng:** docs upstream nói thẳng — không adopt tăng dần vào app Next.js sẵn có;
phải scaffold bằng `npx @agent-native/core@latest create`. Không tồn tại đường
dependency nào.

### Lấy gì / bỏ gì

| Lấy (viết lại trong stack Fourty) | Bỏ |
|---|---|
| Pattern `defineAction` | Nitro/Vite runtime — xung đột Next.js |
| Skills dạng file markdown hướng dẫn agent | `@agent-native/core` làm dependency |
| Context-awareness (record đang xem → prompt) | Toolkit UI/collaboration — Fourty có UI riêng |
| Generative UI (tool result → card trong chat) | Embedding SDK / plugin platform — ADR-016 nói NO |
| Recurring agent jobs (pg-boss đã sẵn) | Desktop/mobile/VSCode/Chrome extension |

---

## 5. Các phương án đã cân nhắc

| # | Phương án | Ưu | Nhược | Kết luận |
|---|---|---|---|---|
| A | **Port pattern → Action Registry nội bộ** | 0 dep mới; giữ nguyên moat; xoá trùng lặp; surface mới gần như free; thực thi được guardrail ADR-016 | Refactor xuyên 58 route; kernel là điểm nghẽn; rủi ro over-abstraction | **CHỌN** |
| B | Sidecar agent-native nối qua MCP HTTP | 0 thay đổi core; có ngay chat UX/skills/Slack | 2 deployable, 2 DB, phải bridge auth/RLS; giết "deploy 30 giây" | Loại — user chốt giữ một process |
| C | Cherry-pick tính năng, không đụng kiến trúc | Rẻ, tăng dần, mỗi thứ 1 PR | Không giải quyết trùng lặp; nợ kỹ thuật còn nguyên | **Bổ sung cho A**, không thay A |
| D | Migrate wholesale sang agent-native | Có toàn bộ năng lực upstream | Vứt ADR-001/005/008/011 + workflow engine; tính bằng quý | Phản đối thẳng |

**Chọn A làm nền + C làm tính năng.**

---

## 6. Giải pháp chốt

Chi tiết kiến trúc, ba giới hạn thiết kế và bảng phase: xem
[ADR-017](../../docs/adr/017-action-registry.md). Tóm tắt:

```
src/lib/actions/
  define.ts     defineAction({ name, object, verb, input, run, effects })
  execute.ts    kernel chạy chuỗi guard/side-effect DUY NHẤT 1 lần
  registry.ts   name → action
  adapters/{rest,graphql,mcp,ai,workflow}.ts
```

**Ba giới hạn chống over-engineering (ràng buộc, đổi thì phải ra ADR mới):**

1. GraphQL **giữ type viết tay**, chỉ trỏ resolver về kernel. Không sinh SDL từ zod.
2. `zod → JSON Schema` **hand-roll ~80 dòng**, không thêm dependency. Schema toàn object phẳng.
3. `effects` là **hàm thuần**, không phải DSL. Cần rẽ nhánh thì viết TypeScript.

**Migration kiểu strangler**, hai đường sống song song, xoá đường cũ sau khi xanh:

| Phase | Scope | Điều kiện thoát |
|---|---|---|
| 0 | Kernel + adapters + `contacts.*` | Test contact REST/GraphQL/MCP pass **không sửa** |
| 1 | `companies.*`, `deals.*` | GraphQL deal mutations ship (đóng lỗ §3.2) |
| 2 | `tasks.*`, `notes.*`, custom records | `src/mcp/tools.ts` còn 0 lệnh `db` trực tiếp |
| 3 | Surface mới: cron action, `run_action` MCP tool | Thêm surface mà không đụng code entity |
| 4 | (C) skills, context-awareness, generative UI | Từng PR độc lập |

---

## 7. Ánh xạ 4 mục tiêu → giải pháp

| Mục tiêu user chọn | Được giải bởi | Đo bằng |
|---|---|---|
| Gỡ trùng lặp 3 API surface | Phase 0–2 | `tools.ts` 0 lệnh `db`; LOC giảm; 1 impl/operation |
| Nâng cấp UX AI agent | Phase 4 (rẻ vì registry cấp tool tự động) | Skills load được; context trang vào prompt; card render |
| Định vị "agent-native" | Claim kiểm chứng được (§8) | Test coverage registry |
| Mở rộng bề mặt tích hợp | Phase 3 | Thêm CLI/cron = 1 adapter, không phải N handler |

---

## 8. Claim marketing (kiểm chứng được, không overclaim)

> *"Mọi năng lực của Fourty đều gọi được từ UI, REST, GraphQL, MCP, agent và
> workflow — từ một định nghĩa duy nhất."*

Kiểm chứng bằng test khẳng định độ phủ registry, đưa vào `CLAIMS.md` theo đúng kỷ luật
"nothing is done until it ships with a passing test". **Không** tuyên bố Fourty là
agent platform / có plugin SDK — ADR-016 vẫn chặn, và chưa có gì để chống lưng.

---

## 9. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Regression khi refactor 58 route | **Cao** | Strangler; luật *test cũ phải pass không sửa*; 206+ unit test + Playwright e2e làm lưới |
| Kernel là single point of failure | Trung bình | Kernel nhỏ, unit test trực tiếp, gần như pure |
| Over-abstraction (đẻ framework trong framework) | **Cao** | 3 giới hạn §6 là ràng buộc; vượt phải ra ADR mới |
| Trôi dạt sang public SDK → đảo ADR-016 | Trung bình | Không document ra ngoài, không load action ngoài repo, không cam kết stability |
| Phá vỡ GraphQL API công khai | Thấp | Giữ nguyên type viết tay, chỉ đổi resolver |
| Phình dependency | Thấp | Hand-roll converter; giữ ~10 runtime deps |

---

## 10. Success metrics

- `src/mcp/tools.ts`: 0 lệnh `db.*` trực tiếp (hiện: nhiều) → guardrail #3 thành cấu trúc
- GraphQL có mutation cho deals/tasks/notes (hiện: không có)
- 1 implementation / operation (hiện: 3)
- Thêm 1 surface mới = 1 file adapter, 0 thay đổi ở entity
- Runtime deps giữ nguyên ~10
- Toàn bộ test hiện có pass **không chỉnh sửa**

---

## 11. Bước tiếp theo

1. Review + accept [ADR-017](../../docs/adr/017-action-registry.md) (đang `Proposed`).
2. `/ck:plan --tdd` cho Phase 0 — refactor hành vi sẵn có, có test coverage mạnh → TDD là đúng chế độ.
3. Phase 0 làm xong mới cam kết Phase 1+.

---

## Câu hỏi chưa giải quyết

1. **`ActionContext` vs `ToolContext`** — đổi tên (churn import toàn repo) hay giữ tên `ToolContext` và chỉ mở rộng? Nghiêng về giữ tên, giảm nhiễu diff.
2. **Custom objects** (`src/lib/custom-objects.ts`) là metadata-driven, action sinh động lúc runtime chứ không khai báo tĩnh. Registry cần hỗ trợ *dynamic action provider* — chưa thiết kế, có thể phá giới hạn "không DSL". Cần chốt ở Phase 2, không phải Phase 0.
3. **Phân trang/filter của REST** (`?q=`, `?sort=`, `?limit=`) hiện parse trong route. Đưa vào `input` schema của action, hay giữ ở adapter REST? Ảnh hưởng chữ ký MCP tool.
4. **`run_workflow` / workflow action** có nên là action trong registry không, hay dễ đệ quy (action gọi workflow gọi action)? Cần giới hạn độ sâu.
5. Phase 4 (skills, generative UI) chưa được thẩm định về ràng buộc "off by default, BYO-key" của ADR-016 — cần brainstorm riêng.

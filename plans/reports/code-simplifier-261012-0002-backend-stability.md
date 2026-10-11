# Simplify gate — backend stability

Status: DONE

Summary: Đã rà soát sáu tệp backend được giao theo plan Phase 1–3. Chỉ chỉnh `src/app/api/search/route.ts` và `src/app/api/export/[entity]/route.ts`: bỏ helper một-lần-dùng, các kiểm tra policy `id` lặp lại sau khi caller đã fail-closed, cùng alias/điều kiện entity thừa. Không đổi API, permission, SQL snapshot, CSV hay schema.

Files edited:

- `src/app/api/search/route.ts`
- `src/app/api/export/[entity]/route.ts`

Files reviewed and left clean:

- `src/lib/csv.ts`
- `src/lib/company-query.ts`
- `src/lib/company-list.ts`
- `src/app/api/companies/route.ts`

Tests:

- `npm test -- tests/csv.test.ts tests/company-query.test.ts` — 22/22 passed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Concerns/Blockers: Không có. Theo constraint, không chạy DB/server hoặc integration/E2E.

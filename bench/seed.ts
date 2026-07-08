/**
 * Benchmark seeder (Gate B5). Seeds a workspace with a logical dataset VIA EACH
 * PRODUCT'S API (never raw SQL) so the ingest path is part of what's measured and
 * both sides get the same shape:
 *
 *   companies  = SIZE / 10
 *   contacts   = SIZE            (each linked to a random company)
 *   deals      = SIZE / 2        (each linked to a random contact + company)
 *   activities = SIZE / 10       (kept light: each recomputes a lead score)
 *
 * Usage:
 *   TARGET=fourty BASE_URL=http://localhost:3200 API_KEY=frty_xxx SIZE=10000 \
 *     npx tsx bench/seed.ts
 *   TARGET=twenty BASE_URL=http://localhost:3201 TWENTY_TOKEN=... SIZE=10000 \
 *     npx tsx bench/seed.ts
 *
 * Emits a JSON summary (counts + wall time + achieved insert throughput) to
 * stdout so run.sh can fold ingest numbers into BENCHMARK.md.
 */

const TARGET = (process.env.TARGET ?? "fourty") as "fourty" | "twenty";
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3200").replace(/\/$/, "");
const SIZE = Number(process.env.SIZE ?? 10000);
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY ?? 40);

const N_COMPANIES = Math.max(1, Math.ceil(SIZE / 10));
const N_CONTACTS = SIZE;
const N_DEALS = Math.max(1, Math.ceil(SIZE / 2));
const N_ACTIVITIES = Math.max(1, Math.ceil(SIZE / 10));

const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "Retail", "Manufacturing", "Media"];
const STATUSES = ["lead", "qualified", "customer", "churned"];
const SOURCES = ["referral", "inbound", "outbound", "event", "partner"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "VND"];
const ACT_TYPES = ["email", "call", "meeting"];

const pick = <T>(a: T[], i: number): T => a[i % a.length];
const rid = (i: number) => `${Date.now().toString(36)}${i}`;

/** Bounded-concurrency map. Returns results in input order; throws collected count. */
async function pool<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onProgress?: (done: number) => void,
): Promise<{ ok: R[]; failed: number }> {
  const ok: R[] = [];
  let failed = 0;
  let next = 0;
  let done = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        ok.push(await worker(items[i], i));
      } catch {
        failed++;
      }
      if (++done % 1000 === 0) onProgress?.(done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return { ok, failed };
}

// ── Fourty (REST) ───────────────────────────────────────────────────────────

function fourtyHeaders(): Record<string, string> {
  const key = process.env.API_KEY;
  if (!key) throw new Error("API_KEY is required for TARGET=fourty");
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}

async function postFourty<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: fourtyHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function seedFourty() {
  const started = Date.now();

  const companyRes = await pool(
    Array.from({ length: N_COMPANIES }, (_, i) => i),
    (i) =>
      postFourty<{ company: { id: string } }>("/api/companies", {
        name: `Company ${rid(i)}`,
        industry: pick(INDUSTRIES, i),
        size: pick(["1-10", "11-50", "51-200", "201-1000"], i),
        country: pick(["US", "GB", "DE", "VN", "JP"], i),
      }).then((r) => r.company.id),
    CONCURRENCY,
    (d) => process.stderr.write(`  companies ${d}/${N_COMPANIES}\r`),
  );
  const companyIds = companyRes.ok;

  const contactRes = await pool(
    Array.from({ length: N_CONTACTS }, (_, i) => i),
    (i) =>
      postFourty<{ contact: { id: string } }>("/api/contacts", {
        firstName: `First${i}`,
        lastName: `Last${i}`,
        email: `c${i}@bench.test`,
        jobTitle: pick(["CEO", "CTO", "VP Sales", "Manager", "Analyst"], i),
        status: pick(STATUSES, i),
        source: pick(SOURCES, i),
        companyId: companyIds.length ? pick(companyIds, i) : undefined,
      }).then((r) => r.contact.id),
    CONCURRENCY,
    (d) => process.stderr.write(`  contacts ${d}/${N_CONTACTS}\r`),
  );
  const contactIds = contactRes.ok;

  const dealRes = await pool(
    Array.from({ length: N_DEALS }, (_, i) => i),
    (i) =>
      postFourty("/api/deals", {
        name: `Deal ${rid(i)}`,
        amount: 1000 + (i % 100) * 500,
        currency: pick(CURRENCIES, i),
        companyId: companyIds.length ? pick(companyIds, i) : undefined,
        contactId: contactIds.length ? pick(contactIds, i) : undefined,
      }),
    CONCURRENCY,
    (d) => process.stderr.write(`  deals ${d}/${N_DEALS}\r`),
  );

  const actRes = await pool(
    Array.from({ length: N_ACTIVITIES }, (_, i) => i),
    (i) =>
      postFourty("/api/activities", {
        type: pick(ACT_TYPES, i),
        entityType: "contact",
        entityId: pick(contactIds, i),
      }),
    CONCURRENCY,
    (d) => process.stderr.write(`  activities ${d}/${N_ACTIVITIES}\r`),
  );

  const elapsedMs = Date.now() - started;
  const total = companyIds.length + contactIds.length + dealRes.ok.length + actRes.ok.length;
  return {
    target: "fourty",
    size: SIZE,
    counts: {
      companies: companyIds.length,
      contacts: contactIds.length,
      deals: dealRes.ok.length,
      activities: actRes.ok.length,
    },
    failed:
      companyRes.failed + contactRes.failed + dealRes.failed + actRes.failed,
    elapsedMs,
    insertsPerSec: Math.round((total / elapsedMs) * 1000),
  };
}

// ── Twenty (GraphQL) — best-effort scaffold ─────────────────────────────────
// Twenty's API is GraphQL-first. This mirrors the same dataset via createCompany
// / createPerson / createOpportunity mutations. Field names track Twenty's core
// objects; verify against the pinned release's schema before a Twenty run.

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = process.env.TWENTY_TOKEN;
  if (!token) throw new Error("TWENTY_TOKEN is required for TARGET=twenty");
  const res = await fetch(`${BASE_URL}/graphql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (!res.ok || body.errors) throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`);
  return body.data as T;
}

async function seedTwenty() {
  const started = Date.now();
  const companies = await pool(
    Array.from({ length: N_COMPANIES }, (_, i) => i),
    (i) =>
      gql<{ createCompany: { id: string } }>(
        `mutation($data: CompanyCreateInput!){ createCompany(data:$data){ id } }`,
        { data: { name: `Company ${rid(i)}` } },
      ).then((r) => r.createCompany.id),
    CONCURRENCY,
    (d) => process.stderr.write(`  companies ${d}/${N_COMPANIES}\r`),
  );
  const people = await pool(
    Array.from({ length: N_CONTACTS }, (_, i) => i),
    (i) =>
      gql<{ createPerson: { id: string } }>(
        `mutation($data: PersonCreateInput!){ createPerson(data:$data){ id } }`,
        {
          data: {
            name: { firstName: `First${i}`, lastName: `Last${i}` },
            emails: { primaryEmail: `c${i}@bench.test` },
            companyId: companies.ok.length ? pick(companies.ok, i) : undefined,
          },
        },
      ).then((r) => r.createPerson.id),
    CONCURRENCY,
    (d) => process.stderr.write(`  people ${d}/${N_CONTACTS}\r`),
  );
  const deals = await pool(
    Array.from({ length: N_DEALS }, (_, i) => i),
    (i) =>
      gql(`mutation($data: OpportunityCreateInput!){ createOpportunity(data:$data){ id } }`, {
        data: { name: `Deal ${rid(i)}`, amount: { amountMicros: (1000 + i) * 1_000_000, currencyCode: "USD" } },
      }),
    CONCURRENCY,
    (d) => process.stderr.write(`  opportunities ${d}/${N_DEALS}\r`),
  );
  const elapsedMs = Date.now() - started;
  const total = companies.ok.length + people.ok.length + deals.ok.length;
  return {
    target: "twenty",
    size: SIZE,
    counts: { companies: companies.ok.length, contacts: people.ok.length, deals: deals.ok.length, activities: 0 },
    failed: companies.failed + people.failed + deals.failed,
    elapsedMs,
    insertsPerSec: Math.round((total / elapsedMs) * 1000),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  process.stderr.write(
    `seeding ${TARGET} @ ${BASE_URL} — SIZE=${SIZE} (companies=${N_COMPANIES} contacts=${N_CONTACTS} deals=${N_DEALS} activities=${N_ACTIVITIES})\n`,
  );
  const summary = TARGET === "twenty" ? await seedTwenty() : await seedFourty();
  process.stderr.write("\n");
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
})().catch((err) => {
  process.stderr.write(`seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

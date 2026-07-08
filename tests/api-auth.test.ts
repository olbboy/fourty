import { beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Authorization enforcement on the public REST surface.
 *
 * Fourty has no multi-tenancy (a single global dataset — see PARITY.md), so the
 * strongest isolation guarantee it CAN make is: the API rejects every request
 * that is not backed by a valid, non-revoked credential. These tests lock that
 * in against regressions — both dynamically (invalid/revoked keys are refused)
 * and statically (no route file may forget to call `authenticate()`).
 */
describe("API-key auth enforcement", () => {
  const GOOD = "frty_valid_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let revokedToken: string;

  const get = (headers: Record<string, string>) =>
    contactRoutes.GET(new Request("http://localhost/api/contacts", { headers }));

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    contactRoutes = await import("@/app/api/contacts/route");

    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "good",
      prefix: "frty_val",
      keyHash: sha256(GOOD),
      createdAt: Date.now(),
    });

    revokedToken = "frty_revoked_key";
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "revoked",
      prefix: "frty_rev",
      keyHash: sha256(revokedToken),
      revokedAt: Date.now(),
      createdAt: Date.now(),
    });
  });

  it("accepts a valid API key", async () => {
    const res = await get({ Authorization: `Bearer ${GOOD}` });
    expect(res.status).toBe(200);
  });

  it("rejects an unknown API key with 401", async () => {
    const res = await get({ Authorization: "Bearer frty_nope" });
    expect(res.status).toBe(401);
  });

  it("rejects a revoked API key with 401", async () => {
    const res = await get({ Authorization: `Bearer ${revokedToken}` });
    expect(res.status).toBe(401);
  });
});

describe("static guard: every API route authenticates", () => {
  // Endpoints that intentionally run without an authenticated session.
  const PUBLIC_ROUTES = new Set([
    "auth/login",
    "auth/logout",
    "auth/setup",
    "health", // liveness probe — pings DB only, exposes no data
    "metrics", // Prometheus scrape — aggregate counters only, no PII (Gate B4)
  ]);

  function routeFiles(dir: string, base = ""): { rel: string; file: string }[] {
    const out: { rel: string; file: string }[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        out.push(...routeFiles(full, base ? `${base}/${entry}` : entry));
      } else if (entry === "route.ts") {
        out.push({ rel: base, file: full });
      }
    }
    return out;
  }

  it("authenticates + workspace-scopes every non-public route", () => {
    const apiDir = path.resolve(__dirname, "../src/app/api");
    const files = routeFiles(apiDir);
    expect(files.length).toBeGreaterThan(15); // sanity: we found the routes

    // A data route must go through withAuth() (which authenticates AND enters the
    // workspace RLS transaction). Bare authenticate()/getSessionUser() is allowed
    // for routes that don't touch tenant data or predate a workspace (accept).
    const missing: string[] = [];
    for (const { rel, file } of files) {
      if (PUBLIC_ROUTES.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (
        !src.includes("withAuth(") &&
        !src.includes("authenticate(") &&
        !src.includes("getSessionUser(")
      )
        missing.push(rel);
    }
    expect(missing, `routes missing auth: ${missing.join(", ")}`).toEqual([]);
  });

  it("every mutating route enforces RBAC via authorize()", () => {
    const apiDir = path.resolve(__dirname, "../src/app/api");
    const files = routeFiles(apiDir);
    // Mutating routes exempt from authorize(): public auth endpoints, invite
    // accept (authorized by the one-time invite token, not a workspace role), and
    // graphql (RBAC enforced per-resolver via can(), the same predicate
    // authorize() wraps — see src/lib/graphql/schema.ts requireRbac).
    const EXEMPT = new Set([
      "auth/login",
      "auth/logout",
      "auth/setup",
      "members/accept",
      "graphql",
      "locale", // UI-preference cookie: no tenant data, no RBAC object (authenticates only)
    ]);
    const missing: string[] = [];
    for (const { rel, file } of files) {
      if (EXEMPT.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      const mutates = /export async function (POST|PATCH|DELETE)\b/.test(src);
      if (mutates && !src.includes("authorize(")) missing.push(rel);
    }
    expect(missing, `mutating routes missing authorize(): ${missing.join(", ")}`).toEqual([]);
  });
});

import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Browser, BrowserContext } from "@playwright/test";
import { hashPassword } from "../../src/lib/auth";
import { ADMIN } from "./auth";

/** Storage state produced by the real login flow for the restricted viewer. */
export const RESTRICTED_STORAGE_STATE = "e2e/.auth/restricted.json";
/** Storage state for a separate viewer whose company id field is hidden. */
export const RESTRICTED_ID_HIDDEN_STORAGE_STATE = "e2e/.auth/restricted-id-hidden.json";
/** Storage state for a viewer whose dedicated workspace has no companies. */
export const RESTRICTED_EMPTY_STORAGE_STATE = "e2e/.auth/restricted-empty.json";

export const RESTRICTED = {
  name: "E2E Restricted Viewer",
  email: "e2e-restricted@fourty.test",
  password: "e2e-restricted-123",
  role: "viewer",
} as const;

export const RESTRICTED_ID_HIDDEN = {
  name: "E2E ID Hidden Viewer",
  email: "e2e-id-hidden@fourty.test",
  password: "e2e-id-hidden-123",
  role: "viewer",
} as const;

export const RESTRICTED_EMPTY = {
  name: "E2E Empty Companies Viewer",
  email: "e2e-empty-companies@fourty.test",
  password: "e2e-empty-companies-123",
  role: "viewer",
} as const;

const DEFAULT_OWNER_DSN = "postgresql://fourty:fourty@localhost:5432/fourty_e2e";
const ID_HIDDEN_WORKSPACE_ID = "e2e-id-hidden-workspace";
const ID_HIDDEN_COMPANY_ID = "e2e-id-hidden-company";
const EMPTY_WORKSPACE_ID = "e2e-empty-companies-workspace";

/**
 * Resolve the owner DSN used only for E2E fixture writes.
 *
 * The check is intentionally based on the parsed database name and never puts
 * the DSN (which may contain a password) in an error or log message. A fixture
 * helper must fail closed rather than risk touching a developer/test database.
 * The repository E2E setup accepts dedicated database names containing `e2e`,
 * which also lets local runs use an isolated suffixed database safely.
 */
function guardedOwnerDsn(): string {
  const dsn = process.env.MIGRATE_DATABASE_URL ?? DEFAULT_OWNER_DSN;
  let database: string;
  try {
    database = decodeURIComponent(new URL(dsn).pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error("Restricted E2E fixture requires a valid MIGRATE_DATABASE_URL for fourty_e2e");
  }
  if (!database.toLowerCase().includes("e2e")) {
    throw new Error(
      "Refusing restricted E2E fixture: MIGRATE_DATABASE_URL must target a dedicated e2e database",
    );
  }
  return dsn;
}

type FixtureIdentity = { workspaceId: string; userId: string };

/**
 * Seed a real viewer, membership, field policy, and deterministic paging rows.
 * The owner connection is used only for setup; the browser later authenticates
 * through the normal sign-in form and receives a real session cookie.
 */
export async function seedRestrictedFixture(): Promise<FixtureIdentity> {
  const pool = new pg.Pool({ connectionString: guardedOwnerDsn() });
  const client = await pool.connect();
  try {
    const admin = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [ADMIN.email],
    );
    const adminId = admin.rows[0]?.id;
    if (!adminId) throw new Error("Restricted E2E fixture requires the admin setup account");

    const membership = await client.query<{ workspace_id: string }>(
      `SELECT workspace_id
         FROM workspace_members
        WHERE user_id = $1
          AND workspace_id <> $2
          AND role = 'admin'
          AND deactivated_at IS NULL
        ORDER BY created_at
        LIMIT 1`,
      [adminId, ID_HIDDEN_WORKSPACE_ID],
    );
    const workspaceId = membership.rows[0]?.workspace_id;
    if (!workspaceId) throw new Error("Restricted E2E fixture requires an admin workspace");

    // FORCE RLS also applies to the owner role on tenant tables. Bind this
    // fixture connection to the discovered workspace before its writes.
    await client.query(`SELECT set_config('app.workspace_id', $1, false)`, [workspaceId]);

    const now = Date.now();
    const user = await client.query<{ id: string }>(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role
       RETURNING id`,
      [randomUUID(), RESTRICTED.email, RESTRICTED.name, hashPassword(RESTRICTED.password), "member", now],
    );
    const userId = user.rows[0]?.id;
    if (!userId) throw new Error("Restricted E2E fixture could not create the viewer");

    // Login activates the first membership returned for the user. Remove stale
    // memberships so rerunning the fixture always selects this restricted workspace.
    await client.query(
      `DELETE FROM workspace_members
        WHERE user_id = $1 AND workspace_id <> $2`,
      [userId, workspaceId],
    );
    await client.query(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, deactivated_at, created_at)
       VALUES ($1, $2, $3, 'viewer', NULL, $4)
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = 'viewer', deactivated_at = NULL`,
      [randomUUID(), workspaceId, userId, now],
    );

    // Keep the id readable so the restricted table can still demonstrate safe
    // row keys/links while hiding the fields that are most likely to become a
    // search, sort, facet, or CSV side channel.
    const hiddenFields: Array<[string, string]> = [
      ["companies", "name"],
      ["companies", "domain"],
      ["companies", "updatedAt"],
      ["companies", "annualRevenue"],
      ["deals", "amount"],
    ];
    for (const [object, field] of hiddenFields) {
      await client.query(
        `INSERT INTO field_permissions
           (id, workspace_id, object, field, role, can_read, can_write, created_at)
         VALUES ($1, $2, $3, $4, 'viewer', 0, 0, $5)
         ON CONFLICT (workspace_id, object, field, role) DO UPDATE
           SET can_read = 0, can_write = 0`,
        [randomUUID(), workspaceId, object, field, now],
      );
    }

    // Six demo companies are enough for ordinary journeys but cannot exercise
    // the server page boundary. These rows are deterministic and scoped to the
    // E2E workspace so page/offset assertions do not depend on seed randomness.
    const existing = await client.query<{ name: string }>(
      `SELECT name
         FROM companies
        WHERE workspace_id = $1 AND name LIKE 'E2E Pagination %'`,
      [workspaceId],
    );
    const existingNames = new Set(existing.rows.map((row) => row.name));
    for (let i = 1; i <= 55; i += 1) {
      const ordinal = String(i).padStart(2, "0");
      const name = `E2E Pagination ${ordinal}`;
      if (existingNames.has(name)) continue;
      const createdAt = now + i;
      await client.query(
        `INSERT INTO companies
           (id, workspace_id, name, domain, industry, size, website, city, country,
            annual_revenue, owner_id, custom, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'E2E', '1-10', $5, 'Test City', 'Test Country', $6, $7, '{}', $8, $8)`,
        [
          randomUUID(),
          workspaceId,
          name,
          `e2e-pagination-${ordinal}.test`,
          `https://e2e-pagination-${ordinal}.test`,
          i + 1,
          adminId,
          createdAt,
        ],
      );
    }

    // A second viewer/workspace isolates the structural id-redaction journey
    // from the primary restricted fixture. The viewer can read company names,
    // but a missing id must remove row selection/preview/detail affordances.
    await client.query(
      `INSERT INTO workspaces (id, name, slug, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
      [ID_HIDDEN_WORKSPACE_ID, "E2E ID Hidden Workspace", "e2e-id-hidden", now],
    );
    await client.query(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, deactivated_at, created_at)
       VALUES ($1, $2, $3, 'admin', NULL, $4)
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = 'admin', deactivated_at = NULL`,
      [randomUUID(), ID_HIDDEN_WORKSPACE_ID, adminId, now],
    );
    const idHiddenUser = await client.query<{ id: string }>(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, 'member', $5)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role
       RETURNING id`,
      [
        randomUUID(),
        RESTRICTED_ID_HIDDEN.email,
        RESTRICTED_ID_HIDDEN.name,
        hashPassword(RESTRICTED_ID_HIDDEN.password),
        now,
      ],
    );
    const idHiddenUserId = idHiddenUser.rows[0]?.id;
    if (!idHiddenUserId) throw new Error("Restricted E2E fixture could not create id-hidden viewer");
    await client.query(
      `DELETE FROM workspace_members
        WHERE user_id = $1 AND workspace_id <> $2`,
      [idHiddenUserId, ID_HIDDEN_WORKSPACE_ID],
    );
    await client.query(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, deactivated_at, created_at)
       VALUES ($1, $2, $3, 'viewer', NULL, $4)
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = 'viewer', deactivated_at = NULL`,
      [randomUUID(), ID_HIDDEN_WORKSPACE_ID, idHiddenUserId, now],
    );
    await client.query(`SELECT set_config('app.workspace_id', $1, false)`, [ID_HIDDEN_WORKSPACE_ID]);
    await client.query(
      `INSERT INTO field_permissions
         (id, workspace_id, object, field, role, can_read, can_write, created_at)
       VALUES ($1, $2, 'companies', 'id', 'viewer', 0, 0, $3)
       ON CONFLICT (workspace_id, object, field, role) DO UPDATE
         SET can_read = 0, can_write = 0`,
      [randomUUID(), ID_HIDDEN_WORKSPACE_ID, now],
    );
    await client.query(
      `INSERT INTO companies
         (id, workspace_id, name, domain, industry, size, website, city, country,
          annual_revenue, owner_id, custom, created_at, updated_at)
       VALUES ($1, $2, 'E2E ID Hidden Company', 'id-hidden.test', 'E2E', '1-10',
               'https://id-hidden.test', 'Test City', 'Test Country', 7000, $3, '{}', $4, $4)
       ON CONFLICT (id) DO UPDATE
         SET workspace_id = EXCLUDED.workspace_id,
             name = EXCLUDED.name,
             domain = EXCLUDED.domain,
             industry = EXCLUDED.industry,
             size = EXCLUDED.size,
             website = EXCLUDED.website,
             city = EXCLUDED.city,
             country = EXCLUDED.country,
             annual_revenue = EXCLUDED.annual_revenue,
             owner_id = EXCLUDED.owner_id,
             custom = EXCLUDED.custom,
             updated_at = EXCLUDED.updated_at`,
      [ID_HIDDEN_COMPANY_ID, ID_HIDDEN_WORKSPACE_ID, adminId, now],
    );

    // A dedicated membership keeps the no-data browser journey independent of
    // the seeded admin workspace. Remove stale memberships for this fixture
    // user so the normal login flow always activates the empty workspace.
    await client.query(
      `INSERT INTO workspaces (id, name, slug, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
      [EMPTY_WORKSPACE_ID, "E2E Empty Companies Workspace", "e2e-empty-companies", now],
    );
    const emptyUser = await client.query<{ id: string }>(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, 'member', $5)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name,
             password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role
       RETURNING id`,
      [
        randomUUID(),
        RESTRICTED_EMPTY.email,
        RESTRICTED_EMPTY.name,
        hashPassword(RESTRICTED_EMPTY.password),
        now,
      ],
    );
    const emptyUserId = emptyUser.rows[0]?.id;
    if (!emptyUserId) throw new Error("Restricted E2E fixture could not create empty-workspace viewer");
    await client.query(
      `DELETE FROM workspace_members
        WHERE user_id = $1 AND workspace_id <> $2`,
      [emptyUserId, EMPTY_WORKSPACE_ID],
    );
    await client.query(
      `INSERT INTO workspace_members (id, workspace_id, user_id, role, deactivated_at, created_at)
       VALUES ($1, $2, $3, 'viewer', NULL, $4)
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = 'viewer', deactivated_at = NULL`,
      [randomUUID(), EMPTY_WORKSPACE_ID, emptyUserId, now],
    );
    await client.query(`SELECT set_config('app.workspace_id', $1, false)`, [EMPTY_WORKSPACE_ID]);
    await client.query(`DELETE FROM companies WHERE workspace_id = $1`, [EMPTY_WORKSPACE_ID]);

    return { workspaceId, userId };
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Log in through the application UI and persist a restricted storage state.
 * No cookie is manufactured or copied from the admin context.
 */
async function loginBrowser(
  browser: Browser,
  baseURL: string,
  credentials: { email: string; password: string },
  storageState: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(credentials.email);
  await page.locator('input[name="password"]').fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await context.storageState({ path: storageState });
  return context;
}

export function loginRestrictedBrowser(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return loginBrowser(browser, baseURL, RESTRICTED, RESTRICTED_STORAGE_STATE);
}

export function loginIdHiddenBrowser(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return loginBrowser(browser, baseURL, RESTRICTED_ID_HIDDEN, RESTRICTED_ID_HIDDEN_STORAGE_STATE);
}

export function loginEmptyCompaniesBrowser(browser: Browser, baseURL: string): Promise<BrowserContext> {
  return loginBrowser(browser, baseURL, RESTRICTED_EMPTY, RESTRICTED_EMPTY_STORAGE_STATE);
}

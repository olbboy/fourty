import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Search policy integration coverage. The handler runs inside withAuth, so each
 * request exercises the real field-policy query and Postgres RLS transaction.
 */
describe("search field policy (real handler + Postgres + RLS)", () => {
  const KEY = {
    admin: "frty_search_admin",
    member: "frty_search_member",
    viewer: "frty_search_viewer",
  };
  const KEY_B = "frty_search_workspace_b";

  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let searchRoute: typeof import("@/app/api/search/route");
  let wsA: string;
  let wsB: string;

  const req = (token: string, query: string) =>
    new Request(`http://localhost/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    });

  async function seedKey(workspaceId: string, token: string, role: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId,
      name: role,
      prefix: token.slice(0, 8),
      keyHash: sha256(token),
      role,
      createdAt: Date.now(),
    });
  }

  async function setViewerRules(
    rules: Array<{ object: "contacts" | "companies" | "deals"; field: string }>,
  ) {
    await withWorkspace(wsA, async () => {
      await db.delete(tables.fieldPermissions).where(eq(tables.fieldPermissions.role, "viewer"));
      if (rules.length === 0) return;
      await db.insert(tables.fieldPermissions).values(
        rules.map(({ object, field }) => ({
          id: newId(),
          object,
          field,
          role: "viewer",
          canRead: 0,
          canWrite: 0,
          createdAt: Date.now(),
        })),
      );
    });
  }

  async function search(token: string, query: string) {
    const response = await searchRoute.GET(req(token, query));
    expect(response.status).toBe(200);
    return (await response.json()).results as Array<{
      type: "contact" | "company" | "deal";
      id: string;
      title: string;
      subtitle: string | null;
    }>;
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    searchRoute = await import("@/app/api/search/route");

    wsA = await createWorkspace({ id: "search-ws-a" });
    wsB = await createWorkspace({ id: "search-ws-b" });
    await seedKey(wsA, KEY.admin, "admin");
    await seedKey(wsA, KEY.member, "member");
    await seedKey(wsA, KEY.viewer, "viewer");
    await seedKey(wsB, KEY_B, "admin");

    await withWorkspace(wsA, async () => {
      await db.insert(tables.contacts).values({
        id: "search-contact-a",
        firstName: "Visible",
        lastName: "Person",
        email: "visible@example.test",
        jobTitle: "Visible Job",
        createdAt: 1000,
        updatedAt: 1000,
      });
      await db.insert(tables.companies).values({
        id: "search-company-a",
        name: "Visible Company",
        domain: "visible.example",
        industry: "SaaS",
        custom: "{}",
        createdAt: 1000,
        updatedAt: 1000,
      });
      await db.insert(tables.pipelines).values({
        id: "search-pipeline-a",
        name: "Search pipeline",
        isDefault: 1,
        createdAt: 1000,
      });
      await db.insert(tables.stages).values({
        id: "search-stage-a",
        pipelineId: "search-pipeline-a",
        name: "Qualified",
        order: 1,
      });
      await db.insert(tables.deals).values({
        id: "search-deal-a",
        name: "Quarterly Opportunity",
        amount: 123456,
        currency: "USD",
        pipelineId: "search-pipeline-a",
        stageId: "search-stage-a",
        stageEnteredAt: 1000,
        custom: "{}",
        createdAt: 1000,
        updatedAt: 1000,
      });
    });

    await withWorkspace(wsB, async () => {
      await db.insert(tables.companies).values({
        id: "search-company-b",
        name: "Cross Workspace Secret",
        domain: "secret-b.example",
        industry: "Private",
        custom: "{}",
        createdAt: 1000,
        updatedAt: 1000,
      });
    });
  });

  beforeEach(async () => {
    await setViewerRules([]);
  });

  it("keeps visible controls for member and viewer roles", async () => {
    const member = await search(KEY.member, "Visible Company");
    const viewer = await search(KEY.viewer, "Visible Company");
    expect(member).toContainEqual({
      type: "company",
      id: "search-company-a",
      title: "Visible Company",
      subtitle: "visible.example",
    });
    expect(viewer).toContainEqual(member[0]);
  });

  it("does not use hidden company name/domain as search targets", async () => {
    const admin = await search(KEY.admin, "Visible Company");
    await setViewerRules([
      { object: "companies", field: "name" },
      { object: "companies", field: "domain" },
    ]);
    const viewer = await search(KEY.viewer, "Visible Company");

    expect(admin).toContainEqual(expect.objectContaining({ id: "search-company-a" }));
    expect(viewer.some((result) => result.id === "search-company-a")).toBe(false);

    // A readable search target may still match a row whose title is hidden; the
    // result must be dropped instead of returning an empty title.
    await setViewerRules([{ object: "companies", field: "name" }]);
    const hiddenTitle = await search(KEY.viewer, "visible.example");
    expect(hiddenTitle.some((result) => result.id === "search-company-a")).toBe(false);
  });

  it("only searches readable contact name parts and falls back to job title", async () => {
    await setViewerRules([
      { object: "contacts", field: "lastName" },
      { object: "contacts", field: "email" },
    ]);

    const visiblePart = await search(KEY.viewer, "Visible");
    const hiddenComposite = await search(KEY.viewer, "Visible Person");
    expect(visiblePart).toContainEqual({
      type: "contact",
      id: "search-contact-a",
      title: "Visible",
      subtitle: "Visible Job",
    });
    expect(hiddenComposite.some((result) => result.id === "search-contact-a")).toBe(false);
  });

  it("only exposes company industry when domain is hidden", async () => {
    await setViewerRules([{ object: "companies", field: "domain" }]);
    const viewer = await search(KEY.viewer, "Visible Company");
    expect(viewer).toContainEqual({
      type: "company",
      id: "search-company-a",
      title: "Visible Company",
      subtitle: "SaaS",
    });
  });

  it("omits the deal amount subtitle unless amount and currency are both readable", async () => {
    const admin = await search(KEY.admin, "Quarterly Opportunity");
    await setViewerRules([{ object: "deals", field: "amount" }]);
    const viewer = await search(KEY.viewer, "Quarterly Opportunity");

    expect(admin).toContainEqual({
      type: "deal",
      id: "search-deal-a",
      title: "Quarterly Opportunity",
      subtitle: "USD 123,456",
    });
    expect(viewer).toContainEqual({
      type: "deal",
      id: "search-deal-a",
      title: "Quarterly Opportunity",
      subtitle: null,
    });
  });

  it("fails closed when an entity has no searchable fields or no readable id", async () => {
    await setViewerRules([
      { object: "contacts", field: "firstName" },
      { object: "contacts", field: "lastName" },
      { object: "contacts", field: "email" },
      { object: "companies", field: "name" },
      { object: "companies", field: "domain" },
      { object: "deals", field: "name" },
    ]);
    expect(await search(KEY.viewer, "Visible")).toEqual([]);

    await setViewerRules([{ object: "companies", field: "id" }]);
    const hiddenId = await search(KEY.viewer, "Visible Company");
    expect(hiddenId.some((result) => result.id === "search-company-a")).toBe(false);
  });

  it("keeps search scoped to the API key workspace", async () => {
    const asA = await search(KEY.admin, "Cross Workspace Secret");
    const asB = await search(KEY_B, "Cross Workspace Secret");
    expect(asA).toEqual([]);
    expect(asB).toContainEqual(expect.objectContaining({ id: "search-company-b" }));
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import path from "node:path";
import { printSchema } from "graphql";
import { resetDb, createWorkspace } from "./pg-setup";
import { handleMcpRequest } from "@/mcp/server";
import { TOOLS } from "@/mcp/tools";
import { fourtySchema } from "@/lib/graphql/schema";
import type { ToolContext } from "@/mcp/tools";

/**
 * Contact operations are defined once and served by REST, GraphQL and MCP.
 * These are the properties that stopped being obvious once the three surfaces
 * stopped having their own copy of the code: that the schema they publish did
 * not shift, that each surface still keeps its own published limits, and that a
 * caller without a user account still gets an unowned record.
 */
describe("contact actions across every surface", () => {
  const TOKEN = "frty_action_contacts_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let gql: typeof import("@/app/api/graphql/route");
  let ws: string;
  let mcpCtx: ToolContext;

  const headers = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

  async function runGql(query: string, variables?: Record<string, unknown>) {
    const res = await gql.POST(
      new Request("http://localhost/api/graphql", { method: "POST", headers, body: JSON.stringify({ query, variables }) }),
    );
    const body = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
    if (body.errors) throw new Error(body.errors[0].message);
    return body.data!;
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    const res = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, mcpCtx);
    const result = res!.result as { content: { text: string }[]; isError?: boolean };
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    const { sha256 } = await import("@/lib/auth");
    contactRoutes = await import("@/app/api/contacts/route");
    gql = await import("@/app/api/graphql/route");

    ws = await createWorkspace();
    mcpCtx = { workspaceId: ws, role: "admin", userId: null };
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      role: "admin",
      createdAt: Date.now(),
    });
  });

  const ownerOf = (id: string) =>
    withWorkspace(ws, async () => (await db.select().from(tables.contacts).where(eq(tables.contacts.id, id)))[0]?.ownerId);

  // ── the published schema did not move ─────────────────────────────────────

  it("publishes the same GraphQL schema as before the resolvers were rewired", () => {
    // Frozen from the commit before contact operations moved behind the shared
    // definitions. The resolvers changed; the contract they serve must not.
    const frozen = readFileSync(path.resolve(__dirname, "fixtures/graphql-schema.graphql"), "utf8");
    expect(printSchema(fourtySchema())).toBe(frozen);
  });

  it("keeps the contact tools' published arguments", () => {
    const list = TOOLS.find((t) => t.name === "list_contacts")!.inputSchema as {
      properties: Record<string, Record<string, unknown>>;
    };
    // The tool has always called its filter `query`, defaulted to 50 and capped
    // at 200 — none of which the shared definition uses.
    expect(Object.keys(list.properties)).toContain("query");
    expect(Object.keys(list.properties)).not.toContain("q");
    expect(list.properties.limit).toMatchObject({ default: 50, maximum: 200 });
  });

  // ── ownership ─────────────────────────────────────────────────────────────

  it("leaves a contact unowned when the caller is an API key, on every surface", async () => {
    // An API key acts for a workspace, not a person, so there is no owner to
    // record. Each surface reached that conclusion by its own route before.
    const rest = await contactRoutes.POST(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers,
        body: JSON.stringify({ firstName: "Rest", lastName: "Key" }),
      }),
    );
    const restId = (await rest.json()).contact.id as string;

    const graphql = (await runGql(`mutation($i: JSON!) { createContact(input: $i) { id } }`, {
      i: { firstName: "Graph", lastName: "Key" },
    })) as { createContact: { id: string } };

    const mcp = await callTool("create_contact", { firstName: "Mcp", lastName: "Key" });

    expect(await ownerOf(restId)).toBeNull();
    expect(await ownerOf(graphql.createContact.id)).toBeNull();
    expect(await ownerOf(mcp.id as string)).toBeNull();
  });

  // ── search terms are not length-limited ───────────────────────────────────

  it("accepts a search term longer than any contact name, on every surface", async () => {
    // A long term simply matches nothing. Rejecting it would turn a fruitless
    // search into an error, which none of these endpoints ever did.
    const term = "z".repeat(500);

    const rest = await contactRoutes.GET(
      new Request(`http://localhost/api/contacts?q=${term}`, { headers }),
    );
    expect(rest.status).toBe(200);
    expect((await rest.json()).contacts).toEqual([]);

    const graphql = (await runGql(`query($q: String) { contacts(q: $q) { id } }`, { q: term })) as {
      contacts: unknown[];
    };
    expect(graphql.contacts).toEqual([]);

    expect(await callTool("list_contacts", { query: term })).toEqual([]);
  });

  it("finds a contact by job title from every surface", async () => {
    // The REST list has always matched job title; GraphQL and MCP matched only
    // name and email, so the same search found different people depending on
    // which API asked. All three now match the same three fields.
    await callTool("create_contact", { firstName: "Grace", lastName: "Hopper", jobTitle: "Rear Admiral" });

    const rest = await contactRoutes.GET(new Request("http://localhost/api/contacts?q=Admiral", { headers }));
    expect((await rest.json()).contacts.map((c: { lastName: string }) => c.lastName)).toContain("Hopper");

    const graphql = (await runGql(`query($q: String) { contacts(q: $q) { lastName } }`, { q: "Admiral" })) as {
      contacts: { lastName: string }[];
    };
    expect(graphql.contacts.map((c) => c.lastName)).toContain("Hopper");

    const mcp = (await callTool("list_contacts", { query: "Admiral" })) as { lastName: string }[];
    expect(mcp.map((c) => c.lastName)).toContain("Hopper");
  });

  // ── each surface keeps its own ceiling ────────────────────────────────────

  it("holds an MCP contact list to 200 rows however many are asked for", async () => {
    const now = Date.now();
    await withWorkspace(ws, () =>
      db.insert(tables.contacts).values(
        Array.from({ length: 205 }, (_, i) => ({
          id: newId(),
          firstName: `Bulk${i}`,
          lastName: "Contact",
          createdAt: now,
          updatedAt: now,
        })),
      ),
    );

    expect((await callTool("list_contacts", { limit: 300 })).length).toBe(200);
    // The REST list keeps its own, larger ceiling, so the same request there
    // returns everything there is rather than stopping at 200.
    const rest = await contactRoutes.GET(new Request("http://localhost/api/contacts?limit=300", { headers }));
    expect((await rest.json()).contacts.length).toBeGreaterThan(200);
  });
});

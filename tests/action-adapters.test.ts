import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GraphQLError } from "graphql";
import { z } from "zod";
import { resetDb, createWorkspace } from "./pg-setup";
import { defineAction } from "@/lib/actions/define";
import { register, actionsFor, getAction } from "@/lib/actions/registry";
import { toRouteHandler } from "@/lib/actions/adapters/rest";
import { toResolver } from "@/lib/actions/adapters/graphql";
import { toMcpTool } from "@/lib/actions/adapters/mcp";
import { toProviderTool } from "@/lib/actions/adapters/ai";
import { ActionError } from "@/lib/actions/types";

/**
 * Adapters translate and nothing else. Each one takes the same action and the
 * same failure and expresses it in its own surface's idiom — that mapping is
 * the whole of their job, so it is the whole of what these tests check.
 */
describe("action adapters", () => {
  const TOKEN = "frty_action_adapter_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let ws: string;

  const failing = (kind: ActionError["kind"], message: string) =>
    defineAction({
      name: `test.fail.${kind}`,
      object: "contacts",
      verb: "read",
      description: "always fails",
      input: z.object({}),
      expose: { rest: true, graphql: true, mcp: true },
      run: async () => {
        throw new ActionError(kind, message);
      },
    });

  const echo = defineAction({
    name: "test.echo",
    object: "contacts",
    verb: "read",
    description: "echoes its input",
    input: z.object({ q: z.string().optional(), limit: z.coerce.number().optional() }),
    expose: { rest: true, graphql: true, mcp: true },
    run: async (input) => ({ id: "e1", ...input }),
  });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    ws = await createWorkspace();
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

  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, {
      headers: { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      ...init,
    });

  // ── REST ──────────────────────────────────────────────────────────────────

  it.each([
    ["forbidden", 403],
    ["invalid", 400],
    ["not_found", 404],
  ] as const)("maps a %s failure to HTTP %i", async (kind, status) => {
    const res = await toRouteHandler(failing(kind, "nope"))(req("/api/x"));
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: "nope" });
  });

  it("reads query parameters as input on a GET", async () => {
    const res = await toRouteHandler(echo)(req("/api/x?q=ada&limit=5"));
    expect(await res.json()).toMatchObject({ q: "ada", limit: 5 });
  });

  it("reads the JSON body as input on a write", async () => {
    const create = defineAction({ ...echo, name: "test.echo.post", verb: "create" });
    const res = await toRouteHandler(create, { status: 201, body: (out) => ({ thing: out }) })(
      req("/api/x", { method: "POST", body: JSON.stringify({ q: "ada" }) }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ thing: { id: "e1", q: "ada" } });
  });

  it("merges route parameters into the input", async () => {
    const byId = defineAction({
      name: "test.echo.byid",
      object: "contacts",
      verb: "read",
      description: "echoes the route parameter",
      input: z.object({ id: z.string() }),
      expose: { rest: true },
      run: async (input) => ({ seen: input.id }),
    });
    const res = await toRouteHandler(byId)(req("/api/x/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(await res.json()).toEqual({ seen: "abc" });
  });

  it("ignores query parameters on a DELETE", async () => {
    // A DELETE is addressed by its path alone. Reading the query string would
    // start rejecting stray parameters that used to be harmlessly ignored.
    const del = defineAction({
      name: "test.echo.del",
      object: "contacts",
      verb: "delete",
      description: "echoes what it received",
      input: z.object({ id: z.string(), confirm: z.boolean().optional().default(true) }),
      expose: { rest: true },
      run: async (input) => ({ id: input.id, confirm: input.confirm }),
    });
    const res = await toRouteHandler(del)(req("/api/x/abc?confirm=false", { method: "DELETE" }), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "abc", confirm: true });
  });

  it("answers a malformed body with a 400 rather than throwing", async () => {
    const create = defineAction({ ...echo, name: "test.echo.badjson", verb: "create" });
    const res = await toRouteHandler(create)(req("/api/x", { method: "POST", body: "{not json" }));
    expect(res.status).toBe(400);
  });

  // ── GraphQL ───────────────────────────────────────────────────────────────

  const gqlCtx = { auth: { workspaceId: "", role: "admin", user: null } };

  it.each([
    ["forbidden", "FORBIDDEN"],
    ["invalid", "BAD_USER_INPUT"],
    ["not_found", "NOT_FOUND"],
  ] as const)("maps a %s failure to the %s error code", async (kind, code) => {
    const { withWorkspace } = await import("@/db");
    const resolve = toResolver(failing(kind, "nope"));
    const err = await withWorkspace(ws, () =>
      resolve(null, {}, { auth: { ...gqlCtx.auth, workspaceId: ws } }),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect((err as GraphQLError).extensions.code).toBe(code);
  });

  it("lets a resolver answer not-found its own way instead of erroring", async () => {
    const { withWorkspace } = await import("@/db");
    const resolve = toResolver(failing("not_found", "gone"), { onNotFound: () => false });
    const out = await withWorkspace(ws, () => resolve(null, {}, { auth: { ...gqlCtx.auth, workspaceId: ws } }));
    expect(out).toBe(false);
  });

  it("flattens the input argument object into the action input", async () => {
    const { withWorkspace } = await import("@/db");
    const resolve = toResolver(echo);
    const out = await withWorkspace(ws, () =>
      resolve(null, { id: "x", input: { q: "ada" } }, { auth: { ...gqlCtx.auth, workspaceId: ws } }),
    );
    expect(out).toMatchObject({ q: "ada" });
  });

  // ── MCP + AI ──────────────────────────────────────────────────────────────

  it("generates the tool schema from the action's own input schema", () => {
    const tool = toMcpTool(echo);
    expect(tool.name).toBe("test_echo");
    expect(tool.description).toBe("echoes its input");
    expect(tool.inputSchema).toMatchObject({ type: "object" });
  });

  it("marks writes as mutating and reads as not", () => {
    expect(toMcpTool(echo).mutates).toBe(false);
    expect(toMcpTool(defineAction({ ...echo, name: "test.w", verb: "create" })).mutates).toBe(true);
  });

  it("runs the action through the kernel when the tool is called", async () => {
    const { withWorkspace } = await import("@/db");
    const tool = toMcpTool(echo);
    const out = await withWorkspace(ws, () => tool.handler({ q: "ada" }, { workspaceId: ws, role: "admin", userId: null }));
    expect(out).toMatchObject({ q: "ada" });
  });

  it("describes an action to the AI provider without leaking the mutates flag", () => {
    const providerTool = toProviderTool(echo) as { type: string; function: Record<string, unknown> };
    expect(providerTool.type).toBe("function");
    expect(providerTool.function.name).toBe("test_echo");
    expect(providerTool.function).not.toHaveProperty("mutates");
  });

  // ── registry ──────────────────────────────────────────────────────────────

  it("registers actions by name and refuses a duplicate", () => {
    const a = defineAction({ ...echo, name: "test.registry.one" });
    register(a);
    expect(getAction("test.registry.one")).toBe(a);
    expect(() => register(defineAction({ ...echo, name: "test.registry.one" }))).toThrow(/already registered/);
  });

  it("lists the actions a surface is expected to serve", () => {
    register(defineAction({ ...echo, name: "test.registry.mcponly", expose: { mcp: true } }));
    expect(actionsFor("mcp").map((a) => a.name)).toContain("test.registry.mcponly");
    expect(actionsFor("rest").map((a) => a.name)).not.toContain("test.registry.mcponly");
  });

  // ── isolation ─────────────────────────────────────────────────────────────

  it("keeps surface concerns out of the kernel", () => {
    // The kernel must stay usable from any surface; an import of one surface's
    // framework here would be the first step back to per-surface logic.
    const kernel = ["types", "define", "execute", "registry", "json-schema", "schemas"];
    for (const file of kernel) {
      const source = readFileSync(`src/lib/actions/${file}.ts`, "utf8");
      expect(source, `${file}.ts imports next/server`).not.toMatch(/from "next\//);
      expect(source, `${file}.ts imports graphql`).not.toMatch(/from "graphql"/);
      expect(source, `${file}.ts imports the MCP layer`).not.toMatch(/from "@\/mcp\//);
      expect(source, `${file}.ts imports the AI layer`).not.toMatch(/from "@\/lib\/ai\//);
    }
  });
});

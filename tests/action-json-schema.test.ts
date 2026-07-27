import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as validators from "@/lib/validators";
import * as actionSchemas from "@/lib/actions/schemas";
import { toJsonSchema } from "@/lib/actions/json-schema";
import { TOOLS } from "@/mcp/tools";

/**
 * The converter turns the zod schemas that already validate every write into
 * the JSON Schema that MCP clients read. Those clients depend on the current
 * hand-written `inputSchema` blocks in src/mcp/tools.ts, so those are the
 * ground truth for compatibility: a field required today stays required, and an
 * enum keeps exactly its current values.
 *
 * The generated schemas are allowed to be *wider* — the hand-written ones omit
 * several fields zod already accepts (see the documented list below). Widening
 * keeps every call that works today working. Narrowing would not, and is
 * asserted against.
 */
describe("zod → JSON Schema", () => {
  const SCHEMAS: [string, z.ZodTypeAny][] = Object.entries(validators)
    .filter(([, v]) => v instanceof z.ZodType)
    .map(([name, v]) => [name, v as z.ZodTypeAny]);

  it("covers every schema in validators.ts", () => {
    // Guards the sweep below: if validators.ts is emptied or renamed, the
    // per-schema test would vacuously pass.
    expect(SCHEMAS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(SCHEMAS)("converts %s without falling outside the supported subset", (_name, schema) => {
    const out = toJsonSchema(schema) as Record<string, unknown>;
    expect(out.type).toBe("object");
    expect(out.properties).toBeTypeOf("object");
  });

  // ── field constraints ─────────────────────────────────────────────────────

  it("carries string length bounds across", () => {
    const out = toJsonSchema(validators.contactInput) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.firstName).toMatchObject({ type: "string", minLength: 1, maxLength: 120 });
  });

  it("expresses .length() as an exact bound", () => {
    const out = toJsonSchema(validators.dealInput) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.currency).toMatchObject({ type: "string", minLength: 3, maxLength: 3 });
  });

  it("marks an email string with its format", () => {
    const out = toJsonSchema(validators.contactInput) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.email).toMatchObject({ format: "email" });
  });

  it("carries number bounds across", () => {
    const out = toJsonSchema(validators.dealInput) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.amount).toMatchObject({ type: "number", minimum: 0 });
  });

  it("keeps a nullable field usable as its base type", () => {
    const out = toJsonSchema(validators.contactInput) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.phone.type).toEqual(["string", "null"]);
  });

  it("treats a record as a free-form object", () => {
    const out = toJsonSchema(validators.contactInput) as { properties: Record<string, Record<string, unknown>> };
    expect(out.properties.custom).toMatchObject({ type: "object", additionalProperties: true });
  });

  // ── required ──────────────────────────────────────────────────────────────

  it("requires only the fields with neither a default nor .optional()", () => {
    expect((toJsonSchema(validators.contactInput) as { required: string[] }).required).toEqual(["firstName"]);
    expect((toJsonSchema(validators.companyInput) as { required: string[] }).required).toEqual(["name"]);
    expect((toJsonSchema(validators.noteInput) as { required: string[] }).required.sort()).toEqual([
      "body",
      "entityId",
      "entityType",
    ]);
  });

  it("requires nothing after .partial()", () => {
    expect((toJsonSchema(validators.contactPatch) as { required?: string[] }).required ?? []).toEqual([]);
  });

  it("carries fields added by .extend() through", () => {
    const out = toJsonSchema(validators.taskPatch) as {
      required?: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(out.properties.completed).toMatchObject({ type: "boolean" });
    expect(out.properties.title).toBeDefined();
    expect(out.required ?? []).toEqual([]);
  });

  // ── compatibility with what MCP clients already see ───────────────────────

  /** Hand-written MCP tool schema → the zod schema that action would use. */
  const PAIRS: { tool: string; schema: z.ZodTypeAny; addsId?: boolean }[] = [
    { tool: "create_contact", schema: validators.contactInput },
    { tool: "create_company", schema: validators.companyInput },
    { tool: "create_task", schema: validators.taskInput },
    { tool: "create_note", schema: validators.noteInput },
    { tool: "update_contact", schema: validators.contactPatch, addsId: true },
    { tool: "update_company", schema: validators.companyPatch, addsId: true },
  ];

  it.each(PAIRS)("keeps $tool's required fields required", ({ tool, schema, addsId }) => {
    const hand = TOOLS.find((t) => t.name === tool)!.inputSchema as { required?: string[] };
    const generated = toJsonSchema(schema) as { required?: string[] };
    // `id` is an argument of the operation, not a field of the record; the
    // action schemas add it separately (src/lib/actions/schemas.ts).
    const expected = (hand.required ?? []).filter((f) => !(addsId && f === "id"));
    for (const field of expected) {
      expect(generated.required ?? []).toContain(field);
    }
  });

  it.each(PAIRS)("keeps $tool's enum values identical", ({ tool, schema }) => {
    const hand = TOOLS.find((t) => t.name === tool)!.inputSchema as {
      properties?: Record<string, { enum?: string[] }>;
    };
    const generated = toJsonSchema(schema) as { properties: Record<string, { enum?: string[] }> };
    for (const [field, spec] of Object.entries(hand.properties ?? {})) {
      if (!spec.enum) continue;
      expect(generated.properties[field]?.enum).toEqual(spec.enum);
    }
  });

  it("only ever widens the accepted input, never narrows it", () => {
    // Every property a client can send today must still be described.
    for (const { tool, schema, addsId } of PAIRS) {
      const hand = TOOLS.find((t) => t.name === tool)!.inputSchema as { properties?: Record<string, unknown> };
      const generated = toJsonSchema(schema) as { properties: Record<string, unknown> };
      for (const field of Object.keys(hand.properties ?? {})) {
        if (addsId && field === "id") continue;
        expect(Object.keys(generated.properties)).toContain(field);
      }
    }
  });

  it("exposes fields zod already accepted but the hand-written schema omitted", () => {
    // Deliberate widening, recorded so it is a decision rather than a surprise:
    // these are accepted by contactInput today but absent from create_contact's
    // advertised schema, so agents never knew they could send them.
    const generated = toJsonSchema(validators.contactInput) as { properties: Record<string, unknown> };
    const hand = TOOLS.find((t) => t.name === "create_contact")!.inputSchema as { properties: Record<string, unknown> };
    const added = Object.keys(generated.properties).filter((f) => !(f in hand.properties));
    expect(added.sort()).toEqual(["city", "country", "custom", "linkedin", "source"]);
  });

  // ── the operation schemas the kernel owns ─────────────────────────────────

  it("converts the list/get/delete schemas too", () => {
    const list = toJsonSchema(actionSchemas.listContactsInput) as {
      required?: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    // Everything about a list is optional — it has usable defaults.
    expect(list.required ?? []).toEqual([]);
    expect(list.properties.limit).toMatchObject({ type: "number", minimum: 1, maximum: 500 });
    expect(list.properties.status).toMatchObject({ enum: ["lead", "qualified", "customer", "churned"] });

    const byId = toJsonSchema(actionSchemas.byIdInput) as { required: string[] };
    expect(byId.required).toEqual(["id"]);

    const del = toJsonSchema(actionSchemas.deleteInput) as {
      required: string[];
      properties: Record<string, Record<string, unknown>>;
    };
    expect(del.required).toEqual(["id"]);
    expect(del.properties.confirm).toMatchObject({ type: "boolean" });
  });

  it("keeps list filters usable as query strings", () => {
    // Query parameters arrive as text; the schema has to accept "5" for limit.
    expect(actionSchemas.listContactsInput.parse({ limit: "5" }).limit).toBe(5);
    expect(actionSchemas.listContactsInput.parse({}).limit).toBe(200);
  });

  // ── the subset is a fence, not a suggestion ───────────────────────────────

  it("refuses a construct outside the supported subset instead of guessing", () => {
    expect(() => toJsonSchema(z.object({ when: z.date() }))).toThrow(/ZodDate/);
    expect(() => toJsonSchema(z.object({ either: z.union([z.string(), z.number()]) }))).toThrow(/ZodUnion/);
  });

  it("refuses a non-object schema at the top level", () => {
    expect(() => toJsonSchema(z.string())).toThrow(/object/i);
  });
});

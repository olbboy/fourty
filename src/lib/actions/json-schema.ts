import { z } from "zod";

/**
 * Convert a zod object schema to the JSON Schema an MCP client reads, so the
 * schema that validates a write and the schema that describes it can never
 * disagree.
 *
 * Only the constructs `src/lib/validators.ts` actually uses are supported.
 * Anything else throws at build time rather than emitting a schema that quietly
 * describes the wrong contract — a wrong schema misleads every agent that reads
 * it, which is worse than a loud failure here.
 *
 * Hand-rolled on purpose: a conversion library would be a runtime dependency
 * for ~80 lines of work (ADR-016).
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const object = unwrap(schema).node;
  if (!(object instanceof z.ZodObject)) {
    throw new Error(`toJsonSchema: expected an object schema, got ${typeName(object)}`);
  }
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, field] of Object.entries(object.shape as Record<string, z.ZodTypeAny>)) {
    const { node, nullable, optional } = unwrap(field);
    properties[key] = describe(node, nullable);
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required };
}

/** Peel `.optional()`, `.nullable()` and `.default()` off a field. */
function unwrap(schema: z.ZodTypeAny): { node: z.ZodTypeAny; nullable: boolean; optional: boolean } {
  let node = schema;
  let nullable = false;
  let optional = false;
  for (;;) {
    if (node instanceof z.ZodOptional) {
      optional = true;
      node = node._def.innerType;
    } else if (node instanceof z.ZodDefault) {
      // A default means the caller may leave it out.
      optional = true;
      node = node._def.innerType;
    } else if (node instanceof z.ZodNullable) {
      nullable = true;
      node = node._def.innerType;
    } else if (node instanceof z.ZodCatch) {
      // A fallback value means an unusable input is ignored, not refused — the
      // field is still described by whatever it wraps.
      node = node._def.innerType;
    } else {
      return { node, nullable, optional };
    }
  }
}

function describe(node: z.ZodTypeAny, nullable: boolean): Record<string, unknown> {
  const withNull = (type: string) => (nullable ? { type: [type, "null"] } : { type });

  if (node instanceof z.ZodString) {
    const out: Record<string, unknown> = withNull("string");
    for (const check of node._def.checks ?? []) {
      if (check.kind === "min") out.minLength = check.value;
      else if (check.kind === "max") out.maxLength = check.value;
      else if (check.kind === "length") {
        out.minLength = check.value;
        out.maxLength = check.value;
      } else if (check.kind === "email") out.format = "email";
      // An agent reading `format: "uri"` sends a URL; zod is still what refuses
      // one that is not.
      else if (check.kind === "url") out.format = "uri";
      else throw new Error(`toJsonSchema: unsupported string check "${check.kind}"`);
    }
    return out;
  }

  if (node instanceof z.ZodNumber) {
    const out: Record<string, unknown> = withNull("number");
    for (const check of node._def.checks ?? []) {
      if (check.kind === "min") out.minimum = check.value;
      else if (check.kind === "max") out.maximum = check.value;
      else throw new Error(`toJsonSchema: unsupported number check "${check.kind}"`);
    }
    return out;
  }

  if (node instanceof z.ZodBoolean) return withNull("boolean");

  if (node instanceof z.ZodEnum) {
    return { ...withNull("string"), enum: [...(node._def.values as string[])] };
  }

  if (node instanceof z.ZodRecord) {
    return { ...withNull("object"), additionalProperties: true };
  }

  if (node instanceof z.ZodObject) {
    return nullable ? { ...toJsonSchema(node), type: ["object", "null"] } : toJsonSchema(node);
  }

  // Arrays arrived with the evidence ledger: an observation list is the one
  // input shape that genuinely cannot be flattened, since each entry carries its
  // own kind and its own rationale.
  if (node instanceof z.ZodArray) {
    const inner = unwrap(node._def.type as z.ZodTypeAny);
    const out: Record<string, unknown> = { ...withNull("array"), items: describe(inner.node, inner.nullable) };
    if (node._def.minLength) out.minItems = node._def.minLength.value;
    if (node._def.maxLength) out.maxItems = node._def.maxLength.value;
    return out;
  }

  throw new Error(`toJsonSchema: unsupported schema ${typeName(node)}`);
}

const typeName = (node: z.ZodTypeAny): string => (node?._def?.typeName as string) ?? "unknown";

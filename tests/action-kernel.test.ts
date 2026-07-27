import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { resetDb, createWorkspace } from "./pg-setup";
import { defineAction } from "@/lib/actions/define";
import { execute } from "@/lib/actions/execute";
import { ActionError } from "@/lib/actions/types";
import type { ActionContext } from "@/lib/actions/types";

/**
 * The action kernel runs the guard + side-effect chain exactly once, in a fixed
 * order, for every surface. These tests drive it with throwaway actions rather
 * than real CRM operations: the point is the chain itself, not any one entity.
 *
 * Effect order is asserted by having each effect factory record when it was
 * called — the kernel invokes them one at a time, in order, so the recorded
 * sequence is the real execution order and needs no hook in production code.
 */
describe("action kernel", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let ws: string;
  let admin: ActionContext;
  let member: ActionContext;
  let viewer: ActionContext;

  /** Records what the kernel did, in the order it did it. */
  let calls: string[];
  const note = (what: string) => {
    calls.push(what);
  };

  /**
   * The id `createThing` writes, fresh per test. The database is not truncated
   * between tests, so a shared id would let a row written by an earlier test
   * satisfy a later test's assertion.
   */
  let rowId: string;
  let rowCounter = 0;

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    ws = await createWorkspace();
    admin = { workspaceId: ws, role: "admin", userId: null };
    member = { workspaceId: ws, role: "member", userId: null };
    viewer = { workspaceId: ws, role: "viewer", userId: null };

    // `member` may neither read nor write contacts.email.
    await withWorkspace(ws, () =>
      db.insert(tables.fieldPermissions).values({
        id: newId(),
        object: "contacts",
        field: "email",
        role: "member",
        canRead: 0,
        canWrite: 0,
        createdAt: Date.now(),
      }),
    );
  });

  beforeEach(() => {
    calls = [];
    rowId = `row-${++rowCounter}`;
  });

  // A create action with every effect wired, each one recording its turn.
  const createThing = defineAction({
    name: "test.create",
    object: "contacts",
    verb: "create",
    description: "test create",
    input: z.object({ firstName: z.string().min(1), email: z.string().optional() }),
    expose: { rest: true },
    run: async (input) => {
      note("run");
      return { id: rowId, firstName: input.firstName, email: input.email ?? "hidden@example.com" };
    },
    effects: {
      activity: (_i, out) => {
        note("activity");
        return { type: "created", entityType: "contact", entityId: out.id };
      },
      audit: (_i, out, ctx) => {
        note("audit");
        return {
          key: "contact.created",
          objectType: "contact",
          objectId: out.id,
          meta: { via: ctx.via ?? "test", fields: ["firstName"] },
        };
      },
      rescore: async () => {
        note("rescore");
      },
      events: (_i, out) => {
        note("events");
        return [{ event: "contact.created", entityType: "contact", entityId: out.id, snapshot: { ok: true } }];
      },
    },
  });

  const run = <T>(fn: () => Promise<T>) => withWorkspace(ws, fn);

  // ── guards run before anything else ───────────────────────────────────────

  it("refuses the role before validating input or running the action", async () => {
    // The input is also invalid — RBAC must win, proving it ran first.
    await expect(run(() => execute(createThing, { firstName: "" }, viewer))).rejects.toThrow(ActionError);
    expect(calls).toEqual([]);
  });

  it("reports an RBAC refusal as forbidden", async () => {
    const err = await run(() => execute(createThing, { firstName: "Ada" }, viewer)).catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect((err as ActionError).kind).toBe("forbidden");
  });

  it("refuses a write to a field the role may not write, before running", async () => {
    const err = await run(() => execute(createThing, { firstName: "Ada", email: "a@b.co" }, member)).catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect((err as ActionError).kind).toBe("forbidden");
    expect(calls).toEqual([]);
  });

  it("lets a role filter a read by a field it may not write", async () => {
    // `member` cannot write contacts.email, but filtering a list by email is a
    // read — refusing it would confuse "may not edit" with "may not search".
    const search = defineAction({
      name: "test.search",
      object: "contacts",
      verb: "read",
      description: "test search",
      input: z.object({ email: z.string().optional() }),
      expose: { rest: true },
      run: async (input) => ({ id: "s1", matched: input.email ?? null }),
    });
    const out = (await run(() => execute(search, { email: "ada@example.com" }, member))) as Record<string, unknown>;
    expect(out.matched).toBe("ada@example.com");
  });

  it("rejects invalid input without running the action", async () => {
    const err = await run(() => execute(createThing, { firstName: "" }, admin)).catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect((err as ActionError).kind).toBe("invalid");
    expect(calls).toEqual([]);
  });

  // ── the effect chain ──────────────────────────────────────────────────────

  it("runs the effects in a fixed order after the action", async () => {
    await run(() => execute(createThing, { firstName: "Ada" }, admin));
    expect(calls).toEqual(["run", "activity", "audit", "rescore", "events"]);
  });

  it("passes the audit meta through to the audit log", async () => {
    await run(() => execute(createThing, { firstName: "Ada" }, admin));
    const entry = await run(async () =>
      (await db.select().from(tables.auditLog).where(eq(tables.auditLog.objectId, rowId)))[0],
    );
    expect(entry).toBeDefined();
    expect(entry!.action).toBe("contact.created");
    expect(JSON.parse(entry!.meta)).toEqual({ via: "test", fields: ["firstName"] });
  });

  it("carries ctx.via into the effects", async () => {
    await run(() => execute(createThing, { firstName: "Ada" }, { ...admin, via: "ai" }));
    const metas = await run(async () =>
      (await db.select().from(tables.auditLog).where(eq(tables.auditLog.objectId, rowId))).map((a) => JSON.parse(a.meta).via),
    );
    expect(metas).toContain("ai");
  });

  it("writes the activity entry the effect declared", async () => {
    await run(() => execute(createThing, { firstName: "Ada" }, admin));
    const rows = await run(() => db.select().from(tables.activities).where(eq(tables.activities.entityId, rowId)));
    expect(rows.map((r) => r.type)).toContain("created");
  });

  it("skips an effect that returns null", async () => {
    const quiet = defineAction({
      ...createThing,
      name: "test.quiet",
      run: async (input) => ({ id: "quiet-1", firstName: input.firstName, email: "x@example.com" }),
      effects: { activity: () => null, audit: () => null, events: () => [] },
    });
    await run(() => execute(quiet, { firstName: "Ada" }, admin));
    const activities = await run(() => db.select().from(tables.activities).where(eq(tables.activities.entityId, "quiet-1")));
    const audits = await run(() => db.select().from(tables.auditLog).where(eq(tables.auditLog.objectId, "quiet-1")));
    expect(activities).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("dispatches nothing when the events effect returns an empty list", async () => {
    const quiet = defineAction({
      ...createThing,
      name: "test.no-events",
      run: async (input) => ({ id: "silent-1", firstName: input.firstName, email: "x@example.com" }),
      effects: { events: () => [] },
    });
    await withWorkspace(ws, () =>
      db.insert(tables.workflows).values({
        id: `wf-${newId()}`,
        name: "probe",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "log", message: "fired" }]),
        createdAt: Date.now(),
      }),
    );
    await run(() => execute(quiet, { firstName: "Ada" }, admin));
    const runs = await run(() => db.select().from(tables.workflowRuns).where(eq(tables.workflowRuns.entityId, "silent-1")));
    expect(runs).toHaveLength(0);
  });

  it("dispatches every event the effect returned", async () => {
    await withWorkspace(ws, () =>
      db.insert(tables.workflows).values({
        id: `wf-${newId()}`,
        name: "probe",
        enabled: 1,
        trigger: JSON.stringify({ event: "contact.created" }),
        conditions: "[]",
        actions: JSON.stringify([{ type: "log", message: "fired" }]),
        createdAt: Date.now(),
      }),
    );
    await run(() => execute(createThing, { firstName: "Ada" }, admin));
    const runs = await run(() => db.select().from(tables.workflowRuns).where(eq(tables.workflowRuns.entityId, rowId)));
    expect(runs.length).toBeGreaterThan(0);
  });

  it("runs no effect when the action throws", async () => {
    const boom = defineAction({
      ...createThing,
      name: "test.boom",
      run: async () => {
        note("run");
        throw new Error("nope");
      },
    });
    await expect(run(() => execute(boom, { firstName: "Ada" }, admin))).rejects.toThrow("nope");
    expect(calls).toEqual(["run"]);
  });

  // ── state from before the mutation ────────────────────────────────────────

  it("lets effects use the pre-mutation state the action returned", async () => {
    const updateThing = defineAction({
      name: "test.update",
      object: "contacts",
      verb: "update",
      description: "test update",
      input: z.object({ id: z.string(), jobTitle: z.string().optional() }),
      expose: { rest: true },
      // `run` loads the previous state itself and hands it to the effects
      // alongside the caller-facing payload.
      run: async (input) => ({
        payload: { id: input.id, jobTitle: input.jobTitle ?? null },
        existing: { id: input.id, jobTitle: "Engineer" },
        changedFields: input.jobTitle === "Engineer" ? [] : ["jobTitle"],
      }),
      effects: {
        activity: (_i, out) =>
          out.changedFields.length === 0
            ? null
            : { type: "updated", entityType: "contact", entityId: out.payload.id, meta: { fields: out.changedFields } },
        audit: (_i, out) => ({
          key: "contact.updated",
          objectType: "contact",
          objectId: out.payload.id,
          meta: { fields: out.changedFields, was: out.existing.jobTitle },
        }),
      },
    });

    await run(() => execute(updateThing, { id: "upd-1", jobTitle: "Analyst" }, admin));
    const changed = await run(async () => ({
      activity: (await db.select().from(tables.activities).where(eq(tables.activities.entityId, "upd-1")))[0],
      audit: (await db.select().from(tables.auditLog).where(eq(tables.auditLog.objectId, "upd-1")))[0],
    }));
    expect(JSON.parse(changed.activity!.meta).fields).toEqual(["jobTitle"]);
    expect(JSON.parse(changed.audit!.meta)).toEqual({ fields: ["jobTitle"], was: "Engineer" });

    // An update that changes nothing writes no activity — same rule as REST.
    await run(() => execute(updateThing, { id: "upd-2", jobTitle: "Engineer" }, admin));
    const none = await run(() => db.select().from(tables.activities).where(eq(tables.activities.entityId, "upd-2")));
    expect(none).toHaveLength(0);
  });

  it("returns the payload, not the state the effects needed", async () => {
    const wrapped = defineAction({
      name: "test.payload",
      object: "contacts",
      verb: "update",
      description: "test payload",
      input: z.object({ id: z.string() }),
      expose: { rest: true },
      run: async (input) => ({ payload: { id: input.id, firstName: "Ada" }, existing: { secret: true } }),
    });
    const out = await run(() => execute(wrapped, { id: "p1" }, admin));
    expect(out).toEqual({ id: "p1", firstName: "Ada" });
  });

  // ── redaction ─────────────────────────────────────────────────────────────

  it("strips fields the role may not read from a single row", async () => {
    const readThing = defineAction({
      name: "test.read",
      object: "contacts",
      verb: "read",
      description: "test read",
      input: z.object({}),
      expose: { rest: true },
      run: async () => ({ id: "r1", firstName: "Ada", email: "ada@example.com" }),
    });
    const asMember = (await run(() => execute(readThing, {}, member))) as Record<string, unknown>;
    expect(asMember.email).toBeUndefined();
    expect(asMember.firstName).toBe("Ada");

    const asAdmin = (await run(() => execute(readThing, {}, admin))) as Record<string, unknown>;
    expect(asAdmin.email).toBe("ada@example.com");
  });

  it("strips unreadable fields from every row of a list", async () => {
    const listThing = defineAction({
      name: "test.list",
      object: "contacts",
      verb: "read",
      description: "test list",
      input: z.object({}),
      expose: { rest: true },
      run: async () => [
        { id: "r1", firstName: "Ada", email: "ada@example.com" },
        { id: "r2", firstName: "Grace", email: "grace@example.com" },
      ],
    });
    const rows = (await run(() => execute(listThing, {}, member))) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.email === undefined)).toBe(true);
    expect(rows.map((r) => r.firstName)).toEqual(["Ada", "Grace"]);
  });

  it("tolerates an action that returns nothing to redact", async () => {
    const del = defineAction({
      name: "test.delete",
      object: "contacts",
      verb: "delete",
      description: "test delete",
      input: z.object({ id: z.string() }),
      expose: { rest: true },
      run: async () => true,
    });
    expect(await run(() => execute(del, { id: "x" }, admin))).toBe(true);
  });

  // ── not-found ─────────────────────────────────────────────────────────────

  it("surfaces a not-found raised by the action as its own kind", async () => {
    const missing = defineAction({
      name: "test.missing",
      object: "contacts",
      verb: "read",
      description: "test missing",
      input: z.object({ id: z.string() }),
      expose: { rest: true },
      run: async () => {
        throw new ActionError("not_found", "Contact not found");
      },
    });
    const err = await run(() => execute(missing, { id: "nope" }, admin)).catch((e) => e);
    expect(err).toBeInstanceOf(ActionError);
    expect((err as ActionError).kind).toBe("not_found");
  });
});

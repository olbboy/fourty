import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Changing a custom-object field definition must not strand existing records in
 * an invalid state. Writes are validated one at a time, so a field retyped from
 * `text` to `url` would otherwise leave a `javascript:` value (or any non-URL)
 * sitting in the record until its next edit — the exact gap the record page's
 * render-time scheme check guards against on the read side. Here we prove the
 * write side refuses the change instead, through the real route handlers on real
 * Postgres + RLS.
 */
describe("custom-object field retype revalidation (real handlers + Postgres)", () => {
  const TOKEN = "frty_retype_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let objRoutes: typeof import("@/app/api/custom-objects/route");
  let fieldRoutes: typeof import("@/app/api/custom-objects/[id]/fields/route");
  let fieldIdRoutes: typeof import("@/app/api/custom-objects/[id]/fields/[fieldId]/route");
  let recRoutes: typeof import("@/app/api/objects/[object]/route");
  let recIdRoutes: typeof import("@/app/api/objects/[object]/[id]/route");
  let objectId: string;
  let linkFieldId: string;

  const hdr = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: hdr, ...init });
  const idParams = (id: string, fieldId: string) => ({ params: Promise.resolve({ id, fieldId }) });
  const objParams = (object: string, id = "") => ({ params: Promise.resolve({ object, id }) });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    objRoutes = await import("@/app/api/custom-objects/route");
    fieldRoutes = await import("@/app/api/custom-objects/[id]/fields/route");
    fieldIdRoutes = await import("@/app/api/custom-objects/[id]/fields/[fieldId]/route");
    recRoutes = await import("@/app/api/objects/[object]/route");
    recIdRoutes = await import("@/app/api/objects/[object]/[id]/route");

    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      createdAt: Date.now(),
    });

    // An object with one text field, plus a record holding a non-URL value.
    const created = await objRoutes.POST(
      req("/api/custom-objects", {
        method: "POST",
        body: JSON.stringify({ apiName: "ticket", nameSingular: "Ticket", namePlural: "Tickets" }),
      }),
    );
    objectId = (await created.json()).object.id;

    const field = await fieldRoutes.POST(
      req(`/api/custom-objects/${objectId}/fields`, {
        method: "POST",
        body: JSON.stringify({ key: "link", label: "Link", type: "text" }),
      }),
      idParams(objectId, ""),
    );
    linkFieldId = (await field.json()).field.id;

    const rec = await recRoutes.POST(
      req("/api/objects/ticket", {
        method: "POST",
        body: JSON.stringify({ data: { link: "javascript:alert(1)" } }),
      }),
      objParams("ticket"),
    );
    expect(rec.status).toBe(201); // a text field accepts any string
  });

  it("refuses retyping a field to url when a stored value is not a valid URL", async () => {
    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-objects/${objectId}/fields/${linkFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "url" }),
      }),
      idParams(objectId, linkFieldId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/existing record would be invalid/i);

    // The field type is unchanged — the refusal did not half-apply.
    const list = await fieldRoutes.GET(
      req(`/api/custom-objects/${objectId}/fields`),
      idParams(objectId, ""),
    );
    const link = (await list.json()).fields.find((f: { key: string }) => f.key === "link");
    expect(link.type).toBe("text");
  });

  it("allows the retype once every record holds a valid URL", async () => {
    // Fix the offending record first.
    const recs = await recRoutes.GET(req("/api/objects/ticket"), objParams("ticket"));
    const recordId = (await recs.json()).records[0].id;
    const fix = await recIdRoutes.PATCH(
      req(`/api/objects/ticket/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ data: { link: "https://example.com" } }),
      }),
      objParams("ticket", recordId),
    );
    expect(fix.status).toBe(200);

    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-objects/${objectId}/fields/${linkFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "url" }),
      }),
      idParams(objectId, linkFieldId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses making a field required while a record leaves it blank", async () => {
    // Add a second field that the existing record does not populate.
    const field = await fieldRoutes.POST(
      req(`/api/custom-objects/${objectId}/fields`, {
        method: "POST",
        body: JSON.stringify({ key: "owner", label: "Owner", type: "text" }),
      }),
      idParams(objectId, ""),
    );
    const ownerFieldId = (await field.json()).field.id;

    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-objects/${objectId}/fields/${ownerFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ required: true }),
      }),
      idParams(objectId, ownerFieldId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("still allows a harmless change (relabel) with records present", async () => {
    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-objects/${objectId}/fields/${linkFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ label: "Website" }),
      }),
      idParams(objectId, linkFieldId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses creating a required field while a record would be blank", async () => {
    const res = await fieldRoutes.POST(
      req(`/api/custom-objects/${objectId}/fields`, {
        method: "POST",
        body: JSON.stringify({ key: "nickname", label: "Nickname", type: "text", required: true }),
      }),
      idParams(objectId, ""),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("still creates an optional field while records are present", async () => {
    const res = await fieldRoutes.POST(
      req(`/api/custom-objects/${objectId}/fields`, {
        method: "POST",
        body: JSON.stringify({ key: "nickname", label: "Nickname", type: "text", required: false }),
      }),
      idParams(objectId, ""),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).field.required).toBe(false);
  });
});

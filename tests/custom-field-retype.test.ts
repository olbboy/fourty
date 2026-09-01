import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Changing a built-in custom-field definition must not strand existing
 * contact/company/deal `custom` blobs in an invalid state. Same contract as
 * no-code object field retype: a text field holding `javascript:` cannot be
 * silently retyped to `url`.
 */
describe("custom-field retype revalidation (real handlers + Postgres)", () => {
  const TOKEN = "frty_cf_retype_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let fieldRoutes: typeof import("@/app/api/custom-fields/route");
  let fieldIdRoutes: typeof import("@/app/api/custom-fields/[id]/route");
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let contactIdRoutes: typeof import("@/app/api/contacts/[id]/route");
  let websiteFieldId: string;
  let contactId: string;

  const hdr = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const req = (url: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: hdr, ...init });
  const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables } = await import("@/db"));
    const { sha256 } = await import("@/lib/auth");
    const { newId } = await import("@/lib/id");
    fieldRoutes = await import("@/app/api/custom-fields/route");
    fieldIdRoutes = await import("@/app/api/custom-fields/[id]/route");
    contactRoutes = await import("@/app/api/contacts/route");
    contactIdRoutes = await import("@/app/api/contacts/[id]/route");

    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "test",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      role: "admin",
      createdAt: Date.now(),
    });

    const field = await fieldRoutes.POST(
      req("/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({ entity: "contact", key: "website", label: "Website", type: "text" }),
      }),
    );
    expect(field.status).toBe(201);
    websiteFieldId = (await field.json()).field.id;

    const created = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Ada", custom: { website: "javascript:alert(1)" } }),
      }),
    );
    expect(created.status).toBe(201);
    contactId = (await created.json()).contact.id;
  });

  it("refuses retyping a field to url when a stored value is not a valid URL", async () => {
    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-fields/${websiteFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "url" }),
      }),
      idParams(websiteFieldId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/existing record would be invalid/i);

    const list = await fieldRoutes.GET(req("/api/custom-fields?entity=contact"));
    const website = (await list.json()).fields.find((f: { key: string }) => f.key === "website");
    expect(website.type).toBe("text");
  });

  it("allows the retype once every record holds a valid URL", async () => {
    const fix = await contactIdRoutes.PATCH(
      req(`/api/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify({ custom: { website: "https://example.com" } }),
      }),
      idParams(contactId),
    );
    expect(fix.status).toBe(200);

    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-fields/${websiteFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ type: "url" }),
      }),
      idParams(websiteFieldId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses making a field required while a record leaves it blank", async () => {
    const field = await fieldRoutes.POST(
      req("/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({ entity: "contact", key: "tier", label: "Tier", type: "text" }),
      }),
    );
    const tierId = (await field.json()).field.id;

    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-fields/${tierId}`, {
        method: "PATCH",
        body: JSON.stringify({ required: true }),
      }),
      idParams(tierId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("still allows a harmless change (relabel) with records present", async () => {
    const res = await fieldIdRoutes.PATCH(
      req(`/api/custom-fields/${websiteFieldId}`, {
        method: "PATCH",
        body: JSON.stringify({ label: "Site" }),
      }),
      idParams(websiteFieldId),
    );
    expect(res.status).toBe(200);
  });

  it("refuses creating a required field while a record would be blank", async () => {
    const res = await fieldRoutes.POST(
      req("/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({
          entity: "contact",
          key: "nickname",
          label: "Nickname",
          type: "text",
          required: true,
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("still creates an optional field while records are present", async () => {
    const res = await fieldRoutes.POST(
      req("/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({
          entity: "contact",
          key: "nickname",
          label: "Nickname",
          type: "text",
          required: false,
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).field.required).toBe(0);
  });
});

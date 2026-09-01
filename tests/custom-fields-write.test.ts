import { beforeAll, describe, expect, it } from "vitest";
import { applyCustomFieldValues } from "@/lib/records";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * Custom fields on contacts/companies/deals are documented as validated on
 * write. Until now the `custom` blob was stored as arbitrary JSON — a `url`
 * field accepted `javascript:`. These checks go through the real handlers on
 * real Postgres, matching custom-object record validation.
 */
describe("applyCustomFieldValues (pure)", () => {
  const website = { key: "website", label: "Website", type: "url" as const, options: [], required: false };

  it("rejects a javascript: value on a url field", () => {
    const result = applyCustomFieldValues([website], { website: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/http\(s\) URL/i);
  });

  it("keeps leftover keys from a deleted field", () => {
    const result = applyCustomFieldValues([website], {
      website: "https://example.com",
      leftover: "stay",
    });
    expect(result).toEqual({
      ok: true,
      data: { leftover: "stay", website: "https://example.com" },
    });
  });

  it("passes the blob through when there are no defs", () => {
    expect(applyCustomFieldValues([], { leftover: 1 })).toEqual({ ok: true, data: { leftover: 1 } });
  });
});

describe("custom fields validated on write (real handlers + Postgres)", () => {
  const TOKEN = "frty_custom_fields_write_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let fieldRoutes: typeof import("@/app/api/custom-fields/route");
  let fieldIdRoutes: typeof import("@/app/api/custom-fields/[id]/route");
  let contactRoutes: typeof import("@/app/api/contacts/route");
  let contactIdRoutes: typeof import("@/app/api/contacts/[id]/route");
  let companyRoutes: typeof import("@/app/api/companies/route");
  let websiteFieldId: string;

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
    companyRoutes = await import("@/app/api/companies/route");

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
        body: JSON.stringify({ entity: "contact", key: "website", label: "Website", type: "url" }),
      }),
    );
    expect(field.status).toBe(201);
    websiteFieldId = (await field.json()).field.id;
  });

  it("refuses creating a contact with a javascript: custom url", async () => {
    const res = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ada",
          custom: { website: "javascript:alert(1)" },
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/http\(s\) URL/i);
  });

  it("stores a valid url and keeps leftover keys from a deleted field", async () => {
    const created = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Grace",
          custom: { website: "https://example.com", leftover: "stay" },
        }),
      }),
    );
    expect(created.status).toBe(201);
    const contact = (await created.json()).contact;
    expect(contact.custom).toEqual({ leftover: "stay", website: "https://example.com" });

    const patch = await contactIdRoutes.PATCH(
      req(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ custom: { website: "https://fourty.dev" } }),
      }),
      idParams(contact.id),
    );
    expect(patch.status).toBe(200);
    expect((await patch.json()).contact.custom).toEqual({ leftover: "stay", website: "https://fourty.dev" });
  });

  it("refuses a bad url on update without mutating the stored blob", async () => {
    const created = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Edsger", custom: { website: "https://example.com" } }),
      }),
    );
    const id = (await created.json()).contact.id as string;

    const bad = await contactIdRoutes.PATCH(
      req(`/api/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ custom: { website: "javascript:alert(1)" } }),
      }),
      idParams(id),
    );
    expect(bad.status).toBe(400);

    const got = await contactIdRoutes.GET(req(`/api/contacts/${id}`), idParams(id));
    expect((await got.json()).contact.custom.website).toBe("https://example.com");
  });

  it("validates company custom fields on create too", async () => {
    const field = await fieldRoutes.POST(
      req("/api/custom-fields", {
        method: "POST",
        body: JSON.stringify({ entity: "company", key: "site", label: "Site", type: "url" }),
      }),
    );
    expect(field.status).toBe(201);

    const bad = await companyRoutes.POST(
      req("/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", custom: { site: "javascript:alert(1)" } }),
      }),
    );
    expect(bad.status).toBe(400);

    const good = await companyRoutes.POST(
      req("/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", custom: { site: "https://acme.example" } }),
      }),
    );
    expect(good.status).toBe(201);
    expect((await good.json()).company.custom.site).toBe("https://acme.example");
  });

  it("still deletes a field definition without wiping leftover values", async () => {
    const del = await fieldIdRoutes.DELETE(
      req(`/api/custom-fields/${websiteFieldId}`, { method: "DELETE" }),
      idParams(websiteFieldId),
    );
    expect(del.status).toBe(200);

    const created = await contactRoutes.POST(
      req("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ firstName: "Alan", custom: { website: "https://example.com" } }),
      }),
    );
    expect(created.status).toBe(201);
    expect((await created.json()).contact.custom.website).toBe("https://example.com");
  });
});

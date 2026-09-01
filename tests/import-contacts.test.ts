import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";

/**
 * CSV contact import: email match updates the existing row (the documented
 * dedupe), missing names are skipped, a new email creates, and a `company`
 * column auto-links — matching the name the contacts export writes so a
 * round-trip does not drop the association.
 */
describe("CSV contact import", () => {
  const TOKEN = "frty_import_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let importRoute: typeof import("@/app/api/import/contacts/route");
  let contactIdRoute: typeof import("@/app/api/contacts/[id]/route");
  let contactsList: typeof import("@/app/api/contacts/route");
  let exportRoute: typeof import("@/app/api/export/[entity]/route");
  let customFields: typeof import("@/app/api/custom-fields/route");
  let contactId: string;

  const hdr = { Authorization: `Bearer ${TOKEN}`, "content-type": "text/csv" };
  const req = (body: string) =>
    new Request("http://localhost/api/import/contacts", { method: "POST", headers: hdr, body });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    importRoute = await import("@/app/api/import/contacts/route");
    contactIdRoute = await import("@/app/api/contacts/[id]/route");
    contactsList = await import("@/app/api/contacts/route");
    exportRoute = await import("@/app/api/export/[entity]/route");
    customFields = await import("@/app/api/custom-fields/route");
    const ws = await createWorkspace();
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "t",
      prefix: TOKEN.slice(0, 8),
      keyHash: sha256(TOKEN),
      createdAt: Date.now(),
    });
    contactId = newId();
    await withWorkspace(ws, () =>
      db.insert(tables.contacts).values({
        id: contactId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        jobTitle: "Analyst",
        status: "lead",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
  });

  it("updates an existing contact when the email matches, case-insensitively", async () => {
    const csv = "first,last,email,title,status\nAda,Lovelace,ADA@example.com,Countess,qualified\n";
    const res = await importRoute.POST(req(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(0);

    const got = await contactIdRoute.GET(
      new Request(`http://localhost/api/contacts/${contactId}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { params: Promise.resolve({ id: contactId }) },
    );
    const contact = (await got.json()).contact;
    expect(contact.jobTitle).toBe("Countess");
    expect(contact.status).toBe("qualified");
    expect(contact.firstName).toBe("Ada");
  });

  it("creates a row for a new email and skips a nameless row", async () => {
    const csv = "first,last,email,title\n,Ghost,new@example.com,Nope\nGrace,Hopper,grace@example.com,Admiral\n";
    const res = await importRoute.POST(req(csv));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("auto-links a company by name and round-trips that name on export", async () => {
    const csv = "name,email,company\nAlan Turing,alan@example.com,Bletchley Park\n";
    const created = await importRoute.POST(req(csv));
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.created).toBe(1);
    expect(createdBody.companiesCreated).toBe(1);

    const again = await importRoute.POST(req(csv));
    expect(again.status).toBe(200);
    const againBody = await again.json();
    expect(againBody.created).toBe(0);
    expect(againBody.updated).toBe(1);
    expect(againBody.companiesCreated).toBe(0);

    const exported = await exportRoute.GET(
      new Request("http://localhost/api/export/contacts", {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { params: Promise.resolve({ entity: "contacts" }) },
    );
    expect(exported.status).toBe(200);
    const text = await exported.text();
    const header = text.split(/\r?\n/)[0] ?? "";
    expect(header.split(",")).toContain("company");
    expect(text).toMatch(/Bletchley Park/);

    const listed = await contactsList.GET(
      new Request("http://localhost/api/contacts", { headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
    const alan = ((await listed.json()).contacts as { email: string; companyId: string | null }[]).find(
      (c) => c.email === "alan@example.com",
    );
    expect(alan?.companyId).toBeTruthy();
  });

  it("round-trips a custom field column and ignores an invalid url cell", async () => {
    const jsonHdr = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
    const tier = await customFields.POST(
      new Request("http://localhost/api/custom-fields", {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ entity: "contact", key: "tier", label: "Account Tier", type: "text" }),
      }),
    );
    expect(tier.status).toBe(201);
    const website = await customFields.POST(
      new Request("http://localhost/api/custom-fields", {
        method: "POST",
        headers: jsonHdr,
        body: JSON.stringify({ entity: "contact", key: "website", label: "Website", type: "url" }),
      }),
    );
    expect(website.status).toBe(201);

    const created = await importRoute.POST(
      req("first,last,email,tier,website\nMargaret,Hamilton,margaret@example.com,apollo,javascript:alert(1)\n"),
    );
    expect(created.status).toBe(200);
    expect((await created.json()).created).toBe(1);

    const listed = await contactsList.GET(
      new Request("http://localhost/api/contacts", { headers: { Authorization: `Bearer ${TOKEN}` } }),
    );
    const margaret = (
      (await listed.json()).contacts as { email: string; custom: Record<string, unknown> }[]
    ).find((c) => c.email === "margaret@example.com");
    expect(margaret?.custom.tier).toBe("apollo");
    expect(margaret?.custom.website).toBeUndefined();

    const relabelled = await importRoute.POST(
      req("first,last,email,Account Tier\nMargaret,Hamilton,margaret@example.com,lead-engineer\n"),
    );
    expect(relabelled.status).toBe(200);
    expect((await relabelled.json()).updated).toBe(1);

    const exported = await exportRoute.GET(
      new Request("http://localhost/api/export/contacts", {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
      { params: Promise.resolve({ entity: "contacts" }) },
    );
    const text = await exported.text();
    expect(text.split(/\r?\n/)[0]?.split(",")).toContain("tier");
    expect(text).toMatch(/lead-engineer/);
    expect(text).not.toMatch(/javascript:/);
  });
});

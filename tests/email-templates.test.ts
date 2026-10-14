import { beforeAll, describe, expect, it } from "vitest";
import { resetDb, createWorkspace } from "./pg-setup";
import { renderTemplate } from "@/lib/email-template";

/**
 * Phase 24 (D15): Email templates. Blanks are filled from the contact, the
 * company, the deal and the sender; the member still edits before sending.
 */
describe("email templates", () => {
  it("fills the blanks it knows, empties the ones without a value, and leaves the rest as typed", () => {
    const text = "Chào {{contact.firstName}}, về {{ deal.name }} của {{company.name}}. {{sender.name}} {{deal.amount}}";
    expect(renderTemplate(text, { "contact.firstName": "Lan", "deal.name": "Pin kho lạnh", "company.name": "", "sender.name": "DVHai" })).toBe(
      "Chào Lan, về Pin kho lạnh của . DVHai {{deal.amount}}",
    );
  });

  describe("over the API", () => {
    const MEMBER = "frty_templates_member";
    const VIEWER = "frty_templates_viewer";
    let ws: string;
    const ids = { lan: "", deal: "" };
    const req = (url: string, init: RequestInit = {}, key = MEMBER) =>
      new Request(`http://localhost${url}`, { ...init, headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" } });
    const create = async (body: Record<string, unknown>, key = MEMBER) => {
      const route = await import("@/app/api/email-templates/route");
      return route.POST(req("/api/email-templates", { method: "POST", body: JSON.stringify(body) }, key));
    };

    beforeAll(async () => {
      await resetDb();
      const { db, tables, withWorkspace } = await import("@/db");
      const { sha256 } = await import("@/lib/auth");
      const { newId } = await import("@/lib/id");
      ws = await createWorkspace();
      await withWorkspace(ws, () =>
        db.insert(tables.apiKeys).values(
          [
            [MEMBER, "member"],
            [VIEWER, "viewer"],
          ].map(([key, role]) => ({ id: newId(), workspaceId: ws, name: role, prefix: key.slice(0, 8), keyHash: sha256(key), role, createdAt: Date.now() })),
        ),
      );
      const post = async (path: string, body: Record<string, unknown>) => {
        const route = (await import(`@/app/api/${path}/route`)) as { POST: (r: Request) => Promise<Response> };
        return Object.values(await (await route.POST(req(`/api/${path}`, { method: "POST", body: JSON.stringify(body) }))).json())[0] as { id: string };
      };
      const company = await post("companies", { name: "Fiesta Resort" });
      ids.lan = (await post("contacts", { firstName: "Lan", lastName: "Trần", email: "lan@khach.test", companyId: company.id })).id;
      ids.deal = (await post("deals", { name: "Pin kho lạnh", contactId: ids.lan, companyId: company.id })).id;
    });

    it("lets a member keep templates by name, and a viewer only read them", async () => {
      expect((await create({ name: "Theo dõi báo giá", subject: "Báo giá {{deal.name}}", body: "Chào {{contact.firstName}}," })).status).toBe(201);
      expect((await create({ name: "Cảm ơn", subject: "Cảm ơn", body: "Cảm ơn {{contact.firstName}}" })).status).toBe(201);
      expect((await create({ name: "Không", subject: "x", body: "x" }, VIEWER)).status).toBe(403);
      const route = await import("@/app/api/email-templates/route");
      const list = (await (await route.GET(req("/api/email-templates", {}, VIEWER))).json()).templates as { name: string }[];
      expect(list.map((t) => t.name)).toEqual(["Cảm ơn", "Theo dõi báo giá"]);
    });

    it("fills a template for one contact on one deal", async () => {
      const route = await import("@/app/api/email-templates/route");
      const template = ((await (await route.GET(req("/api/email-templates"))).json()).templates as { id: string; name: string }[]).find(
        (t) => t.name === "Theo dõi báo giá",
      )!;
      const render = await import("@/app/api/email-templates/[id]/render/route");
      const res = await render.POST(
        req(`/api/email-templates/${template.id}/render`, {
          method: "POST",
          body: JSON.stringify({ entityType: "deal", entityId: ids.deal, contactId: ids.lan }),
        }),
        { params: Promise.resolve({ id: template.id }) },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ subject: "Báo giá Pin kho lạnh", body: "Chào Lan," });
    });
  });
});

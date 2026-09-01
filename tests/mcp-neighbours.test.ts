import { beforeAll, describe, expect, it } from "vitest";
import { createWorkspace, resetDb } from "./pg-setup";
import { TOOLS, type ToolContext } from "@/mcp/tools";

/**
 * Non-dead-end reads (Phase 0). Two defects this locks shut:
 *
 * 1. A read handed back a record with no way to walk to the records around it,
 *    so an assistant holding a company had to search again to find its contacts
 *    — and a search that missed ended the conversation.
 * 2. `search` matched anywhere in a name, so "Marchetti" returned "Marchetta"
 *    and the caller could not tell a near-miss from a hit.
 */
describe("MCP reads return neighbours (Postgres + RLS)", () => {
  let ctx: ToolContext;
  let ids: {
    contact: string;
    colleague: string;
    company: string;
    deal: string;
    stage: string;
    taskOnContact: string;
    taskOnCompany: string;
    taskOnDeal: string;
    noteOnContact: string;
    noteOnCompany: string;
    noteOnDeal: string;
    activityOnContact: string;
    activityOnCompany: string;
    activityOnDeal: string;
  };

  // The MCP server wraps every call in the caller's workspace transaction, so a
  // direct handler call has to do the same or RLS scopes it to nothing.
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw new Error(`no such tool: ${name}`);
    const { withWorkspace } = await import("@/db");
    return withWorkspace(ctx.workspaceId, () => tool.handler(args, ctx)) as Promise<Record<string, never>>;
  };

  beforeAll(async () => {
    await resetDb();
    const { db, tables, withWorkspace } = await import("@/db");
    const { newId } = await import("@/lib/id");
    const workspaceId = await createWorkspace();
    ctx = { workspaceId, role: "admin", userId: null };

    ids = {
      contact: newId(),
      colleague: newId(),
      company: newId(),
      deal: newId(),
      stage: newId(),
      taskOnContact: newId(),
      taskOnCompany: newId(),
      taskOnDeal: newId(),
      noteOnContact: newId(),
      noteOnCompany: newId(),
      noteOnDeal: newId(),
      activityOnContact: newId(),
      activityOnCompany: newId(),
      activityOnDeal: newId(),
    };
    const now = Date.now();
    await withWorkspace(workspaceId, async () => {
      await db.insert(tables.companies).values({
        id: ids.company,
        name: "Fernhill Logistics",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(tables.contacts).values([
        {
          id: ids.contact,
          firstName: "Ada",
          lastName: "Marchetti",
          email: "ada@fernhill.example",
          companyId: ids.company,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: ids.colleague,
          firstName: "Bo",
          lastName: "Marchetta",
          email: "bo@fernhill.example",
          companyId: ids.company,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      const pipelineId = newId();
      await db.insert(tables.pipelines).values({ id: pipelineId, name: "Sales", createdAt: now });
      await db
        .insert(tables.stages)
        .values({ id: ids.stage, pipelineId, name: "Discovery", type: "open", order: 0 });
      await db.insert(tables.deals).values({
        id: ids.deal,
        name: "Fleet rollout",
        pipelineId,
        stageId: ids.stage,
        companyId: ids.company,
        contactId: ids.contact,
        // Two days ago, so the stage clock has something to report.
        stageEnteredAt: now - 2 * 86_400_000,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(tables.tasks).values([
        {
          id: ids.taskOnContact,
          title: "Call Ada",
          entityType: "contact",
          entityId: ids.contact,
          createdAt: now,
        },
        {
          id: ids.taskOnCompany,
          title: "Visit HQ",
          entityType: "company",
          entityId: ids.company,
          createdAt: now,
        },
        {
          id: ids.taskOnDeal,
          title: "Follow up deal",
          entityType: "deal",
          entityId: ids.deal,
          createdAt: now,
        },
      ]);
      await db.insert(tables.notes).values([
        { id: ids.noteOnContact, body: "Call notes", entityType: "contact", entityId: ids.contact, createdAt: now },
        { id: ids.noteOnCompany, body: "HQ notes", entityType: "company", entityId: ids.company, createdAt: now },
        { id: ids.noteOnDeal, body: "Deal notes", entityType: "deal", entityId: ids.deal, createdAt: now },
      ]);
      await db.insert(tables.activities).values([
        { id: ids.activityOnContact, type: "call", entityType: "contact", entityId: ids.contact, createdAt: now },
        { id: ids.activityOnCompany, type: "email", entityType: "company", entityId: ids.company, createdAt: now },
        { id: ids.activityOnDeal, type: "meeting", entityType: "deal", entityId: ids.deal, createdAt: now },
      ]);
    });
  });

  /**
   * Table-driven over the reads this phase adds: each must hand back at least one
   * id per neighbour relationship that exists. A read that returns a record and
   * nothing else is what forces the second search.
   */
  const cases = [
    { tool: "get_contact", arg: () => ids.contact, expect: ["companyId", "dealIds", "colleagueIds", "taskIds", "noteIds", "activityIds"] },
    { tool: "get_company", arg: () => ids.company, expect: ["contactIds", "dealIds", "taskIds", "noteIds", "activityIds"] },
    { tool: "get_deal", arg: () => ids.deal, expect: ["companyId", "contactIds", "stage", "taskIds", "noteIds", "activityIds"] },
  ];

  for (const c of cases) {
    it(`${c.tool} returns every neighbour that exists`, async () => {
      const { neighbours } = (await call(c.tool, { id: c.arg() })) as unknown as {
        neighbours: Record<string, unknown>;
      };
      for (const key of c.expect) {
        const value = neighbours[key];
        expect(value, `${c.tool}.neighbours.${key}`).toBeTruthy();
        if (Array.isArray(value)) expect(value.length, `${c.tool}.neighbours.${key}`).toBeGreaterThan(0);
      }
    });
  }

  it("get_contact walks to the colleague without naming them", async () => {
    const res = (await call("get_contact", { id: ids.contact })) as unknown as {
      neighbours: {
        colleagueIds: string[];
        dealIds: string[];
        companyId: string;
        taskIds: string[];
        noteIds: string[];
        activityIds: string[];
      };
    };
    expect(res.neighbours.colleagueIds).toEqual([ids.colleague]);
    expect(res.neighbours.dealIds).toEqual([ids.deal]);
    expect(res.neighbours.companyId).toBe(ids.company);
    expect(res.neighbours.taskIds).toEqual([ids.taskOnContact]);
    expect(res.neighbours.noteIds).toEqual([ids.noteOnContact]);
    expect(res.neighbours.activityIds).toEqual([ids.activityOnContact]);
  });

  it("get_company and get_deal walk to pinned tasks notes and timeline", async () => {
    const company = (await call("get_company", { id: ids.company })) as unknown as {
      neighbours: { taskIds: string[]; noteIds: string[]; activityIds: string[] };
    };
    expect(company.neighbours.taskIds).toEqual([ids.taskOnCompany]);
    expect(company.neighbours.noteIds).toEqual([ids.noteOnCompany]);
    expect(company.neighbours.activityIds).toEqual([ids.activityOnCompany]);
    const deal = (await call("get_deal", { id: ids.deal })) as unknown as {
      neighbours: { taskIds: string[]; noteIds: string[]; activityIds: string[] };
    };
    expect(deal.neighbours.taskIds).toEqual([ids.taskOnDeal]);
    expect(deal.neighbours.noteIds).toEqual([ids.noteOnDeal]);
    expect(deal.neighbours.activityIds).toEqual([ids.activityOnDeal]);
  });

  it("get_deal reports the stage clock, not just the stage id", async () => {
    const res = (await call("get_deal", { id: ids.deal })) as unknown as {
      neighbours: { stage: { name: string; daysInStage: number } };
    };
    expect(res.neighbours.stage.name).toBe("Discovery");
    expect(res.neighbours.stage.daysInStage).toBe(2);
  });

  it("a missing record is still an error, not an empty neighbour set", async () => {
    await expect(call("get_contact", { id: "nope" })).rejects.toThrow(/not found/i);
  });

  it("search is prefix-only: Marchetti does not match Marchetta", async () => {
    const hit = (await call("search", { query: "Marchetti" })) as unknown as {
      contacts: { id: string }[];
    };
    expect(hit.contacts.map((c) => c.id)).toEqual([ids.contact]);

    const near = (await call("search", { query: "Marchetta" })) as unknown as {
      contacts: { id: string }[];
    };
    expect(near.contacts.map((c) => c.id)).toEqual([ids.colleague]);

    const byPrefix = (await call("search", { query: "Ada" })) as unknown as {
      contacts: { id: string }[];
    };
    expect(byPrefix.contacts.map((c) => c.id)).toEqual([ids.contact]);
  });

  it("search says it is not fuzzy when it finds nothing, instead of ending the thread", async () => {
    const res = (await call("search", { query: "NoSuchPerson" })) as unknown as { note?: string };
    expect(res.note).toMatch(/not fuzzy/i);
  });

  it("an infix match no longer counts as a hit", async () => {
    const res = (await call("search", { query: "hill Logistics" })) as unknown as {
      companies: { id: string }[];
    };
    expect(res.companies).toEqual([]);
  });

  it("a custom-object read declines structurally when none are defined", async () => {
    const res = (await call("list_records", { object: "projects" })) as unknown as {
      ok: boolean;
      configured: boolean;
      capability: string;
      reason: string;
    };
    expect(res.ok).toBe(false);
    expect(res.configured).toBe(false);
    expect(res.capability).toBe("CUSTOM_OBJECTS");
    expect(res.reason).toMatch(/Retrying will not help/);
  });

  it("once custom objects exist, a wrong name lists the right ones", async () => {
    const { db, tables, withWorkspace } = await import("@/db");
    const { newId } = await import("@/lib/id");
    await withWorkspace(ctx.workspaceId, () =>
      db.insert(tables.customObjects).values({
        id: newId(),
        apiName: "projects",
        nameSingular: "Project",
        namePlural: "Projects",
        createdAt: Date.now(),
      }),
    );
    const res = (await call("list_records", { object: "prohects" })) as unknown as {
      ok: boolean;
      configured: boolean;
      available: string[];
    };
    expect(res.ok).toBe(false);
    expect(res.configured).toBe(true);
    expect(res.available).toEqual(["projects"]);
  });
});

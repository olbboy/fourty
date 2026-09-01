import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createWorkspace, resetDb } from "./pg-setup";
import {
  CAPABILITY_MODULES,
  capabilitiesMarkdown,
  unavailable,
  workspaceMarkdown,
  WORKSPACE_ABOUT_MAX,
  type CapabilityStatus,
} from "@/lib/capabilities";

/**
 * Capability registry (Phase 0). The renderers are pure and tested without a
 * database; the probes are tested against real Postgres + RLS, because "is a
 * mailbox connected" is a per-workspace row question and answering it from a
 * process-wide boolean is the bug this module exists to prevent.
 */
function statuses(on: Partial<Record<string, boolean>>): CapabilityStatus[] {
  return CAPABILITY_MODULES.map((m) => ({ ...m, on: on[m.id] ?? false }));
}

describe("capability renderers (pure)", () => {
  it("says what is reachable and names where the rest would be configured", () => {
    const md = capabilitiesMarkdown(statuses({ MAILBOX: true }));
    expect(md).toContain("Mailbox sync");
    expect(md).toContain("signature blocks");
    expect(md).toContain("Not configured here:");
    expect(md).toContain("Calendar");
  });

  it("frames a bare install positively rather than as a list of failures", () => {
    const md = capabilitiesMarkdown(statuses({}));
    expect(md).toContain("Everything you can learn is already in the CRM");
    expect(md).not.toContain("- AI assistant:");
  });

  it("drops the not-configured line when everything is on", () => {
    const md = capabilitiesMarkdown(CAPABILITY_MODULES.map((m) => ({ ...m, on: true })));
    expect(md).not.toContain("Not configured here:");
  });

  it("caps the identity block so a long description cannot crowd out the rules", () => {
    const md = workspaceMarkdown({ name: "Fernhill", about: "x".repeat(1000) });
    expect(md.length).toBeLessThanOrEqual(WORKSPACE_ABOUT_MAX);
    expect(md).toContain("Fernhill");
  });

  it("renders a name-only identity block when nobody has described the workspace", () => {
    expect(workspaceMarkdown({ name: "Fernhill", about: null })).toBe("You are working inside Fernhill.");
  });

  it("points webhook workflows at the sidebar, not Settings", () => {
    const webhooks = CAPABILITY_MODULES.find((m) => m.id === "WEBHOOKS")!;
    expect(webhooks.configuredFrom).toContain("Workflows →");
    expect(webhooks.configuredFrom).not.toMatch(/Automations/);
    expect(webhooks.configuredFrom).not.toMatch(/Settings\s*→\s*Workflows/);
  });
});

describe("unavailable()", () => {
  it("is a result, not a failure, and tells the caller retrying is pointless", () => {
    const r = unavailable("MAILBOX");
    expect(r.ok).toBe(false);
    expect(r.configured).toBe(false);
    expect(r.capability).toBe("MAILBOX");
    expect(r.reason).toContain("Retrying will not help");
    expect(r.reason).toContain("Settings → Mailboxes");
  });
});

describe("capability probes (Postgres + RLS)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let capabilities: typeof import("@/lib/capabilities").capabilities;
  let workspaceIdentity: typeof import("@/lib/capabilities").workspaceIdentity;
  let newId: typeof import("@/lib/id").newId;
  let wsA: string;
  let wsB: string;

  const on = async (workspaceId: string, id: string): Promise<boolean> =>
    withWorkspace(workspaceId, async () => (await capabilities()).find((c) => c.id === id)!.on);

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ capabilities, workspaceIdentity } = await import("@/lib/capabilities"));
    ({ newId } = await import("@/lib/id"));
    wsA = await createWorkspace();
    wsB = await createWorkspace();
  });

  afterEach(() => {
    delete process.env.AI_API_KEY;
    delete process.env.GLM_API_KEY;
    delete process.env.ZAI_API_KEY;
  });

  it("reports every registered module for a bare workspace, all off", async () => {
    delete process.env.AI_API_KEY;
    const list = await withWorkspace(wsA, () => capabilities());
    expect(list.map((c) => c.id)).toEqual(CAPABILITY_MODULES.map((m) => m.id));
    expect(list.every((c) => !c.on)).toBe(true);
  });

  it("reads AI_PROVIDER from the environment, not from a row", async () => {
    process.env.AI_API_KEY = "sk-test";
    expect(await on(wsA, "AI_PROVIDER")).toBe(true);
  });

  it("turns AI_PROVIDER on from GLM_API_KEY", async () => {
    process.env.GLM_API_KEY = "glm-test";
    expect(await on(wsA, "AI_PROVIDER")).toBe(true);
  });

  it("counts an OAuth mailbox only once a refresh token is on file", async () => {
    await withWorkspace(wsA, async () => {
      await db.insert(tables.syncAccounts).values({
        id: newId(),
        provider: "google",
        email: "rep@fernhill.example",
        config: JSON.stringify({}),
        status: "active",
        createdAt: Date.now(),
      });
    });
    expect(await on(wsA, "MAILBOX")).toBe(false);

    await withWorkspace(wsA, () =>
      db.update(tables.syncAccounts).set({ config: JSON.stringify({ refreshToken: "r" }) }),
    );
    expect(await on(wsA, "MAILBOX")).toBe(true);
  });

  it("keeps capabilities per workspace — a neighbour's mailbox is not ours", async () => {
    expect(await on(wsB, "MAILBOX")).toBe(false);
  });

  it("treats a paused mailbox as off", async () => {
    await withWorkspace(wsA, () => db.update(tables.syncAccounts).set({ status: "paused" }));
    expect(await on(wsA, "MAILBOX")).toBe(false);
    await withWorkspace(wsA, () => db.update(tables.syncAccounts).set({ status: "active" }));
  });

  it("counts an ICS feed as CALENDAR, never as MAILBOX", async () => {
    await withWorkspace(wsB, () =>
      db.insert(tables.syncAccounts).values({
        id: newId(),
        provider: "ics",
        email: "cal@fernhill.example",
        config: JSON.stringify({ url: "https://cal.example/feed.ics" }),
        status: "active",
        createdAt: Date.now(),
      }),
    );
    expect(await on(wsB, "CALENDAR")).toBe(true);
    expect(await on(wsB, "MAILBOX")).toBe(false);
  });

  it("turns WEBHOOKS on only for an enabled workflow that actually has a webhook action", async () => {
    const workflow = async (enabled: number, action: string) =>
      withWorkspace(wsB, () =>
        db.insert(tables.workflows).values({
          id: newId(),
          name: "notify",
          enabled,
          trigger: JSON.stringify({ event: "deal.won" }),
          actions: `[{"type":"${action}","url":"https://hooks.example/x"}]`,
          createdAt: Date.now(),
        }),
      );

    await workflow(1, "log");
    expect(await on(wsB, "WEBHOOKS")).toBe(false);
    await workflow(0, "webhook");
    expect(await on(wsB, "WEBHOOKS")).toBe(false);
    await workflow(1, "webhook");
    expect(await on(wsB, "WEBHOOKS")).toBe(true);
  });

  it("turns CUSTOM_OBJECTS on once one is defined", async () => {
    expect(await on(wsA, "CUSTOM_OBJECTS")).toBe(false);
    await withWorkspace(wsA, () =>
      db.insert(tables.customObjects).values({
        id: newId(),
        apiName: "projects",
        nameSingular: "Project",
        namePlural: "Projects",
        createdAt: Date.now(),
      }),
    );
    expect(await on(wsA, "CUSTOM_OBJECTS")).toBe(true);
  });

  it("refuses to answer outside a workspace transaction rather than reporting everything off", async () => {
    await expect(capabilities()).rejects.toThrow(/withWorkspace/);
  });

  it("reads the identity line from settings", async () => {
    const bare = await withWorkspace(wsA, () => workspaceIdentity());
    expect(bare.about).toBeNull();
    expect(bare.name).toBeTruthy();

    await withWorkspace(wsA, () =>
      db.insert(tables.settings).values({ key: "workspace.about", value: "We sell telematics." }),
    );
    expect((await withWorkspace(wsA, () => workspaceIdentity())).about).toBe("We sell telematics.");
    expect((await withWorkspace(wsB, () => workspaceIdentity())).about).toBeNull();
  });
});

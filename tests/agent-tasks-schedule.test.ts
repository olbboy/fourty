import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";
import { claimDue } from "@/lib/agent-tasks/claim";
import {
  completeTask,
  failTask,
  lastDecision,
  openTasksFor,
  retireExhausted,
  retireLane,
  scheduleTask,
  taskById,
} from "@/lib/agent-tasks/schedule";
import { dispatchTick } from "@/worker/dispatch";

/**
 * Booking work and draining it (Phase 2).
 *
 * The claim query has its own file; this one is about the promises the ledger
 * makes to a human: one booking per (record, kind), an outcome on everything
 * that stops, and a mailbox that pulls itself without anyone pressing a button
 * (backlog #14).
 */
const EML = [
  "Message-ID: <m1@example.com>",
  "From: Alice Example <alice@example.com>",
  "To: me@myco.com",
  "Subject: Hello",
  "Date: Tue, 1 Jul 2026 10:00:00 +0000",
  "",
  "Body text.",
].join("\n");

describe("the agent work ledger", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let setFetcher: typeof import("@/lib/sync/http").__setSyncFetcher;
  let ws: string;

  const inWs = <T>(fn: () => Promise<T>) => withWorkspace(ws, fn);

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    ({ __setSyncFetcher: setFetcher } = await import("@/lib/sync/http"));
    process.env.GOOGLE_OAUTH_CLIENT_ID = "gid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "gsecret";
    ws = await createWorkspace();
  });

  afterAll(() => {
    setFetcher(null);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.AI_API_KEY;
  });

  beforeEach(async () => {
    await inWs(async () => {
      await db.delete(tables.agentTasks);
      await db.delete(tables.syncAccounts);
    });
    delete process.env.AI_API_KEY;
  });

  describe("booking", () => {
    it("moves an existing booking instead of stacking a second one", async () => {
      const first = await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "first" }),
      );
      const later = Date.now() + 600_000;
      const second = await inWs(() =>
        scheduleTask({
          kind: "deal.health",
          entityType: "deal",
          entityId: "d1",
          reason: "second",
          dueAt: later,
        }),
      );
      expect(second.id).toBe(first.id);
      expect(second.reason).toBe("second");
      expect(second.dueAt).toBe(later);
      expect(await inWs(() => openTasksFor("deal", "d1"))).toHaveLength(1);
    });

    it("books a fresh task once the old one has finished", async () => {
      const first = await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "first" }),
      );
      await inWs(() => completeTask(first.id, "done"));
      const second = await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "again" }),
      );
      expect(second.id).not.toBe(first.id);
    });

    it("takes the lane, priority and budget from the kind", async () => {
      const task = await inWs(() =>
        scheduleTask({ kind: "recheck", entityType: "contact", entityId: "c1", reason: "come back" }),
      );
      expect(task.lane).toBe("session");
      expect(task.priority).toBe(0);
      expect(task.budget).toBe(2);
    });

    it("keeps a workspace-wide sweep, which is about no single record", async () => {
      const task = await inWs(() => scheduleTask({ kind: "sweep.backfill", reason: "look at everything" }));
      expect(task.entityType).toBeNull();
      const again = await inWs(() => scheduleTask({ kind: "sweep.backfill", reason: "still looking" }));
      expect(again.id).toBe(task.id);
    });
  });

  describe("giving up", () => {
    it("retries within budget and retires with the reason when it runs out", async () => {
      const task = await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "flaky" }),
      );
      // Attempt one of two: back on the queue, later.
      await inWs(() => claimDue("direct", 5));
      await inWs(() => failTask(task.id, "provider timed out"));
      let row = (await inWs(() => taskById(task.id)))!;
      expect(row.finishedAt).toBeNull();
      expect(row.dueAt).toBeGreaterThan(Date.now());

      // Attempt two of two: out of budget, so it stops — visibly.
      await inWs(() =>
        db.update(tables.agentTasks).set({ dueAt: Date.now() }).where(eq(tables.agentTasks.id, task.id)),
      );
      await inWs(() => claimDue("direct", 5));
      await inWs(() => failTask(task.id, "provider timed out"));
      row = (await inWs(() => taskById(task.id)))!;
      expect(row.finishedAt).toBeTypeOf("number");
      expect(row.outcome).toMatch(/gave up after 2: provider timed out/);
      expect(await inWs(() => claimDue("direct", 5))).toHaveLength(0);
    });

    it("sweeps up a task whose worker died after spending the last attempt", async () => {
      const task = await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "orphan", budget: 1 }),
      );
      await inWs(() => claimDue("direct", 5)); // attempt spent, then the process dies
      expect(await inWs(() => retireExhausted())).toBe(1);
      const row = (await inWs(() => taskById(task.id)))!;
      expect(row.outcome).toBe("gave up: out of attempts");
    });

    it("closes a whole lane with a reason", async () => {
      await inWs(() =>
        scheduleTask({ kind: "recheck", entityType: "contact", entityId: "c1", reason: "session work" }),
      );
      expect(await inWs(() => retireLane("session", "not configured: no AI provider"))).toBe(1);
      expect(await inWs(() => openTasksFor("contact", "c1"))).toHaveLength(0);
    });
  });

  describe("answering for itself", () => {
    it("reports what is queued and what it last did", async () => {
      const done = await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "recompute" }),
      );
      await inWs(() => completeTask(done.id, "health recomputed"));
      await inWs(() =>
        scheduleTask({ kind: "deal.health", entityType: "deal", entityId: "d1", reason: "recompute again" }),
      );

      const open = await inWs(() => openTasksFor("deal", "d1"));
      expect(open.map((t) => t.reason)).toEqual(["recompute again"]);
      const last = await inWs(() => lastDecision("deal", "d1"));
      expect(last?.outcome).toBe("health recomputed");
    });
  });

  describe("the dispatcher tick", () => {
    /** A connected Google mailbox with one message waiting. */
    async function connectedMailbox(): Promise<string> {
      const accountId = newId();
      await inWs(() =>
        db.insert(tables.syncAccounts).values({
          id: accountId,
          provider: "google",
          email: "me@myco.com",
          config: JSON.stringify({ refreshToken: "r1" }),
          createdAt: Date.now(),
        }),
      );
      const raw = Buffer.from(EML).toString("base64url");
      setFetcher(async (url) => {
        if (url.includes("oauth2.googleapis.com/token")) {
          return { status: 200, json: async () => ({ access_token: "at", expires_in: 3600 }), text: async () => "" };
        }
        if (url.includes("/messages?")) {
          return { status: 200, json: async () => ({ messages: [{ id: "m1" }] }), text: async () => "" };
        }
        if (url.includes("/messages/m1")) {
          return { status: 200, json: async () => ({ raw }), text: async () => "" };
        }
        return { status: 404, json: async () => ({}), text: async () => "" };
      });
      return accountId;
    }

    it("pulls a connected mailbox with nobody pressing Sync now (backlog #14)", async () => {
      const accountId = await connectedMailbox();

      const result = await dispatchTick(ws);
      expect(result.scheduled).toBe(1);
      expect(result.direct).toBe(1);

      // The mail actually arrived.
      const messages = await inWs(() => db.select().from(tables.emailMessages));
      expect(messages).toHaveLength(1);

      // And the next pull is already booked, from the row rather than a cron.
      const open = await inWs(() => openTasksFor("sync_account", accountId));
      expect(open).toHaveLength(1);
      expect(open[0].dueAt).toBeGreaterThan(Date.now());
      const last = await inWs(() => lastDecision("sync_account", accountId));
      expect(last?.outcome).toMatch(/pulled 1 message/);
    });

    it("does not pull again before the interval is up", async () => {
      await connectedMailbox();
      await dispatchTick(ws);
      const second = await dispatchTick(ws);
      expect(second.direct).toBe(0);
    });

    it("leaves a failing mailbox visible on the account and stops after its budget", async () => {
      await connectedMailbox();
      setFetcher(async () => ({ status: 400, json: async () => ({}), text: async () => "nope" }));

      // Budget for mailbox.pull is 5; drive it to exhaustion.
      for (let i = 0; i < 6; i++) {
        await dispatchTick(ws);
        await inWs(() => db.update(tables.agentTasks).set({ dueAt: Date.now() }));
      }
      const [account] = await inWs(() => db.select().from(tables.syncAccounts));
      expect(account.status).toBe("error");
      expect(account.lastError).toBeTruthy();
      const [task] = await inWs(() => db.select().from(tables.agentTasks));
      expect(task.finishedAt).toBeTypeOf("number");
      expect(task.outcome).toMatch(/gave up after/);
    });

    it("does not let the next booking overwrite a retry backoff", async () => {
      // The bug this pins: bookRecurringWork used to move dueAt on every tick.
      // A mailbox that has never synced has lastSyncedAt = null, so its computed
      // dueAt is in 1970 — the failed task would come due again immediately and
      // burn its whole budget within a few ticks instead of backing off.
      await connectedMailbox();
      setFetcher(async () => ({ status: 400, json: async () => ({}), text: async () => "nope" }));

      await dispatchTick(ws); // one failed attempt → backoff
      const [afterFailure] = await inWs(() => db.select().from(tables.agentTasks));
      expect(afterFailure.attempts).toBe(1);
      expect(afterFailure.dueAt).toBeGreaterThan(Date.now());

      await dispatchTick(ws); // the tick that used to reset dueAt to 1970
      const [afterTick] = await inWs(() => db.select().from(tables.agentTasks));
      expect(afterTick.dueAt).toBe(afterFailure.dueAt);
      expect(afterTick.attempts).toBe(1);
    });

    it("never books a pull for a mailbox it cannot fetch from", async () => {
      // IMAP is push-only, and an OAuth account with no refresh token is not
      // connected yet — booking either would queue work that can only fail.
      await inWs(() =>
        db.insert(tables.syncAccounts).values([
          { id: newId(), provider: "imap", email: "a@b.c", config: "{}", createdAt: Date.now() },
          { id: newId(), provider: "google", email: "d@e.f", config: "{}", createdAt: Date.now() },
        ]),
      );
      const result = await dispatchTick(ws);
      expect(result.scheduled).toBe(0);
      expect(await inWs(() => db.select().from(tables.agentTasks))).toHaveLength(0);
    });

    it("retires session work when no AI provider is configured, and never queues a zombie", async () => {
      await inWs(() =>
        scheduleTask({ kind: "contact.research", entityType: "contact", entityId: "c1", reason: "look into this" }),
      );
      const result = await dispatchTick(ws);
      expect(result.session).toBe(0);
      expect(result.retired).toBe(1);
      const last = await inWs(() => lastDecision("contact", "c1"));
      expect(last?.outcome).toBe("not configured: no AI provider");
    });

    it("drains the direct lane with no AI provider at all", async () => {
      await connectedMailbox();
      const result = await dispatchTick(ws);
      expect(process.env.AI_API_KEY).toBeUndefined();
      expect(result.direct).toBe(1);
    });

    it("closes a kind it has no handler for rather than looping on it", async () => {
      await inWs(() =>
        scheduleTask({ kind: "contact.evidence", entityType: "contact", entityId: "c1", reason: "read the mail" }),
      );
      await dispatchTick(ws);
      const last = await inWs(() => lastDecision("contact", "c1"));
      expect(last?.outcome).toBe("no handler for this kind yet");
    });
  });
});

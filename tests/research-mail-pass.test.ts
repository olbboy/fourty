import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";
import { runContactEvidencePass } from "@/lib/research/mail-pass";
import { setKeylessResearch } from "@/lib/research/config";
import { ingestEmails } from "@/lib/sync/ingest";

/**
 * The keyless research pass against real Postgres + RLS (Phase 3).
 *
 * The claim under test is the headline one: **with no AI provider configured at
 * all**, a connected mailbox fills in an empty job title with a readable reason,
 * and never touches a field a person typed. `AI_PROVIDER` is unset in the vitest
 * environment, so every test here runs on the keyless path by construction.
 */

const ADDRESS = "ada@fernhill.example";
const DAY = 86_400_000;

describe("keyless research pass (Postgres + RLS)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let ws: string;
  let contactId: string;
  let accountId: string;
  let now: number;

  const inWs = <T>(fn: () => Promise<T>): Promise<T> => withWorkspace(ws, fn);

  const contactRow = async () =>
    inWs(async () => (await db.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).limit(1))[0]!);

  const facts = async (field: string) =>
    inWs(async () =>
      db
        .select()
        .from(tables.recordFacts)
        .where(and(eq(tables.recordFacts.entityId, contactId), eq(tables.recordFacts.field, field))),
    );

  /** A message this contact sent. `thread` groups it with whatever else holds it. */
  const message = async (opts: {
    thread?: string;
    signatureTitle?: string;
    signatureEmployer?: string;
    from?: string;
    subject?: string;
    sentAt?: number;
  }) => {
    const id = newId();
    await inWs(async () => {
      await db.insert(tables.emailMessages).values({
        id,
        accountId,
        messageId: `${id}@mail.example`,
        threadId: opts.thread ?? `${id}@mail.example`,
        fromAddr: opts.from ?? ADDRESS,
        toAddrs: JSON.stringify(["me@myco.example"]),
        subject: opts.subject ?? "Renewal",
        snippet: "…",
        signatureTitle: opts.signatureTitle ?? null,
        signatureEmployer: opts.signatureEmployer ?? null,
        signatureRaw: opts.signatureTitle ? `Ada Marchetti\n${opts.signatureTitle}, Fernhill` : null,
        contactId,
        sentAt: opts.sentAt ?? now - DAY,
        createdAt: now,
      });
    });
    return id;
  };

  /** A signature on one message plus an independent reply on a thread we hold. */
  const twoSources = async (title: string) => {
    const thread = "thread-root@mail.example";
    await message({ signatureTitle: title, sentAt: now - DAY });
    await message({ thread, from: "me@myco.example", sentAt: now - 3 * DAY }); // our side
    await message({ thread, sentAt: now - 2 * DAY }); // their reply
  };

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    ws = await createWorkspace();
  });

  beforeEach(async () => {
    now = Date.now();
    contactId = newId();
    accountId = newId();
    await inWs(async () => {
      // A clean tenant per test. Contacts especially: they share one address,
      // and `matchContact` returns the first row that holds it — so a leftover
      // contact from the previous test would quietly collect this test's work.
      await db.delete(tables.emailMessages);
      await db.delete(tables.calendarEvents);
      await db.delete(tables.settings);
      await db.delete(tables.contacts);
      await db.delete(tables.agentTasks);
      await db.delete(tables.recordFacts);
      await db.insert(tables.syncAccounts).values({
        id: accountId,
        provider: "google",
        email: "me@myco.example",
        config: "{}",
        createdAt: now,
      });
      await db.insert(tables.contacts).values({
        id: contactId,
        firstName: "Ada",
        lastName: "Marchetti",
        email: ADDRESS,
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  describe("the keyless claim", () => {
    it("fills an empty job title from a signature plus a second source, with a readable reason", async () => {
      await twoSources("Head of Security");

      const result = await inWs(() => runContactEvidencePass(contactId, now));

      expect(result.applied).toBe(1);
      expect((await contactRow()).jobTitle).toBe("Head of Security");

      const [fact] = await facts("job_title");
      expect(fact.status).toBe("APPLIED");
      expect(fact.band).toBe("VERIFIED");
      // The rationale is what a rep reads instead of trusting a score.
      const evidence = JSON.parse(fact.evidence) as Array<{ kind: string; detail: string }>;
      expect(evidence.map((e) => e.kind)).toContain("crm.signature-block");
      expect(evidence.map((e) => e.kind)).toContain("crm.thread-reply");
      expect(evidence[0].detail).toMatch(/their signature on \d+ \w+ \d{4} reads/);
    });

    it("counts a meeting as the second source", async () => {
      await message({ signatureTitle: "Head of Security" });
      await inWs(async () => {
        await db.insert(tables.calendarEvents).values({
          id: newId(),
          accountId,
          uid: `qbr-${newId()}@example`,
          title: "Q3 QBR",
          attendees: JSON.stringify([ADDRESS, "me@myco.example"]),
          contactId,
          startAt: now - 5 * DAY,
          createdAt: now,
        });
      });

      const result = await inWs(() => runContactEvidencePass(contactId, now));
      expect(result.applied).toBe(1);
      const [fact] = await facts("job_title");
      expect(JSON.parse(fact.evidence).map((e: { kind: string }) => e.kind)).toContain(
        "crm.meeting-attendance",
      );
    });

    it("leaves a lone signature as a proposal, never a write", async () => {
      await message({ signatureTitle: "Head of Security" });

      const result = await inWs(() => runContactEvidencePass(contactId, now));

      expect(result.applied).toBe(0);
      expect(result.proposed).toBe(1);
      expect((await contactRow()).jobTitle).toBeNull();
      const [fact] = await facts("job_title");
      expect(fact.status).toBe("PROPOSED");
      expect(fact.band).toBe("PROBABLE");
    });
  });

  describe("what it refuses to do", () => {
    it("proposes against a field a person typed, and does not overwrite it", async () => {
      await inWs(() =>
        db.update(tables.contacts).set({ jobTitle: "Ops Lead" }).where(eq(tables.contacts.id, contactId)),
      );
      await twoSources("Head of Security");

      const result = await inWs(() => runContactEvidencePass(contactId, now));

      expect(result.applied).toBe(0);
      expect((await contactRow()).jobTitle).toBe("Ops Lead");
      expect((await facts("job_title"))[0].status).toBe("PROPOSED");
    });

    it("holds a contradicted employer below the proposal floor", async () => {
      // Their signature points at one company; they write from another.
      await message({ signatureEmployer: "acme.example" });
      await message({ thread: "t@mail.example" });

      await inWs(() => runContactEvidencePass(contactId, now));

      const [fact] = await facts("company_id");
      expect(fact.band).toBe("POSSIBLE"); // stored, never surfaced, never written
      expect(fact.status).toBe("PROPOSED");
      expect((await contactRow()).companyId).toBeNull();
      expect(JSON.parse(fact.evidence).map((e: { kind: string }) => e.kind)).toContain("contradiction");
    });

    it("does nothing at all when the workspace has switched research off", async () => {
      await twoSources("Head of Security");
      await inWs(() => setKeylessResearch(false));

      const result = await inWs(() => runContactEvidencePass(contactId, now));

      expect(result.outcome).toMatch(/switched off/i);
      expect(await facts("job_title")).toHaveLength(0);
    });

    it("matches on an address and never on a name", async () => {
      await inWs(() =>
        db.update(tables.contacts).set({ email: null }).where(eq(tables.contacts.id, contactId)),
      );
      await twoSources("Head of Security");

      const result = await inWs(() => runContactEvidencePass(contactId, now));

      expect(result.outcome).toMatch(/no email address/i);
      expect(await facts("job_title")).toHaveLength(0);
    });
  });

  describe("running on a schedule", () => {
    it("yields one fact from two runs, not two", async () => {
      await message({ signatureTitle: "Head of Security" });

      await inWs(() => runContactEvidencePass(contactId, now));
      await inWs(() => runContactEvidencePass(contactId, now + 60_000));

      const rows = await facts("job_title");
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("PROPOSED");
    });

    it("books one evidence task per contact a sync said something new about", async () => {
      // Longer than the 280-char snippet on purpose: the signature sits past
      // the end of everything Fourty stores, which is why extraction has to
      // happen at ingest rather than by re-reading rows later.
      const raw = [
        "Message-ID: <fresh-1@mail.example>",
        `From: Ada <${ADDRESS}>`,
        "To: me@myco.example",
        "Subject: Renewal",
        "",
        "Thanks for sending the renewal deck over. ".repeat(10),
        "",
        "--",
        "Ada Marchetti",
        "Head of Security, Fernhill",
        "+44 20 7946 0958",
      ].join("\n");

      await inWs(() => ingestEmails(accountId, [raw]));
      await inWs(() => ingestEmails(accountId, [raw])); // a re-pull: same message

      const tasks = await inWs(() =>
        db
          .select()
          .from(tables.agentTasks)
          .where(and(eq(tables.agentTasks.kind, "contact.evidence"), eq(tables.agentTasks.entityId, contactId))),
      );
      expect(tasks).toHaveLength(1);

      // The extraction happened at ingest: the title is on the row even though
      // the block it came from is past the end of the stored snippet.
      const [stored] = await inWs(() => db.select().from(tables.emailMessages));
      expect(stored.signatureTitle).toBe("Head of Security");
      expect(stored.snippet!.length).toBe(280);
      expect(stored.snippet).not.toContain("Head of Security");
    });

    it("extracts nothing at all once the switch is off", async () => {
      // The switch is documented as stopping the *reading*, not merely the
      // suggestions — so nothing may be extracted or stored while it is off.
      await inWs(() => setKeylessResearch(false));
      const raw = [
        "Message-ID: <off-1@mail.example>",
        `From: Ada Marchetti <${ADDRESS}>`,
        "To: me@myco.example",
        "Subject: Renewal",
        "",
        "Thanks!",
        "",
        "--",
        "Ada Marchetti",
        "Head of Security, Fernhill",
        "+44 20 7946 0958",
      ].join("\n");

      await inWs(() => ingestEmails(accountId, [raw]));

      const [stored] = await inWs(() => db.select().from(tables.emailMessages));
      expect(stored.signatureTitle).toBeNull();
      expect(stored.signatureRaw).toBeNull();
      expect(await inWs(() => db.select().from(tables.agentTasks))).toHaveLength(0);
    });
  });
});

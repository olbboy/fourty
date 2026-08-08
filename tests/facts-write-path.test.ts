import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createWorkspace, resetDb } from "./pg-setup";
import { recordFact, decideFact, listFacts, ownerOf } from "@/lib/facts/record-fact";
import type { Evidence } from "@/lib/facts/evidence";

/**
 * The evidence ledger's write path, against real Postgres + RLS (ADR-018).
 *
 * "Never overwrite a human" is only true if the transaction says so, so nothing
 * here is stubbed: every case reads the column back afterwards. The three
 * invariants each have their own describe block, and the ship cases from the
 * phase plan each have exactly one test.
 */
const SIGNATURE: Evidence = { kind: "crm.signature-block", detail: "their signature on 14 July reads Head of Ops" };
const MAIL: Evidence = { kind: "profile.email-match", detail: "replied from ada@fernhill.example" };
const VERIFIED = [SIGNATURE, MAIL];

describe("evidence ledger write path (Postgres + RLS)", () => {
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let newId: typeof import("@/lib/id").newId;
  let ws: string;
  let other: string;
  let contactId: string;
  let companyId: string;
  /** Unique per test: two companies on one domain is its own case, below. */
  let companyDomain: string;

  /** Run inside the tenant transaction — everything below is workspace-scoped. */
  const inWs = <T>(fn: () => Promise<T>, workspace = ws): Promise<T> => withWorkspace(workspace, fn);

  const research = { userId: null, via: "research" };
  const human = (userId: string) => ({ userId, via: undefined });

  const contactRow = async (workspace = ws) =>
    inWs(async () => (await db.select().from(tables.contacts).where(eq(tables.contacts.id, contactId)).limit(1))[0]!, workspace);

  const auditRows = async (action: string) =>
    inWs(async () => db.select().from(tables.auditLog).where(eq(tables.auditLog.action, action)));

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ newId } = await import("@/lib/id"));
    ws = await createWorkspace();
    other = await createWorkspace();
  });

  beforeEach(async () => {
    // A clean record per test: the invariants are about history, so a shared
    // contact would let one test's ledger decide another's outcome.
    contactId = newId();
    companyId = newId();
    companyDomain = `${companyId.toLowerCase()}.example`;
    const now = Date.now();
    await inWs(async () => {
      await db.insert(tables.companies).values({
        id: companyId,
        name: "Fernhill Logistics",
        domain: companyDomain,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(tables.contacts).values({
        id: contactId,
        firstName: "Ada",
        lastName: "Marchetti",
        email: "ada@fernhill.example",
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  describe("a deterministic pass filling an empty field", () => {
    it("applies at VERIFIED with a primary source, and audits it as research", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(true);
      expect((await contactRow()).jobTitle).toBe("Head of Ops");

      const entries = await auditRows("fact.applied");
      expect(entries).toHaveLength(1);
      // No background path invents a user (ADR-018 §6).
      expect(entries[0].actorId).toBeNull();
      expect(JSON.parse(entries[0].meta).via).toBe("research");
    });

    it("refuses to store anything below the floor, and says so without inviting a retry", async () => {
      const out = await inWs(() =>
        recordFact(
          {
            entityType: "contact",
            entityId: contactId,
            field: "job_title",
            value: "Head of Ops",
            evidence: [{ kind: "employer-only", detail: "the employer matches" }],
          },
          research,
        ),
      );
      expect(out.ok).toBe(false);
      expect(out.ok === false && out.code).toBe("below_floor");
      expect(out.ok === false && out.reason).toMatch(/do not raise the score/i);
      expect(await inWs(() => listFacts({ entityId: contactId }))).toHaveLength(0);
    });

    it("proposes rather than writes when only a signature says so", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(false);
      expect(out.ok && out.fact.band).toBe("PROBABLE");
      expect((await contactRow()).jobTitle).toBeNull();
    });
  });

  describe("invariant 1 — never overwrite a human", () => {
    it("proposes against a human-typed value instead of replacing it", async () => {
      await inWs(() =>
        db.update(tables.contacts).set({ jobTitle: "Ops Lead" }).where(eq(tables.contacts.id, contactId)),
      );
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(false);
      expect(out.ok && out.fact.status).toBe("PROPOSED");
      expect(out.ok && out.reason).toMatch(/set by a person/i);
      expect((await contactRow()).jobTitle).toBe("Ops Lead");
    });

    it("lets the pass correct its own earlier value, superseding it", async () => {
      await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      const second = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "COO", evidence: VERIFIED },
          research,
        ),
      );
      expect(second.ok && second.applied).toBe(true);
      expect((await contactRow()).jobTitle).toBe("COO");

      // The supersession IS the job change, with its date and its source.
      const history = await inWs(() => listFacts({ entityId: contactId, status: "SUPERSEDED" }));
      expect(history).toHaveLength(1);
      expect(history[0].value).toBe("Head of Ops");
      expect(history[0].supersededAt).toBeTypeOf("number");
    });

    it("hands the field back to the human the moment they edit it", async () => {
      await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      await inWs(() =>
        db.update(tables.contacts).set({ jobTitle: "Chief of Staff" }).where(eq(tables.contacts.id, contactId)),
      );
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "COO", evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(false);
      expect((await contactRow()).jobTitle).toBe("Chief of Staff");
    });

    it("treats a value a human accepted as theirs, not the pass's", async () => {
      const proposal = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      const userId = newId();
      await inWs(() => decideFact((proposal as { fact: { id: string } }).fact.id, "accept", human(userId)));
      expect((await contactRow()).jobTitle).toBe("Head of Ops");

      const later = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "COO", evidence: VERIFIED },
          research,
        ),
      );
      expect(later.ok && later.applied).toBe(false);
      expect((await contactRow()).jobTitle).toBe("Head of Ops");
    });

    it("derives ownership without an is_human_edited column", () => {
      expect(ownerOf(null, null)).toBe("empty");
      expect(ownerOf("Head of Ops", null)).toBe("human");
      const applied = { value: "Head of Ops", decidedBy: null } as Parameters<typeof ownerOf>[1];
      expect(ownerOf("Head of Ops", applied)).toBe("research");
      expect(ownerOf("Chief of Staff", applied)).toBe("human");
      const accepted = { value: "Head of Ops", decidedBy: "u1" } as Parameters<typeof ownerOf>[1];
      expect(ownerOf("Head of Ops", accepted)).toBe("human");
    });
  });

  describe("invariant 2 — never re-offer a dismissal", () => {
    it("refuses the same value forever once it has been dismissed", async () => {
      const first = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      await inWs(() => decideFact((first as { fact: { id: string } }).fact.id, "dismiss", human(newId())));

      const again = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      expect(again.ok).toBe(false);
      expect(again.ok === false && again.code).toBe("dismissed");
      expect((await contactRow()).jobTitle).toBeNull();
    });

    it("still accepts a different value for the same field", async () => {
      const first = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      await inWs(() => decideFact((first as { fact: { id: string } }).fact.id, "dismiss", human(newId())));
      const other = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "COO", evidence: VERIFIED },
          research,
        ),
      );
      expect(other.ok && other.applied).toBe(true);
    });
  });

  describe("invariant 3 — never apply without a primary source", () => {
    it("caps supporting-only evidence at PROBABLE however much of it agrees", async () => {
      const out = await inWs(() =>
        recordFact(
          {
            entityType: "contact",
            entityId: contactId,
            field: "job_title",
            value: "Head of Ops",
            evidence: [
              { kind: "web.cited-claim", detail: "the team page", sourceUrl: "https://fernhill.example/team" },
              { kind: "web.cited-claim", detail: "a press release", sourceUrl: "https://press.example/hire" },
              { kind: "handle.name-form", detail: "the handle matches" },
              { kind: "search.cites-profile", detail: "a search result cites the profile" },
              { kind: "employer-only", detail: "the employer matches" },
            ],
          },
          research,
        ),
      );
      expect(out.ok && out.fact.score).toBeGreaterThan(0.85);
      expect(out.ok && out.fact.band).toBe("PROBABLE");
      expect(out.ok && out.applied).toBe(false);
    });
  });

  describe("write classes", () => {
    it("caps a generative caller at PROBABLE even on VERIFIED evidence", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          { userId: null, via: "ai" },
        ),
      );
      expect(out.ok && out.fact.band).toBe("PROBABLE");
      expect(out.ok && out.applied).toBe(false);
      expect((await contactRow()).jobTitle).toBeNull();
    });

    it("lets a human record an honestly-banded observation that still does not write", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          human(newId()),
        ),
      );
      expect(out.ok && out.fact.band).toBe("VERIFIED");
      expect(out.ok && out.applied).toBe(false);
      expect((await contactRow()).jobTitle).toBeNull();
    });
  });

  describe("company_id resolves or stays a proposal", () => {
    it("links on an exact domain match", async () => {
      const out = await inWs(() =>
        recordFact(
          {
            entityType: "contact",
            entityId: contactId,
            field: "company_id",
            value: `https://www.${companyDomain.toUpperCase()}/careers`,
            evidence: VERIFIED,
          },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(true);
      expect(out.ok && out.fact.value).toBe(companyId);
      expect((await contactRow()).companyId).toBe(companyId);
    });

    it("refuses to guess when two companies share the domain", async () => {
      await inWs(() =>
        db.insert(tables.companies).values({
          id: newId(),
          name: "Fernhill Freight",
          domain: companyDomain,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      );
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "company_id", value: companyDomain, evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(false);
      expect(out.ok && out.reason).toMatch(/More than one company/);
      expect((await contactRow()).companyId).toBeNull();
    });

    it("leaves a name-only employer as a proposal and links nothing", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "company_id", value: "Fernhill", evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok && out.applied).toBe(false);
      expect(out.ok && out.fact.band).toBe("PROBABLE");
      expect(out.ok && out.fact.value).toBe("Fernhill");
      expect((await contactRow()).companyId).toBeNull();
    });
  });

  describe("revert", () => {
    it("restores the previous value, dismisses the reverted one, and appends fact.reverted", async () => {
      await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      const second = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "COO", evidence: VERIFIED },
          research,
        ),
      );
      const userId = newId();
      const reverted = await inWs(() =>
        decideFact((second as { fact: { id: string } }).fact.id, "revert", human(userId)),
      );
      expect(reverted.ok).toBe(true);
      expect((await contactRow()).jobTitle).toBe("Head of Ops");
      expect(reverted.ok && reverted.fact.status).toBe("DISMISSED");

      const entries = await auditRows("fact.reverted");
      expect(entries).toHaveLength(1);
      expect(JSON.parse(entries[0].meta)).toMatchObject({ via: "human", old: "COO", new: "Head of Ops" });

      // And the reverted value cannot come straight back.
      const again = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "COO", evidence: VERIFIED },
          research,
        ),
      );
      expect(again.ok === false && again.code).toBe("dismissed");
    });

    it("clears the field again when there was nothing there before", async () => {
      const first = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      await inWs(() => decideFact((first as { fact: { id: string } }).fact.id, "revert", human(newId())));
      expect((await contactRow()).jobTitle).toBeNull();
    });
  });

  describe("the inbox", () => {
    it("lists PROBABLE but never POSSIBLE", async () => {
      await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      await inWs(() =>
        recordFact(
          {
            entityType: "contact",
            entityId: contactId,
            field: "linkedin",
            value: "https://linkedin.example/in/ada",
            evidence: [{ kind: "web.cited-claim", detail: "a page cites it" }],
          },
          research,
        ),
      );
      const inbox = await inWs(() => listFacts({ entityId: contactId }));
      expect(inbox.map((f) => f.field)).toEqual(["job_title"]);

      // POSSIBLE is stored, just never surfaced.
      const all = await inWs(() =>
        db
          .select()
          .from(tables.recordFacts)
          .where(and(eq(tables.recordFacts.entityId, contactId), eq(tables.recordFacts.band, "POSSIBLE"))),
      );
      expect(all).toHaveLength(1);
    });
  });

  describe("addressing", () => {
    it("refuses a field that is not in the catalogue", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "employer", value: "Fernhill", evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok === false && out.code).toBe("unknown_field");
      expect(out.ok === false && out.reason).toMatch(/company_id/);
    });

    it("refuses a record that is not there", async () => {
      const out = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: "nope", field: "job_title", value: "x", evidence: VERIFIED },
          research,
        ),
      );
      expect(out.ok === false && out.code).toBe("unknown_record");
    });
  });

  describe("through the action kernel", () => {
    const run = async (action: unknown, input: unknown, role: string, userId: string | null = null) => {
      const { execute } = await import("@/lib/actions/execute");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return inWs(() => execute(action as any, input, { workspaceId: ws, role, userId }));
    };

    it("lets a viewer read suggestions but not decide them", async () => {
      const { factsList, factsDecide } = await import("@/lib/actions/facts");
      const proposal = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      await expect(run(factsList, { entityId: contactId }, "viewer")).resolves.toHaveLength(1);
      await expect(
        run(factsDecide, { id: (proposal as { fact: { id: string } }).fact.id, decision: "accept" }, "viewer"),
      ).rejects.toThrow(/cannot update facts/i);
    });

    it("hides a suggestion about a field the role may not read", async () => {
      const { factsList } = await import("@/lib/actions/facts");
      await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      await inWs(() =>
        db.insert(tables.fieldPermissions).values({
          id: newId(),
          object: "contacts",
          field: "jobTitle",
          role: "member",
          canRead: 0,
          canWrite: 0,
          createdAt: Date.now(),
        }),
      );
      // Otherwise the inbox becomes the way around field permissions.
      await expect(run(factsList, { entityId: contactId }, "member")).resolves.toHaveLength(0);
      await expect(run(factsList, { entityId: contactId }, "admin")).resolves.toHaveLength(1);
      await inWs(() => db.delete(tables.fieldPermissions));
    });

    it("refuses to accept a suggestion for a field the role may not write", async () => {
      const { factsDecide } = await import("@/lib/actions/facts");
      const proposal = await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: [SIGNATURE] },
          research,
        ),
      );
      await inWs(() =>
        db.insert(tables.fieldPermissions).values({
          id: newId(),
          object: "contacts",
          field: "jobTitle",
          role: "member",
          canRead: 1,
          canWrite: 0,
          createdAt: Date.now(),
        }),
      );
      await expect(
        run(factsDecide, { id: (proposal as { fact: { id: string } }).fact.id, decision: "accept" }, "member"),
      ).rejects.toThrow(/jobTitle/);
      expect((await contactRow()).jobTitle).toBeNull();
      await inWs(() => db.delete(tables.fieldPermissions));
    });

    it("refuses evidence that claims a kind nobody defined", async () => {
      const { factsRecord } = await import("@/lib/actions/facts");
      await expect(
        run(
          factsRecord,
          {
            entityType: "contact",
            entityId: contactId,
            field: "job_title",
            value: "Head of Ops",
            evidence: [{ kind: "vibes", detail: "felt right" }],
          },
          "admin",
        ),
      ).rejects.toThrow(/evidence/i);
    });

    it("accepts no confidence parameter — an extra key is simply not read", async () => {
      const { factsRecord } = await import("@/lib/actions/facts");
      const out = (await run(
        factsRecord,
        {
          entityType: "contact",
          entityId: contactId,
          field: "job_title",
          value: "Head of Ops",
          evidence: [SIGNATURE],
          score: 0.99,
          confidence: 1,
        },
        "admin",
      )) as { fact: { score: number; band: string } };
      // The caller's 0.99 is nowhere; the pure function's 0.8 is what is stored.
      expect(out.fact.score).toBe(0.8);
      expect(out.fact.band).toBe("PROBABLE");
    });
  });

  describe("tenant isolation", () => {
    it("keeps a fact in one workspace invisible to another", async () => {
      await inWs(() =>
        recordFact(
          { entityType: "contact", entityId: contactId, field: "job_title", value: "Head of Ops", evidence: VERIFIED },
          research,
        ),
      );
      expect(await inWs(() => listFacts({ entityId: contactId }), other)).toHaveLength(0);
      expect(
        await inWs(
          () => db.select().from(tables.recordFacts).where(eq(tables.recordFacts.entityId, contactId)),
          other,
        ),
      ).toHaveLength(0);
    });
  });
});

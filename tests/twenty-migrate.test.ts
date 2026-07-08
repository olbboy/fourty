import { describe, expect, it } from "vitest";
import {
  transformPerson,
  transformCompany,
  transformOpportunity,
  microsToUnits,
  employeesToSize,
  isoToMillis,
} from "../packages/twenty-migrate/src/transform";
import { migrate, type TwentySource, type FourtySink } from "../packages/twenty-migrate/src/migrate";

/**
 * @fourty/twenty-migrate (Gate B6): pure transforms + the orchestration's id
 * remapping, driven by in-memory fixtures (no network). Proves Twenty's nested/
 * micros/ISO shapes map correctly and that contacts/deals get re-pointed at the
 * new Fourty company/contact ids.
 */
describe("twenty → fourty transforms", () => {
  it("maps a person, flattening nested fields", () => {
    const c = transformPerson({
      id: "p1",
      name: { firstName: "Ada", lastName: "Lovelace" },
      emails: { primaryEmail: "ada@analytical.engine" },
      phones: { primaryPhoneNumber: "+1 555 0100" },
      jobTitle: "Mathematician",
      city: "London",
      companyId: "c1",
      linkedinLink: { primaryLinkUrl: "https://linkedin.com/in/ada" },
    });
    expect(c).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@analytical.engine",
      phone: "+1 555 0100",
      jobTitle: "Mathematician",
      city: "London",
      companyId: "c1",
      linkedin: "https://linkedin.com/in/ada",
    });
  });

  it("falls back to the email local-part when no name", () => {
    expect(transformPerson({ id: "p2", emails: { primaryEmail: "grace@navy.mil" } }).firstName).toBe("grace");
  });

  it("maps a company incl. employees→size and ARR micros", () => {
    const c = transformCompany({
      id: "c1",
      name: "ACME",
      domainName: { primaryLinkUrl: "acme.com" },
      employees: 120,
      address: { addressCity: "NYC", addressCountry: "US" },
      annualRecurringRevenue: { amountMicros: 2_500_000_000_000, currencyCode: "USD" },
    });
    expect(c.size).toBe("51-200");
    expect(c.domain).toBe("acme.com");
    expect(c.annualRevenue).toBe(2_500_000);
  });

  it("maps an opportunity, converting micros + ISO date", () => {
    const d = transformOpportunity({
      id: "o1",
      name: "Big deal",
      amount: { amountMicros: 50_000_000_000, currencyCode: "EUR" },
      closeDate: "2026-09-30T00:00:00.000Z",
      companyId: "c1",
      pointOfContactId: "p1",
    });
    expect(d.amount).toBe(50_000);
    expect(d.currency).toBe("EUR");
    expect(d.expectedCloseDate).toBe(Date.parse("2026-09-30T00:00:00.000Z"));
  });

  it("unit helpers", () => {
    expect(microsToUnits(1_500_000)).toBe(1.5);
    expect(microsToUnits(null)).toBe(0);
    expect(employeesToSize(5)).toBe("1-10");
    expect(employeesToSize(0)).toBeNull();
    expect(isoToMillis("not-a-date")).toBeNull();
  });
});

describe("migration orchestration (id remapping)", () => {
  const source: TwentySource = {
    companies: async () => [{ id: "tc1", name: "ACME", employees: 20 }],
    people: async () => [
      { id: "tp1", name: { firstName: "Ada" }, emails: { primaryEmail: "ada@x.io" }, companyId: "tc1" },
    ],
    opportunities: async () => [
      { id: "to1", name: "Deal", amount: { amountMicros: 1_000_000_000, currencyCode: "USD" }, companyId: "tc1", pointOfContactId: "tp1" },
    ],
  };

  function recordingSink() {
    const created: { companies: unknown[]; contacts: unknown[]; deals: unknown[] } = {
      companies: [],
      contacts: [],
      deals: [],
    };
    let n = 0;
    const sink: FourtySink = {
      createCompany: async (i) => {
        created.companies.push(i);
        return { id: `fc${++n}` };
      },
      createContact: async (i) => {
        created.contacts.push(i);
        return { id: `fct${++n}` };
      },
      createDeal: async (i) => {
        created.deals.push(i);
        return { id: `fd${++n}` };
      },
    };
    return { sink, created };
  }

  it("creates all records and re-points foreign keys to Fourty ids", async () => {
    const { sink, created } = recordingSink();
    const report = await migrate(source, sink);
    expect(report).toMatchObject({ companies: 1, contacts: 1, deals: 1 });
    expect(report.errors).toHaveLength(0);

    const fourtyCompanyId = (created.contacts[0] as { companyId: string }).companyId;
    // Contact points at the newly-created Fourty company, not Twenty's "tc1".
    expect(fourtyCompanyId).toMatch(/^fc\d+$/);
    const deal = created.deals[0] as { companyId: string; contactId: string; amount: number };
    expect(deal.companyId).toBe(fourtyCompanyId);
    expect(deal.contactId).toMatch(/^fct\d+$/);
    expect(deal.amount).toBe(1000);
  });

  it("dry-run tallies without writing", async () => {
    const { sink, created } = recordingSink();
    const report = await migrate(source, sink, { dryRun: true });
    expect(report).toMatchObject({ companies: 1, contacts: 1, deals: 1 });
    expect(created.companies).toHaveLength(0);
    expect(created.contacts).toHaveLength(0);
    expect(created.deals).toHaveLength(0);
  });
});

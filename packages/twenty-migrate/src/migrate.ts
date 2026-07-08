import {
  transformCompany,
  transformPerson,
  transformOpportunity,
  type TwentyCompany,
  type TwentyPerson,
  type TwentyOpportunity,
  type FourtyContactInput,
  type FourtyCompanyInput,
  type FourtyDealInput,
} from "./transform.js";

/**
 * Migration orchestration (Gate B6). Pulls Twenty records from a Source, transforms
 * them, and pushes them through a Sink — remapping Twenty ids to the new Fourty
 * ids so contacts land in the right company and deals point at the right
 * company/contact. Source + Sink are interfaces so the whole run is testable with
 * fixtures; the real clients (Twenty GraphQL, Fourty REST) implement them.
 */
export interface TwentySource {
  companies(): Promise<TwentyCompany[]>;
  people(): Promise<TwentyPerson[]>;
  opportunities(): Promise<TwentyOpportunity[]>;
}

export interface FourtySink {
  createCompany(input: FourtyCompanyInput): Promise<{ id: string }>;
  createContact(input: FourtyContactInput): Promise<{ id: string }>;
  createDeal(input: FourtyDealInput): Promise<{ id: string }>;
}

export type MigrationReport = {
  companies: number;
  contacts: number;
  deals: number;
  skipped: { contacts: number; deals: number };
  errors: string[];
};

export type MigrateOptions = { dryRun?: boolean; onProgress?: (msg: string) => void };

export async function migrate(
  source: TwentySource,
  sink: FourtySink,
  opts: MigrateOptions = {},
): Promise<MigrationReport> {
  const log = opts.onProgress ?? (() => {});
  const report: MigrationReport = { companies: 0, contacts: 0, deals: 0, skipped: { contacts: 0, deals: 0 }, errors: [] };
  const companyMap = new Map<string, string>(); // twentyCompanyId → fourtyCompanyId
  const contactMap = new Map<string, string>(); // twentyPersonId → fourtyContactId

  // 1) Companies first — contacts/deals reference them.
  const companies = await source.companies();
  log(`companies: ${companies.length}`);
  for (const c of companies) {
    try {
      const input = transformCompany(c);
      const { id } = opts.dryRun ? { id: `dry_${c.id}` } : await sink.createCompany(input);
      companyMap.set(c.id, id);
      report.companies += 1;
    } catch (e) {
      report.errors.push(`company ${c.id}: ${errMsg(e)}`);
    }
  }

  // 2) People → contacts, remapping companyId.
  const people = await source.people();
  log(`people: ${people.length}`);
  for (const p of people) {
    try {
      const input = transformPerson(p);
      input.companyId = input.companyId ? companyMap.get(input.companyId) ?? null : null;
      const { id } = opts.dryRun ? { id: `dry_${p.id}` } : await sink.createContact(input);
      contactMap.set(p.id, id);
      report.contacts += 1;
    } catch (e) {
      report.skipped.contacts += 1;
      report.errors.push(`person ${p.id}: ${errMsg(e)}`);
    }
  }

  // 3) Opportunities → deals, remapping company + contact.
  const opportunities = await source.opportunities();
  log(`opportunities: ${opportunities.length}`);
  for (const o of opportunities) {
    try {
      const input = transformOpportunity(o);
      input.companyId = input.companyId ? companyMap.get(input.companyId) ?? null : null;
      input.contactId = input.contactId ? contactMap.get(input.contactId) ?? null : null;
      if (!opts.dryRun) await sink.createDeal(input);
      report.deals += 1;
    } catch (e) {
      report.skipped.deals += 1;
      report.errors.push(`opportunity ${o.id}: ${errMsg(e)}`);
    }
  }

  return report;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

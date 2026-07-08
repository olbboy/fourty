import type { TwentySource, FourtySink } from "./migrate.js";
import type {
  TwentyCompany,
  TwentyPerson,
  TwentyOpportunity,
  FourtyCompanyInput,
  FourtyContactInput,
  FourtyDealInput,
} from "./transform.js";

/**
 * Real network clients (Gate B6). TwentyGraphQLSource reads from a Twenty
 * instance's GraphQL API with cursor pagination; FourtyRestSink writes through
 * Fourty's REST API with a Bearer key. Both implement the Source/Sink interfaces
 * the (pure, tested) migrator depends on — the transport lives here, the logic
 * doesn't.
 */
type Edge<T> = { node: T };
type Connection<T> = { edges: Edge<T>[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };

const PERSON_FIELDS = `id name { firstName lastName } emails { primaryEmail } phones { primaryPhoneNumber } jobTitle city companyId linkedinLink { primaryLinkUrl }`;
const COMPANY_FIELDS = `id name domainName { primaryLinkUrl } employees address { addressCity addressCountry } linkedinLink { primaryLinkUrl } annualRecurringRevenue { amountMicros currencyCode }`;
const OPP_FIELDS = `id name amount { amountMicros currencyCode } closeDate stage companyId pointOfContactId`;

export class TwentyGraphQLSource implements TwentySource {
  constructor(
    private baseUrl: string,
    private token: string,
    private pageSize = 60,
  ) {}

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Twenty GraphQL ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new Error(`Twenty GraphQL: ${body.errors.map((e) => e.message).join("; ")}`);
    return body.data as T;
  }

  private async fetchAll<T>(field: string, subfields: string): Promise<T[]> {
    const out: T[] = [];
    let after: string | null = null;
    // Guard against a runaway loop if a server never advances the cursor.
    for (let page = 0; page < 10_000; page++) {
      const query = `query ($first: Int!, $after: String) { ${field}(first: $first, after: $after) { edges { node { ${subfields} } } pageInfo { hasNextPage endCursor } } }`;
      const data: Record<string, Connection<T>> = await this.gql(query, { first: this.pageSize, after });
      const conn: Connection<T> = data[field];
      out.push(...conn.edges.map((e: Edge<T>) => e.node));
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return out;
  }

  companies() {
    return this.fetchAll<TwentyCompany>("companies", COMPANY_FIELDS);
  }
  people() {
    return this.fetchAll<TwentyPerson>("people", PERSON_FIELDS);
  }
  opportunities() {
    return this.fetchAll<TwentyOpportunity>("opportunities", OPP_FIELDS);
  }
}

export class FourtyRestSink implements FourtySink {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async post<T>(path: string, input: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Fourty ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  async createCompany(input: FourtyCompanyInput) {
    return (await this.post<{ company: { id: string } }>("/api/companies", input)).company;
  }
  async createContact(input: FourtyContactInput) {
    return (await this.post<{ contact: { id: string } }>("/api/contacts", input)).contact;
  }
  async createDeal(input: FourtyDealInput) {
    return (await this.post<{ deal: { id: string } }>("/api/deals", input)).deal;
  }
}

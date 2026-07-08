import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, createWorkspace } from "./pg-setup";
import { parseEmail } from "@/lib/sync/parse-email";
import { parseIcs, parseIcsDate } from "@/lib/sync/parse-ics";
import { buildConsentUrl, exchangeCode, refreshAccessToken } from "@/lib/sync/oauth";
import { fetchRawMessages } from "@/lib/sync/fetch-mail";
import type { HttpFetcher } from "@/lib/sync/http";

const EML = [
  "Message-ID: <abc123@mail.example.com>",
  "From: Alice Example <alice@example.com>",
  "To: Me <me@myco.com>, cc-person@myco.com",
  "Subject: Project kickoff",
  "Date: Wed, 08 Jul 2026 10:00:00 +0000",
  "",
  "Hi, looking forward to the   kickoff.\nBest, Alice",
].join("\n");

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:evt-1@example.com",
  "SUMMARY:Kickoff call",
  "DESCRIPTION:Intro and scope",
  "LOCATION:Zoom",
  "DTSTART:20260708T130000Z",
  "DTEND:20260708T140000Z",
  "ATTENDEE;CN=Alice Example:mailto:alice@example.com",
  "ORGANIZER;CN=Me:mailto:me@myco.com",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("sync parsers (pure)", () => {
  it("parses an RFC822 message", () => {
    const m = parseEmail(EML);
    expect(m.messageId).toBe("abc123@mail.example.com");
    expect(m.from).toBe("alice@example.com");
    expect(m.to).toContain("me@myco.com");
    expect(m.subject).toBe("Project kickoff");
    expect(m.sentAt).toBe(Date.parse("Wed, 08 Jul 2026 10:00:00 +0000"));
    expect(m.snippet).toContain("looking forward to the kickoff"); // whitespace collapsed
    expect(m.participants).toContain("alice@example.com");
    expect(m.participants).toContain("cc-person@myco.com");
  });

  it("parses ICS VEVENTs incl. UTC datetimes and attendees", () => {
    const events = parseIcs(ICS);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.uid).toBe("evt-1@example.com");
    expect(e.title).toBe("Kickoff call");
    expect(e.location).toBe("Zoom");
    expect(e.startAt).toBe(Date.UTC(2026, 6, 8, 13, 0, 0));
    expect(e.attendees).toContain("alice@example.com");
    expect(e.attendees).toContain("me@myco.com");
  });

  it("parses all-day and floating ICS dates", () => {
    expect(parseIcsDate("20260708")).toBe(Date.UTC(2026, 6, 8));
    expect(parseIcsDate("20260708T090000")).toBe(Date.UTC(2026, 6, 8, 9, 0, 0));
  });
});

describe("sync ingestion (real handlers + Postgres + RLS)", () => {
  const TOKEN_A = "frty_sync_key_a";
  const TOKEN_B = "frty_sync_key_b";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let accounts: typeof import("@/app/api/sync/accounts/route");
  let ingest: typeof import("@/app/api/sync/accounts/[id]/ingest/route");
  let wsA: string;
  let accountId: string;
  let aliceId: string;

  const hdr = (t: string) => ({ Authorization: `Bearer ${t}`, "content-type": "application/json" });
  const req = (url: string, token: string, init?: RequestInit) =>
    new Request(`http://localhost${url}`, { headers: hdr(token), ...init });

  async function seedKey(ws: string, token: string) {
    await db.insert(tables.apiKeys).values({
      id: newId(),
      workspaceId: ws,
      name: "t",
      prefix: token.slice(0, 8),
      keyHash: sha256(token),
      createdAt: Date.now(),
    });
  }

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    accounts = await import("@/app/api/sync/accounts/route");
    ingest = await import("@/app/api/sync/accounts/[id]/ingest/route");

    wsA = await createWorkspace();
    const wsB = await createWorkspace();
    await seedKey(wsA, TOKEN_A);
    await seedKey(wsB, TOKEN_B);

    aliceId = newId();
    await withWorkspace(wsA, async () => {
      await db.insert(tables.contacts).values({
        id: aliceId,
        firstName: "Alice",
        lastName: "Example",
        email: "Alice@Example.com", // mixed case → matched case-insensitively
        status: "lead",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const create = await accounts.POST(
      req("/api/sync/accounts", TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ provider: "imap", email: "me@myco.com", config: { host: "imap.myco.com", password: "secret" } }),
      }),
    );
    accountId = (await create.json()).account.id;
  });

  it("redacts secrets from account config on read", async () => {
    const list = await accounts.GET(req("/api/sync/accounts", TOKEN_A));
    const acct = (await list.json()).accounts[0];
    expect(acct.config.host).toBe("imap.myco.com");
    expect(acct.config.password).toBeUndefined(); // secret never returned
  });

  it("ingests an email, links it to a contact, and is idempotent", async () => {
    const params = { params: Promise.resolve({ id: accountId }) };
    const first = await ingest.POST(
      req(`/api/sync/accounts/${accountId}/ingest`, TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ messages: [EML] }),
      }),
      params,
    );
    expect(first.status).toBe(200);
    const r1 = await first.json();
    expect(r1.emails).toEqual({ ingested: 1, linked: 1, duplicates: 0 });

    await withWorkspace(wsA, async () => {
      const msgs = await db.select().from(tables.emailMessages);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].contactId).toBe(aliceId);
      const acts = (await db.select().from(tables.activities)).filter(
        (a) => a.entityId === aliceId && a.type === "email",
      );
      expect(acts).toHaveLength(1);
      const alice = (await db.select().from(tables.contacts).where(eq(tables.contacts.id, aliceId)))[0];
      expect(alice.lastActivityAt).toBeGreaterThan(0);
    });

    // Re-ingest the same message → deduped, no new row/activity.
    const second = await ingest.POST(
      req(`/api/sync/accounts/${accountId}/ingest`, TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ messages: [EML] }),
      }),
      params,
    );
    expect((await second.json()).emails).toEqual({ ingested: 0, linked: 0, duplicates: 1 });
    await withWorkspace(wsA, async () => {
      expect(await db.select().from(tables.emailMessages)).toHaveLength(1);
    });
  });

  it("ingests a calendar event and links attendees to contacts", async () => {
    const params = { params: Promise.resolve({ id: accountId }) };
    const res = await ingest.POST(
      req(`/api/sync/accounts/${accountId}/ingest`, TOKEN_A, {
        method: "POST",
        body: JSON.stringify({ calendar: ICS }),
      }),
      params,
    );
    expect((await res.json()).calendar).toEqual({ ingested: 1, linked: 1, duplicates: 0 });
    await withWorkspace(wsA, async () => {
      const events = await db.select().from(tables.calendarEvents);
      expect(events).toHaveLength(1);
      expect(events[0].contactId).toBe(aliceId);
      const meetings = (await db.select().from(tables.activities)).filter(
        (a) => a.entityId === aliceId && a.type === "meeting",
      );
      expect(meetings).toHaveLength(1);
    });
  });

  it("confines sync accounts + messages to their workspace (RLS)", async () => {
    const listAsB = await accounts.GET(req("/api/sync/accounts", TOKEN_B));
    expect((await listAsB.json()).accounts).toHaveLength(0);
    // B cannot ingest into A's account (invisible → 404).
    const ingestAsB = await ingest.POST(
      req(`/api/sync/accounts/${accountId}/ingest`, TOKEN_B, {
        method: "POST",
        body: JSON.stringify({ messages: [EML] }),
      }),
      { params: Promise.resolve({ id: accountId }) },
    );
    expect(ingestAsB.status).toBe(404);
  });
});

describe("mail OAuth transport (pure + injectable edge)", () => {
  const client = { clientId: "cid", clientSecret: "secret" };

  it("builds a Google consent URL with offline access + PKCE", () => {
    const url = new URL(
      buildConsentUrl("google", client, { redirectUri: "https://app/cb", state: "st", codeChallenge: "ch", loginHint: "a@b.io" }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("gmail.readonly");
    expect(url.searchParams.get("login_hint")).toBe("a@b.io");
  });

  it("builds a Microsoft consent URL with Mail.Read + offline_access", () => {
    const url = new URL(buildConsentUrl("microsoft", client, { redirectUri: "https://app/cb", state: "st", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(url.searchParams.get("scope")).toContain("Mail.Read");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });

  it("exchanges the code and refreshes with the correct grants", async () => {
    let lastBody: string | undefined;
    const fetcher: HttpFetcher = async (_u, init) => {
      lastBody = init?.body;
      return { status: 200, json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }), text: async () => "" };
    };
    const tokens = await exchangeCode("google", client, { code: "c", redirectUri: "https://app/cb", codeVerifier: "v" }, fetcher);
    expect(tokens.access_token).toBe("at");
    let sent = new URLSearchParams(lastBody);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code_verifier")).toBe("v");
    expect(sent.get("client_secret")).toBe("secret");

    await refreshAccessToken("google", client, "rt", fetcher);
    sent = new URLSearchParams(lastBody);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("rt");
  });

  it("fetches Gmail messages (list → base64url raw decode)", async () => {
    const rawB64 = Buffer.from(EML).toString("base64url");
    const fetcher: HttpFetcher = async (url) => {
      if (url.includes("/messages?")) return { status: 200, json: async () => ({ messages: [{ id: "m1" }] }), text: async () => "" };
      if (url.includes("/messages/m1")) return { status: 200, json: async () => ({ raw: rawB64 }), text: async () => "" };
      return { status: 404, json: async () => ({}), text: async () => "" };
    };
    const raws = await fetchRawMessages("google", "tok", { limit: 10 }, fetcher);
    expect(raws).toHaveLength(1);
    expect(raws[0]).toContain("Project kickoff");
  });

  it("fetches Graph messages via $value (raw MIME)", async () => {
    const fetcher: HttpFetcher = async (url) => {
      if (url.includes("/me/messages?")) return { status: 200, json: async () => ({ value: [{ id: "g1" }] }), text: async () => "" };
      if (url.includes("/messages/g1/$value")) return { status: 200, json: async () => ({}), text: async () => EML };
      return { status: 404, json: async () => ({}), text: async () => "" };
    };
    const raws = await fetchRawMessages("microsoft", "tok", { limit: 10 }, fetcher);
    expect(raws).toHaveLength(1);
    expect(raws[0]).toContain("Project kickoff");
  });
});

describe("mail OAuth run + connect (real routes + Postgres)", () => {
  const TOKEN = "frty_mailoauth_key";
  let db: typeof import("@/db").db;
  let tables: typeof import("@/db").tables;
  let withWorkspace: typeof import("@/db").withWorkspace;
  let sha256: typeof import("@/lib/auth").sha256;
  let newId: typeof import("@/lib/id").newId;
  let setFetcher: typeof import("@/lib/sync/http").__setSyncFetcher;
  let run: typeof import("@/app/api/sync/accounts/[id]/run/route");
  let connect: typeof import("@/app/api/sync/accounts/[id]/connect/route");
  let callback: typeof import("@/app/api/sync/accounts/[id]/oauth/callback/route");
  let wsA: string;
  let accountId: string;
  let aliceId: string;

  const hdr = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
  const params = () => ({ params: Promise.resolve({ id: accountId }) });

  beforeAll(async () => {
    await resetDb();
    ({ db, tables, withWorkspace } = await import("@/db"));
    ({ sha256 } = await import("@/lib/auth"));
    ({ newId } = await import("@/lib/id"));
    ({ __setSyncFetcher: setFetcher } = await import("@/lib/sync/http"));
    run = await import("@/app/api/sync/accounts/[id]/run/route");
    connect = await import("@/app/api/sync/accounts/[id]/connect/route");
    callback = await import("@/app/api/sync/accounts/[id]/oauth/callback/route");
    process.env.GOOGLE_OAUTH_CLIENT_ID = "gid";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "gsecret";

    wsA = await createWorkspace();
    accountId = newId();
    aliceId = newId();
    await db.insert(tables.apiKeys).values({
      id: newId(), workspaceId: wsA, name: "t", prefix: TOKEN.slice(0, 8), keyHash: sha256(TOKEN), createdAt: Date.now(),
    });
    await withWorkspace(wsA, async () => {
      await db.insert(tables.contacts).values({
        id: aliceId, firstName: "Alice", lastName: "Example", email: "alice@example.com", status: "lead", createdAt: Date.now(), updatedAt: Date.now(),
      });
      await db.insert(tables.syncAccounts).values({
        id: accountId, provider: "google", email: "me@myco.com", config: JSON.stringify({ refreshToken: "r1" }), createdAt: Date.now(),
      });
    });
  });

  afterAll(() => {
    setFetcher(null);
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  });

  it("runs a Google mailbox sync: refresh → fetch → ingest → link", async () => {
    const rawB64 = Buffer.from(EML).toString("base64url");
    setFetcher(async (url) => {
      if (url.includes("oauth2.googleapis.com/token")) return { status: 200, json: async () => ({ access_token: "at", expires_in: 3600 }), text: async () => "" };
      if (url.includes("/messages?")) return { status: 200, json: async () => ({ messages: [{ id: "m1" }] }), text: async () => "" };
      if (url.includes("/messages/m1")) return { status: 200, json: async () => ({ raw: rawB64 }), text: async () => "" };
      return { status: 404, json: async () => ({}), text: async () => "" };
    });
    const res = await run.POST(
      new Request(`http://localhost/api/sync/accounts/${accountId}/run`, { method: "POST", headers: hdr }),
      params(),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).emails).toEqual({ ingested: 1, linked: 1, duplicates: 0 });

    await withWorkspace(wsA, async () => {
      const acct = (await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, accountId)))[0];
      const cfg = JSON.parse(acct.config);
      expect(cfg.accessToken).toBe("at"); // refreshed + persisted
      expect(cfg.refreshToken).toBe("r1"); // preserved across refresh
      const msgs = await db.select().from(tables.emailMessages);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].contactId).toBe(aliceId);
    });
  });

  it("connect redirects to Google consent and sets a state cookie", async () => {
    const res = await connect.GET(new Request(`http://localhost/api/sync/accounts/${accountId}/connect`, { headers: hdr }), params());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("accounts.google.com");
    expect(res.headers.get("set-cookie")).toContain("fourty_sync_oauth=");
  });

  it("callback verifies state, exchanges the code, and stores tokens", async () => {
    const startRes = await connect.GET(new Request(`http://localhost/api/sync/accounts/${accountId}/connect`, { headers: hdr }), params());
    const cookieVal = startRes.headers.get("set-cookie")!.split(";")[0].split("=").slice(1).join("="); // id:state:verifier (percent-encoded)
    const state = decodeURIComponent(cookieVal).split(":")[1];
    setFetcher(async (url) => {
      if (url.includes("oauth2.googleapis.com/token")) return { status: 200, json: async () => ({ access_token: "at2", refresh_token: "r2", expires_in: 3600 }), text: async () => "" };
      return { status: 404, json: async () => ({}), text: async () => "" };
    });
    const res = await callback.GET(
      new Request(`http://localhost/api/sync/accounts/${accountId}/oauth/callback?code=abc&state=${state}`, {
        headers: { ...hdr, cookie: `fourty_sync_oauth=${cookieVal}` },
      }),
      params(),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("sync=connected");
    await withWorkspace(wsA, async () => {
      const cfg = JSON.parse((await db.select().from(tables.syncAccounts).where(eq(tables.syncAccounts.id, accountId)))[0].config);
      expect(cfg.accessToken).toBe("at2");
      expect(cfg.refreshToken).toBe("r2");
    });
  });

  it("rejects a callback whose state does not match the cookie (CSRF)", async () => {
    const res = await callback.GET(
      new Request(`http://localhost/api/sync/accounts/${accountId}/oauth/callback?code=abc&state=forged`, {
        headers: { ...hdr, cookie: `fourty_sync_oauth=${accountId}:realstate:verifier` },
      }),
      params(),
    );
    expect(res.headers.get("location")).toContain("sync=error");
  });
});

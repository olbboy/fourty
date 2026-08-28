import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mailEnabled, mailerFromEnv, __setMailer } from "@/lib/mail";

/**
 * Transport selection and the Resend HTTP call. SMTP's own wire protocol is
 * nodemailer's problem, not ours, so what is worth pinning here is which
 * transport a given environment resolves to and the exact request Resend gets.
 */

const SMTP_KEYS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PORT", "SMTP_SECURE"] as const;
const KEYS = [...SMTP_KEYS, "RESEND_API_KEY", "MAIL_FROM"] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  __setMailer(undefined); // resolve from env, not an injected fake
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllGlobals();
});

describe("transport selection", () => {
  it("is disabled when nothing is configured", () => {
    expect(mailerFromEnv()).toBeNull();
    expect(mailEnabled()).toBe(false);
  });

  it("stays disabled on a half-filled SMTP config", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "crm@example.com";
    // no password — sending unauthenticated would be worse than staying off
    expect(mailerFromEnv()).toBeNull();
  });

  it("uses SMTP when it is fully configured", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "crm@example.com";
    process.env.SMTP_PASSWORD = "secret";
    const mailer = mailerFromEnv();
    expect(mailer?.transport).toBe("smtp:smtp.example.com");
    // From falls back to the account address.
    expect(mailer?.from).toBe("crm@example.com");
  });

  it("uses Resend when SMTP is absent", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "Fourty <noreply@send.example.com>";
    const mailer = mailerFromEnv();
    expect(mailer?.transport).toBe("resend");
    expect(mailer?.from).toBe("Fourty <noreply@send.example.com>");
  });

  it("prefers SMTP when both are configured", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "crm@example.com";
    process.env.SMTP_PASSWORD = "secret";
    process.env.RESEND_API_KEY = "re_test";
    process.env.MAIL_FROM = "crm@example.com";
    expect(mailerFromEnv()?.transport).toBe("smtp:smtp.example.com");
  });

  it("stays disabled when Resend has a key but no From to send as", () => {
    process.env.RESEND_API_KEY = "re_test";
    expect(mailerFromEnv()).toBeNull();
  });
});

describe("resend transport", () => {
  function stubFetch(response: Response) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Fourty <noreply@send.example.com>";
  });

  it("posts the message to the Resend API", async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }),
    );

    await mailerFromEnv()!.send({
      to: "invitee@example.com",
      subject: "You're invited",
      text: "plain body",
      html: "<p>html body</p>",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toEqual({
      from: "Fourty <noreply@send.example.com>",
      to: "invitee@example.com",
      subject: "You're invited",
      text: "plain body",
      html: "<p>html body</p>",
    });
  });

  it("throws with the API's explanation so the job retries and the reason is visible", async () => {
    stubFetch(
      new Response(JSON.stringify({ message: "The send.example.com domain is not verified" }), {
        status: 403,
      }),
    );

    await expect(
      mailerFromEnv()!.send({ to: "a@b.test", subject: "s", text: "t" }),
    ).rejects.toThrow(/403.*not verified/s);
  });
});

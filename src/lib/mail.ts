import { log } from "@/lib/logger";

/**
 * Outbound transactional email. Two transports, picked from the environment:
 *
 *  - SMTP (`SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD`). Preferred when it is
 *    available: the operator already has a mailbox, so an account and a password
 *    is the whole setup — no new vendor, and no change to the domain's SPF/DKIM,
 *    since mail leaves through the server that already sends for the domain.
 *  - Resend over HTTPS (`RESEND_API_KEY` + `MAIL_FROM`). For hosts that block
 *    outbound SMTP — DigitalOcean blocks ports 25/465/587 by default, and no
 *    amount of local firewall config gets around it — port 443 still works.
 *
 * OFF BY DEFAULT — the same dormant-until-env idiom as the generative layer
 * (src/lib/ai/index.ts) and OAuth mail sync (src/lib/sync/oauth.ts): configure
 * neither and `mailerFromEnv()` returns null, so every caller falls back to what
 * it did before mail existed.
 */

export type MailMessage = {
  to: string;
  subject: string;
  /** Plain-text body. Always sent — some clients never render the HTML part. */
  text: string;
  html?: string;
};

export type Mailer = {
  /** How mail leaves — `smtp:<host>` or `resend` — for logs and diagnostics. */
  transport: string;
  from: string;
  send(msg: MailMessage): Promise<void>;
};

// Test seam, mirroring __setAiClient: `undefined` = not overridden, `null` =
// force "mail disabled", a mailer = force-enabled with a capturing fake.
let override: Mailer | null | undefined;
export function __setMailer(mailer: Mailer | null | undefined): void {
  override = mailer;
}

/** True when an SMTP server is configured. */
export function mailEnabled(): boolean {
  return mailerFromEnv() !== null;
}

/**
 * Resolve a mailer from the environment, or null when SMTP is unconfigured.
 * Never throws here — a bad host surfaces at send() time, where it can be
 * retried, rather than at import time, where it would take a page down.
 */
export function mailerFromEnv(): Mailer | null {
  if (override !== undefined) return override;
  return smtpMailer() ?? resendMailer();
}

/** SMTP, when host + user + password are all present. */
function smtpMailer(): Mailer | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  // All three or nothing: a half-filled config is a deployment mistake, and
  // silently sending unauthenticated would be worse than staying off.
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  // Implicit TLS on 465, STARTTLS on 587/25. Overridable for the rare server
  // that disagrees with its own port number.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "1" : port === 465;
  const from = process.env.MAIL_FROM ?? user;

  return {
    transport: `smtp:${host}`,
    from,
    send: (msg) => smtpSend({ host, port, secure, user, pass, from }, msg),
  };
}

/** Resend over HTTPS, for hosts whose provider blocks outbound SMTP. */
function resendMailer(): Mailer | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;

  // Unlike SMTP there is no account address to fall back on, so a From must be
  // configured. Warn rather than fail silently — this combination is always a
  // misconfiguration, never a deliberate "mail off".
  const from = process.env.MAIL_FROM;
  if (!from) {
    log().warn("RESEND_API_KEY is set but MAIL_FROM is not — mail stays disabled");
    return null;
  }

  return { transport: "resend", from, send: (msg) => resendSend(key, from, msg) };
}

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

// One pooled transport per process. Re-creating it per message would open a new
// TCP+TLS connection for every send, which providers rate-limit as abuse.
const globalForMail = globalThis as unknown as {
  __fourtyMailTransport?: { key: string; transport: import("nodemailer").Transporter };
};

async function smtpSend(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  const key = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
  let cached = globalForMail.__fourtyMailTransport;

  if (!cached || cached.key !== key) {
    // Imported lazily so the SMTP client stays out of any bundle that never
    // sends mail (and out of the graph entirely when SMTP is unconfigured).
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      pool: true,
      maxConnections: 2,
    });
    cached = { key, transport };
    globalForMail.__fourtyMailTransport = cached;
  }

  await cached.transport.sendMail({
    from: cfg.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
  // Recipient is logged; the body is not — invite mail carries a live token.
  log().info({ to: msg.to, transport: `smtp:${cfg.host}` }, "mail sent");
}

async function resendSend(apiKey: string, from: string, msg: MailMessage): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });

  if (!res.ok) {
    // Body first, status second: Resend explains refusals ("domain is not
    // verified") in the body, and that is the sentence an operator needs. Throw
    // so pg-boss retries — a 4xx will exhaust its retries and dead-letter, which
    // is the visible outcome we want for a misconfiguration.
    const detail = await res.text().catch(() => "");
    throw new Error(`resend responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`);
  }

  const { id } = (await res.json().catch(() => ({}))) as { id?: string };
  log().info({ to: msg.to, transport: "resend", id }, "mail sent");
}
